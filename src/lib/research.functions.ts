import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { serverConfig } from "./config";

const ResearchInput = z.object({
  query: z.string().min(1).max(600),
});

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type YouTubeVideo = {
  title: string;
  url: string;
  channel: string;
  date: string;
  imageUrl: string;
};

export type ResearchContext = {
  context: string;
  sources: SearchResult[];
  searchSource: string;
  youtubeVideos: YouTubeVideo[];
};

async function tryTavily(query: string, key: string): Promise<ResearchContext | null> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "advanced",
        include_answer: true,
        max_results: 8,
      }),
      signal: AbortSignal.timeout(16000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      answer?: string;
      results?: { title: string; url: string; content: string }[];
    };
    if (!data.results?.length) return null;
    const sources: SearchResult[] = data.results.map((r) => ({
      title: r.title || "Untitled",
      url: r.url || "",
      snippet: (r.content || "").slice(0, 450),
    }));
    const parts: string[] = [];
    if (data.answer) parts.push(`Direct Answer: ${data.answer}`);
    sources.forEach((s, i) => {
      parts.push(`[Source ${i + 1}] ${s.title}\n${s.snippet}\nURL: ${s.url}`);
    });
    return { context: parts.join("\n\n"), sources, searchSource: "Tavily", youtubeVideos: [] };
  } catch {
    return null;
  }
}

async function trySerper(query: string, key: string): Promise<ResearchContext | null> {
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": key },
      body: JSON.stringify({ q: query, num: 8 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      answerBox?: { answer?: string; snippet?: string };
      knowledgeGraph?: { description?: string };
      organic?: { title: string; link: string; snippet: string }[];
    };
    const organic = data.organic || [];
    if (!organic.length) return null;
    const sources: SearchResult[] = organic.map((r) => ({
      title: r.title || "Untitled",
      url: r.link || "",
      snippet: r.snippet || "",
    }));
    const parts: string[] = [];
    const quickAns = data.answerBox?.answer || data.answerBox?.snippet || data.knowledgeGraph?.description;
    if (quickAns) parts.push(`Direct Answer: ${quickAns}`);
    sources.forEach((s, i) => {
      parts.push(`[Source ${i + 1}] ${s.title}\n${s.snippet}\nURL: ${s.url}`);
    });
    return { context: parts.join("\n\n"), sources, searchSource: "Serper", youtubeVideos: [] };
  } catch {
    return null;
  }
}

type RawVideoItem = {
  title?: string;
  link?: string;
  channel?: string;
  date?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
};

async function fetchVideoResults(q: string, key: string, num: number): Promise<YouTubeVideo[]> {
  try {
    const res = await fetch("https://google.serper.dev/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": key },
      body: JSON.stringify({ q, num }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { videos?: RawVideoItem[] };
    return (data.videos ?? [])
      .map((v) => ({
        title: v.title || "Untitled",
        url: v.link || "",
        channel: v.channel || "",
        date: v.date || "",
        imageUrl: v.imageUrl || v.thumbnailUrl || "",
      }))
      .filter((v) => {
        try {
          const host = new URL(v.url).hostname;
          return host.includes("youtube.com") || host.includes("youtu.be");
        } catch { return false; }
      });
  } catch {
    return [];
  }
}

async function searchYouTubeVideos(query: string, key: string): Promise<YouTubeVideo[]> {
  // Run two searches in parallel: global best results + India-focused results
  const [global, india] = await Promise.all([
    fetchVideoResults(query, key, 8),
    fetchVideoResults(`${query} India`, key, 6),
  ]);

  // Interleave: global[0], india[0], global[1], india[1], … then dedup by URL, take top 5
  const seen = new Set<string>();
  const merged: YouTubeVideo[] = [];
  const maxLen = Math.max(global.length, india.length);
  for (let i = 0; i < maxLen && merged.length < 7; i++) {
    if (i < global.length && !seen.has(global[i].url)) {
      seen.add(global[i].url);
      merged.push(global[i]);
    }
    if (i < india.length && !seen.has(india[i].url)) {
      seen.add(india[i].url);
      merged.push(india[i]);
    }
  }
  return merged.slice(0, 5);
}

export const deepResearchServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ResearchInput.parse(d))
  .handler(async ({ data }): Promise<ResearchContext> => {
    const serperKey = serverConfig.search.serperKey;
    const tavilyKey = serverConfig.search.tavilyKey;

    // Run web search and YouTube search in parallel
    const [webResult, youtubeVideos] = await Promise.all([
      (async () => {
        let result: ResearchContext | null = null;
        if (tavilyKey) result = await tryTavily(data.query, tavilyKey);
        if (!result && serperKey) result = await trySerper(data.query, serperKey);
        return result;
      })(),
      serperKey ? searchYouTubeVideos(data.query, serperKey) : Promise.resolve([] as YouTubeVideo[]),
    ]);

    if (webResult) {
      return { ...webResult, youtubeVideos };
    }

    return {
      context: `Research topic: "${data.query}". No live web results available — use training knowledge only.`,
      sources: [],
      searchSource: "AI Knowledge",
      youtubeVideos,
    };
  });
