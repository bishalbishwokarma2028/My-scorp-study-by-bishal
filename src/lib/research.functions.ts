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
  views?: string | number;
  duration?: string;
};

// Well-known, high-subscriber Indian education/knowledge YouTube channels.
// Used to boost trusted, high-quality Indian results above generic ones.
const TRUSTED_INDIAN_CHANNELS = [
  "physics wallah", "unacademy", "byju", "khan academy india", "vedantu",
  "study iq", "studyiq", "dr. vivek bindra", "exam warrior", "gate smashers",
  "neso academy", "5 minutes engineering", "apni kaksha", "magnet brains",
  "let's crack it", "know india", "wifistudy", "testbook", "toppr",
  "amit sengupta", "conceptual physics", "chemistry made easy", "the fact neza",
  "success cds", "drishti ias", "study channel", "cec", "nptel",
];

function isLikelyLowQuality(title: string, channel: string): boolean {
  const t = `${title} ${channel}`.toLowerCase();
  return /clickbait|prank|reaction only|full movie|leaked/.test(t);
}

function parseViewCount(views: string | number | undefined): number {
  if (typeof views === "number") return views;
  if (!views) return 0;
  const s = views.toLowerCase().replace(/views?/, "").trim();
  const num = parseFloat(s);
  if (Number.isNaN(num)) return 0;
  if (s.includes("m")) return num * 1_000_000;
  if (s.includes("k")) return num * 1_000;
  return num;
}

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
        _views: parseViewCount(v.views),
      }))
      .filter((v) => {
        if (isLikelyLowQuality(v.title, v.channel)) return false;
        try {
          const host = new URL(v.url).hostname;
          return host.includes("youtube.com") || host.includes("youtu.be");
        } catch { return false; }
      });
  } catch {
    return [];
  }
}

function isTrustedIndianChannel(channel: string): boolean {
  const c = channel.toLowerCase();
  return TRUSTED_INDIAN_CHANNELS.some((name) => c.includes(name));
}

async function searchYouTubeVideos(query: string, key: string): Promise<YouTubeVideo[]> {
  // Run two searches in parallel: global best results + India-focused results
  const [global, india] = await Promise.all([
    fetchVideoResults(query, key, 8),
    fetchVideoResults(`${query} India`, key, 8),
  ]);

  const seen = new Set<string>();
  const all = [...global, ...india].filter((v) => {
    if (seen.has(v.url)) return false;
    seen.add(v.url);
    return true;
  }) as (YouTubeVideo & { _views?: number })[];

  // Rank: trusted Indian education channels first, then by view count,
  // so we surface high-quality, well-watched, relevant videos only —
  // never random or unrelated clips.
  all.sort((a, b) => {
    const aTrusted = isTrustedIndianChannel(a.channel) ? 1 : 0;
    const bTrusted = isTrustedIndianChannel(b.channel) ? 1 : 0;
    if (aTrusted !== bTrusted) return bTrusted - aTrusted;
    return (b._views ?? 0) - (a._views ?? 0);
  });

  return all.slice(0, 5).map(({ title, url, channel, date, imageUrl }) => ({ title, url, channel, date, imageUrl }));
}

export const deepResearchServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ResearchInput.parse(d))
  .handler(async ({ data }): Promise<ResearchContext> => {
    const serperKey = serverConfig.search.serperKey;
    const tavilyKeys = serverConfig.search.tavilyKeys;

    // Run web search and YouTube search in parallel
    const [webResult, youtubeVideos] = await Promise.all([
      (async () => {
        let result: ResearchContext | null = null;
        // Try every configured Tavily key in order before giving up on Tavily
        for (const key of tavilyKeys) {
          result = await tryTavily(data.query, key);
          if (result) break;
        }
        // All Tavily keys failed/exhausted (or none configured) — fall back to Serper
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
