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

async function tryTavily(query: string, key: string): Promise<SearchResult[] | null> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    const results = data.results ?? [];
    if (!results.length) return null;
    return results.map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.content ?? "",
    }));
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
