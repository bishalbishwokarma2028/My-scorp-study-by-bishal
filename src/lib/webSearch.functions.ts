import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { serverConfig } from "./config";

const SearchInput = z.object({
  query: z.string().min(1).max(500),
});

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

const NEWS_KEYWORDS = [
  "news", "match", "score", "result", "today", "yesterday", "latest",
  "election", "cricket", "football", "soccer", "politics", "breaking",
  "trending", "viral", "war", "disaster", "weather", "winner", "standings",
];

function isNewsQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return NEWS_KEYWORDS.some((kw) => lower.includes(kw));
}

async function tryTavily(query: string, key: string): Promise<SearchResult[] | null> {
  try {
    const newsQuery = isNewsQuery(query);
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "advanced",
        max_results: 8,
        include_answer: true,
        include_raw_content: false,
        ...(newsQuery ? { topic: "news" } : {}),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      answer?: string;
      results?: { title?: string; url?: string; content?: string; published_date?: string }[];
    };
    const results = data.results ?? [];
    if (!results.length) return null;
    const mapped = results.map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: [r.published_date ? `[Published: ${r.published_date}]` : "", r.content ?? ""].filter(Boolean).join(" "),
    }));
    if (data.answer) {
      mapped.unshift({ title: "Quick Answer", url: "", snippet: `DIRECT ANSWER: ${data.answer}` });
    }
    return mapped;
  } catch {
    return null;
  }
}

async function trySerper(query: string, key: string): Promise<SearchResult[] | null> {
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": key,
      },
      body: JSON.stringify({ q: query, num: 5 }),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      organic?: { title?: string; link?: string; snippet?: string }[];
    };
    const results = data.organic ?? [];
    if (!results.length) return null;
    return results.map((r) => ({
      title: r.title ?? "",
      url: r.link ?? "",
      snippet: r.snippet ?? "",
    }));
  } catch {
    return null;
  }
}

function formatResults(results: SearchResult[]): string {
  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`,
    )
    .join("\n\n");
}

export const webSearchServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SearchInput.parse(d))
  .handler(async ({ data }): Promise<{ context: string; used: boolean }> => {
    let results: SearchResult[] | null = null;

    if (serverConfig.search.tavilyKey) {
      results = await tryTavily(data.query, serverConfig.search.tavilyKey);
    }

    if (!results && serverConfig.search.serperKey) {
      results = await trySerper(data.query, serverConfig.search.serperKey);
    }

    if (!results || results.length === 0) {
      return { context: "", used: false };
    }

    return { context: formatResults(results), used: true };
  });
