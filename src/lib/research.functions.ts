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

export type ResearchContext = {
  context: string;
  sources: SearchResult[];
  searchSource: string;
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
    return { context: parts.join("\n\n"), sources, searchSource: "Tavily" };
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
    return { context: parts.join("\n\n"), sources, searchSource: "Serper" };
  } catch {
    return null;
  }
}

export const deepResearchServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ResearchInput.parse(d))
  .handler(async ({ data }): Promise<ResearchContext> => {
    let result: ResearchContext | null = null;

    if (serverConfig.search.tavilyKey) {
      result = await tryTavily(data.query, serverConfig.search.tavilyKey);
    }
    if (!result && serverConfig.search.serperKey) {
      result = await trySerper(data.query, serverConfig.search.serperKey);
    }

    if (result) return result;

    return {
      context: `Research topic: "${data.query}". No live web results available — use training knowledge only.`,
      sources: [],
      searchSource: "AI Knowledge",
    };
  });
