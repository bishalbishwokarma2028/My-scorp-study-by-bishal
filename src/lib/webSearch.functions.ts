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

async function tryPerplexity(query: string, key: string): Promise<string | null> {
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
              content: `Today is ${currentDateStr()}. You are a real-time web search tool. Return specific, factual, current information. For sports: exact scores, teams, tournament, date. For news: who, what, when, where. For politics: current status and date. Include source name or URL.`,
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
        return `[Live Web Search — ${currentDateStr()}]\n\n${text}`;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function tryDuckDuckGo(query: string): Promise<string | null> {
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

    const parts: string[] = [`[Web Lookup — ${currentDateStr()}]`];

    if (data.Answer) parts.push(`✅ Direct Answer: ${data.Answer}`);
    if (data.Abstract) parts.push(`Summary: ${data.Abstract}`);
    if (data.Definition) parts.push(`Definition: ${data.Definition}`);
    if (data.AbstractSource && data.AbstractURL) {
      parts.push(`Source: ${data.AbstractSource} — ${data.AbstractURL}`);
    }
    if (data.Infobox?.content?.length) {
      const facts = data.Infobox.content
        .filter((c) => c.label && c.value)
        .slice(0, 8)
        .map((c) => `${c.label}: ${c.value}`)
        .join("\n");
      if (facts) parts.push(`Key Facts:\n${facts}`);
    }
    const related = (data.RelatedTopics ?? [])
      .filter((t) => t.Text)
      .slice(0, 5)
      .map((t) => `• ${t.Text}`)
      .join("\n");
    if (related) parts.push(`Related:\n${related}`);

    if (parts.length > 1) return parts.join("\n\n");
    return null;
  } catch {
    return null;
  }
}

export const webSearchServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SearchInput.parse(d))
  .handler(async ({ data }): Promise<{ context: string; used: boolean }> => {
    const today = currentDateStr();

    if (serverConfig.ai.openrouterKey) {
      const result = await tryPerplexity(data.query, serverConfig.ai.openrouterKey);
      if (result) return { context: result, used: true };
    }

    const ddg = await tryDuckDuckGo(data.query);
    if (ddg) return { context: ddg, used: true };

    return {
      context: `[Current date: ${today}]\n\nReal-time web search is temporarily unavailable. Answer from your training knowledge. Clearly state today's date when relevant. Do NOT guess about live scores, current events, or breaking news — tell the student what you know up to your knowledge cutoff and acknowledge you cannot see today's live data.`,
      used: true,
    };
  });
