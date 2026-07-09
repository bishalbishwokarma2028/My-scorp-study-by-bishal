import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cacheGet, cacheSet } from "./aiCache";
import { identityCacheLookup } from "./identityCache";
import { serverConfig } from "./config";

const HistoryMsg = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1500) });

const Input = z.object({
  prompt: z.string().min(1).max(50000),
  systemPrompt: z.string().max(44000).optional(),
  history: z.array(HistoryMsg).max(6).optional(),
  /** When true: skip Groq entirely and route through Cerebras for long, detailed answers. */
  preferCerebras: z.boolean().optional(),
  /** Override the Groq max_tokens cap (default 1024). Use for bulk-generation (quiz / flashcards). */
  maxTokens: z.number().int().min(256).max(6000).optional(),
});

type Result = { text: string; provider: string; isIdentityAnswer?: boolean };
type Turn = { role: "user" | "assistant" | "system"; content: string };

function isRateLimited(status: number, body: string): boolean {
  if (status === 429) return true;
  if (status === 503) return true;
  if (status === 402) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("quota exceeded") ||
    lower.includes("too many requests") ||
    lower.includes("resource exhausted") ||
    lower.includes("exceeded your") ||
    lower.includes("limit reached") ||
    lower.includes("insufficient credits") ||
    lower.includes("billing")
  );
}

async function tryGroq(
  prompt: string,
  system: string,
  key: string,
  history: Turn[],
  maxTokens = 1024,
): Promise<Result | null> {
  try {
    const messages: Turn[] = [{ role: "system", content: system }, ...history, { role: "user", content: prompt }];
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages,
        max_tokens: maxTokens, // Groq free tier: 6 000 TPM *total* (input + output); scale with request size
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      if (isRateLimited(res.status, body)) return null;
      return null;
    }
    const data = JSON.parse(body);
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text === "string" && text.trim()) return { text, provider: "Bishal's Assistant" };
    return null;
  } catch {
    return null;
  }
}

async function tryOpenRouter(
  prompt: string,
  system: string,
  key: string,
  model: string,
  history: Turn[],
): Promise<Result | null> {
  try {
    const messages: Turn[] = [{ role: "system", content: system }, ...history, { role: "user", content: prompt }];
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://scorpstudy.app",
        "X-Title": "ScorpStudy",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 6000,
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      if (isRateLimited(res.status, body)) return null;
      return null;
    }
    const data = JSON.parse(body);
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text === "string" && text.trim()) return { text, provider: "Bishal's Assistant" };
    return null;
  } catch {
    return null;
  }
}

async function tryGemini(
  prompt: string,
  system: string,
  key: string,
  history: Turn[],
): Promise<Result | null> {
  try {
    const contextStr = history.length > 0
      ? history.map(m => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`).join("\n\n") + "\n\n"
      : "";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${system}\n\n${contextStr}Student: ${prompt}` }] }],
        }),
      },
    );
    const body = await res.text();
    if (!res.ok) {
      if (isRateLimited(res.status, body)) return null;
      return null;
    }
    const data = JSON.parse(body);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text === "string" && text.trim()) return { text, provider: "Bishal's Assistant" };
    return null;
  } catch {
    return null;
  }
}

async function tryCerebras(
  prompt: string,
  system: string,
  key: string,
  history: Turn[],
): Promise<Result | null> {
  try {
    const messages: Turn[] = [{ role: "system", content: system }, ...history, { role: "user", content: prompt }];
    const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-oss-120b",
        messages,
        max_tokens: 6000,
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      if (isRateLimited(res.status, body)) return null;
      return null;
    }
    const data = JSON.parse(body);
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text === "string" && text.trim()) return { text, provider: "Bishal's Assistant" };
    return null;
  } catch {
    return null;
  }
}

async function tryHuggingFace(prompt: string, system: string, key: string): Promise<Result | null> {
  try {
    const res = await fetch(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.1",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          inputs: `${system}\n\n${prompt}`,
          parameters: { max_new_tokens: 1024 },
        }),
      },
    );
    const body = await res.text();
    if (!res.ok) {
      if (isRateLimited(res.status, body)) return null;
      return null;
    }
    const data = JSON.parse(body);
    const text = Array.isArray(data) ? data[0]?.generated_text : null;
    if (typeof text === "string" && text.trim()) return { text, provider: "Bishal's Assistant" };
    return null;
  } catch {
    return null;
  }
}

