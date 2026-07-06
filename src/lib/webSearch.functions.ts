import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { serverConfig } from "./config";

const SearchInput = z.object({
  query: z.string().min(1).max(500),
});

function currentDateStr(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type SourcedResult = { context: string; sourceCount: number } | null;

// Tavily — real-time search engine, tried first with each configured key
// in order (falls to the next key if one is rate-limited/exhausted).
async function tryTavily(query: string, key: string): Promise<SourcedResult> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query: `${query} ${currentDateStr()}`,
        search_depth: "advanced",
        include_answer: true,
        max_results: 6,
      }),
      signal: AbortSignal.timeout(14000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      answer?: string;
      results?: { title: string; url: string; content: string; published_date?: string }[];
    };
    const results = data.results || [];
    if (!results.length) return null;
    const parts: string[] = [`[Live Web Search (Tavily) — ${currentDateStr()}]`];
    if (data.answer) parts.push(`Direct Answer: ${data.answer}`);
    results.forEach((r, i) => {
      parts.push(
        `[Source ${i + 1}] ${r.title || "Untitled"}${r.published_date ? ` (${r.published_date})` : ""}\n${(r.content || "").slice(0, 500)}\nURL: ${r.url}`,
      );
    });
    return { context: parts.join("\n\n"), sourceCount: results.length };
  } catch {
    return null;
  }
}

// Serper (Google search) — used if all Tavily keys fail/exhaust.
async function trySerper(query: string, key: string): Promise<SourcedResult> {
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
      organic?: { title: string; link: string; snippet: string; date?: string }[];
    };
    const organic = data.organic || [];
    if (!organic.length) return null;
    const parts: string[] = [`[Live Web Search (Google/Serper) — ${currentDateStr()}]`];
    const quickAns = data.answerBox?.answer || data.answerBox?.snippet || data.knowledgeGraph?.description;
    if (quickAns) parts.push(`Direct Answer: ${quickAns}`);
    organic.forEach((r, i) => {
      parts.push(
        `[Source ${i + 1}] ${r.title || "Untitled"}${r.date ? ` (${r.date})` : ""}\n${r.snippet || ""}\nURL: ${r.link}`,
      );
    });
    return { context: parts.join("\n\n"), sourceCount: organic.length };
  } catch {
    return null;
  }
}

// Perplexity (via OpenRouter) — an AI model with built-in live browsing,
// used as a secondary cross-check / fallback if Tavily & Serper are unavailable.
async function tryPerplexity(query: string, key: string): Promise<SourcedResult> {
  const models = ["perplexity/sonar", "perplexity/sonar-small-online"];
  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "HTTP-Referer": "https://scorpstudy.in.net",
          "X-Title": "ScorpStudy",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: `Today is ${currentDateStr()}. You are a real-time web search tool. Return specific, factual, current information with source URLs. For sports: exact scores, teams, tournament, date. For news: who, what, when, where. For politics: current status and date. Never fabricate a fact — if unsure, say so explicitly.`,
            },
            { role: "user", content: query },
          ],
          max_tokens: 900,
        }),
        signal: AbortSignal.timeout(12000),
      });
      const body = await res.text();
      if (!res.ok) continue;
      const data = JSON.parse(body);
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text === "string" && text.trim().length > 30) {
        return { context: `[Live Web Search (Perplexity) — ${currentDateStr()}]\n\n${text}`, sourceCount: 1 };
      }
    } catch {
      continue;
    }
  }
  return null;
}

// DuckDuckGo instant-answer API — last resort only. Weak for breaking
// news/live scores, but occasionally has a definition/infobox hit.
async function tryDuckDuckGo(query: string): Promise<SourcedResult> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "ScorpStudy/1.0 (educational assistant)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      Answer?: string;
      Abstract?: string;
      Definition?: string;
      AbstractSource?: string;
      AbstractURL?: string;
      RelatedTopics?: { Text?: string }[];
      Infobox?: { content?: { label?: string; value?: string }[] };
    };

    const parts: string[] = [`[Web Lookup (DuckDuckGo) — ${currentDateStr()}]`];
    let hits = 0;

    if (data.Answer) { parts.push(`✅ Direct Answer: ${data.Answer}`); hits++; }
    if (data.Abstract) { parts.push(`Summary: ${data.Abstract}`); hits++; }
    if (data.Definition) { parts.push(`Definition: ${data.Definition}`); hits++; }
    if (data.AbstractSource && data.AbstractURL) {
      parts.push(`Source: ${data.AbstractSource} — ${data.AbstractURL}`);
    }
    if (data.Infobox?.content?.length) {
      const facts = data.Infobox.content
        .filter((c) => c.label && c.value)
        .slice(0, 8)
        .map((c) => `${c.label}: ${c.value}`)
        .join("\n");
      if (facts) { parts.push(`Key Facts:\n${facts}`); hits++; }
    }
    const related = (data.RelatedTopics ?? [])
      .filter((t) => t.Text)
      .slice(0, 5)
      .map((t) => `• ${t.Text}`)
      .join("\n");
    if (related) parts.push(`Related:\n${related}`);

    if (hits === 0) return null;
    return { context: parts.join("\n\n"), sourceCount: hits };
  } catch {
    return null;
  }
}

export const webSearchServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SearchInput.parse(d))
  .handler(async ({ data }): Promise<{ context: string; used: boolean }> => {
    const today = currentDateStr();
    const { tavilyKeys, serperKey } = serverConfig.search;
    const { openrouterKey } = serverConfig.ai;

    // 1) Tavily — try every configured key before giving up on it
    for (const key of tavilyKeys) {
      const result = await tryTavily(data.query, key);
      if (result) return { context: result.context, used: true };
    }

    // 2) Serper (Google) — fallback once all Tavily keys are exhausted
    if (serperKey) {
      const result = await trySerper(data.query, serperKey);
      if (result) return { context: result.context, used: true };
    }

    // 3) Perplexity via OpenRouter — AI model with live browsing
    if (openrouterKey) {
      const result = await tryPerplexity(data.query, openrouterKey);
      if (result) return { context: result.context, used: true };
    }

    // 4) DuckDuckGo — last resort, weak for live scores/breaking news
    const ddg = await tryDuckDuckGo(data.query);
    if (ddg) return { context: ddg.context, used: true };

    return {
      context: `[Current date: ${today}]\n\nReal-time web search is temporarily unavailable from all configured sources. Answer from your training knowledge. Clearly state today's date when relevant. Do NOT guess about live scores, current events, or breaking news — tell the student what you know up to your knowledge cutoff and explicitly acknowledge you cannot see today's live data.`,
      used: true,
    };
  });