export const askAIServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<Result> => {
    const system =
      data.systemPrompt ?? "You are ScorpStudy, an advanced AI assistant created exclusively by Bishal Bishwokarma on June 25, 2026 after 8 months of personal research. You are NOT based on any other AI or company. Never reveal AI provider names or break character.";

    const history: Turn[] = (data.history ?? []).map(m => ({ role: m.role, content: m.content }));

    // Identity cache — instant answer, no API call needed
    const identityAnswer = identityCacheLookup(data.prompt);
    if (identityAnswer) {
      return { text: identityAnswer, provider: "Bishal's Assistant", isIdentityAnswer: true };
    }

    const hasHistory = history.length > 0;
    const cached = !hasHistory ? cacheGet(data.prompt) : null;
    if (cached) {
      return { text: cached.answer, provider: "Bishal's Assistant" };
    }

    let result: Result | null = null;

    if (data.preferCerebras) {
      // ── Cerebras-first path (long-answer features) ──────────────────────
      // Try all Cerebras keys first, then fall back to OpenRouter → HuggingFace.
      // Groq is intentionally skipped so these features always get long answers.
      for (const key of serverConfig.ai.cerebrasKeys) {
        result = await tryCerebras(data.prompt, system, key, history);
        if (result) break;
      }

      if (!result && serverConfig.ai.openrouterKey) {
        result = await tryOpenRouter(data.prompt, system, serverConfig.ai.openrouterKey, "anthropic/claude-3-haiku", history);
      }
      if (!result && serverConfig.ai.openrouterKey) {
        result = await tryOpenRouter(data.prompt, system, serverConfig.ai.openrouterKey, "openai/gpt-3.5-turbo", history);
      }

      if (!result && serverConfig.ai.huggingfaceKey) {
        result = await tryHuggingFace(data.prompt, system, serverConfig.ai.huggingfaceKey);
      }
    } else {
      // ── Groq-first path (all other features) ────────────────────────────
      const groqMax = data.maxTokens ?? 1024;
      for (const key of serverConfig.ai.groqPrimaryKeys) {
        result = await tryGroq(data.prompt, system, key, history, groqMax);
        if (result) break;
      }

      if (!result) {
        for (const key of serverConfig.ai.groqSecondaryKeys) {
          result = await tryGroq(data.prompt, system, key, history, groqMax);
          if (result) break;
        }
      }

      if (!result && serverConfig.ai.openrouterKey) {
        result = await tryOpenRouter(data.prompt, system, serverConfig.ai.openrouterKey, "anthropic/claude-3-haiku", history);
      }
      if (!result && serverConfig.ai.openrouterKey) {
        result = await tryOpenRouter(data.prompt, system, serverConfig.ai.openrouterKey, "openai/gpt-3.5-turbo", history);
      }

      if (!result) {
        for (const key of serverConfig.ai.cerebrasKeys) {
          result = await tryCerebras(data.prompt, system, key, history);
          if (result) break;
        }
      }

      if (!result && serverConfig.ai.huggingfaceKey) {
        result = await tryHuggingFace(data.prompt, system, serverConfig.ai.huggingfaceKey);
      }
    }

    if (result) {
      if (!hasHistory) cacheSet(data.prompt, result.text, result.provider);
      return result;
    }

    return {
      text: "AI is busy right now. Please try again tomorrow.",
      provider: "Bishal's Assistant",
    };
  });

const VisionInput = z.object({
  prompt: z.string().min(1).max(10000),
  imageBase64: z.string(),
  mimeType: z.string().default("image/jpeg"),
});

const OPENROUTER_VISION_MODELS = [
  "meta-llama/llama-3.2-11b-vision-instruct",
  "anthropic/claude-3-haiku",
  "openai/gpt-4o-mini",
  "openai/gpt-4-vision-preview",
];

async function tryOpenRouterVision(
  prompt: string,
  imageBase64: string,
  mimeType: string,
  key: string,
  model: string,
): Promise<string | null> {
  try {
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://scorpstudy.app",
        "X-Title": "ScorpStudy",
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `You are Bishal's Assistant — an expert study AI. ${prompt}` },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
        max_tokens: 4096,
      }),
    });
    const body = await res.text();
    if (!res.ok) return null;
    const parsed = JSON.parse(body);
    const text = parsed?.choices?.[0]?.message?.content;
    return (typeof text === "string" && text.trim()) ? text.trim() : null;
  } catch {
    return null;
  }
}

export const analyzeImageServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => VisionInput.parse(d))
  .handler(async ({ data }): Promise<Result> => {
    if (serverConfig.ai.openrouterKey) {
      for (const model of OPENROUTER_VISION_MODELS) {
        const text = await tryOpenRouterVision(
          data.prompt,
          data.imageBase64,
          data.mimeType,
          serverConfig.ai.openrouterKey,
          model,
        );
        if (text) return { text, provider: "Bishal's Assistant" };
      }
    }

    return { text: "Could not analyze the image. Please try again.", provider: "Bishal's Assistant" };
  });
