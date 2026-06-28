import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cacheGet, cacheSet } from "./aiCache";
import { serverConfig } from "./config";

const Input = z.object({
  prompt: z.string().min(1).max(50000),
  systemPrompt: z.string().max(12000).optional(),
});

type Result = { text: string; provider: string };

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

async function tryGroq(prompt: string, system: string, key: string): Promise<Result | null> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: 2048,
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
): Promise<Result | null> {
  try {
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
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: 2048,
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

async function tryGemini(prompt: string, system: string, key: string): Promise<Result | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${system}\n\n${prompt}` }] }],
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
      data.systemPrompt ?? "You are Bishal's Assistant — an elite AI study tutor built into ScorpStudy by Bishal Bishwokarma.";

    const cached = cacheGet(data.prompt);
    if (cached) {
      return { text: cached.answer, provider: "Bishal's Assistant" };
    }

    let result: Result | null = null;

    // 1. Groq primary keys (1–5)
    for (const key of serverConfig.ai.groqPrimaryKeys) {
      result = await tryGroq(data.prompt, system, key);
      if (result) break;
    }

    // 2. Groq secondary keys (6–7)
    if (!result) {
      for (const key of serverConfig.ai.groqSecondaryKeys) {
        result = await tryGroq(data.prompt, system, key);
        if (result) break;
      }
    }

    // 3. OpenRouter — Claude 3 Haiku, then GPT-3.5 Turbo
    if (!result && serverConfig.ai.openrouterKey) {
      result = await tryOpenRouter(
        data.prompt,
        system,
        serverConfig.ai.openrouterKey,
        "anthropic/claude-3-haiku",
      );
    }
    if (!result && serverConfig.ai.openrouterKey) {
      result = await tryOpenRouter(
        data.prompt,
        system,
        serverConfig.ai.openrouterKey,
        "openai/gpt-3.5-turbo",
      );
    }

    // 4. Gemini keys (1–5)
    if (!result) {
      for (const key of serverConfig.ai.geminiKeys) {
        result = await tryGemini(data.prompt, system, key);
        if (result) break;
      }
    }

    // 5. Hugging Face (final fallback)
    if (!result && serverConfig.ai.huggingfaceKey) {
      result = await tryHuggingFace(data.prompt, system, serverConfig.ai.huggingfaceKey);
    }

    if (result) {
      cacheSet(data.prompt, result.text, result.provider);
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

export const analyzeImageServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => VisionInput.parse(d))
  .handler(async ({ data }): Promise<Result> => {
    for (const key of serverConfig.ai.geminiKeys) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: `You are Bishal's Assistant — an expert study AI. ${data.prompt}` },
                  { inlineData: { mimeType: data.mimeType, data: data.imageBase64 } },
                ],
              }],
            }),
          },
        );
        const body = await res.text();
        if (!res.ok) continue;
        const parsed = JSON.parse(body);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text === "string" && text.trim()) return { text, provider: "Bishal's Assistant" };
      } catch {
        continue;
      }
    }
    return { text: "Could not analyze the image. Please try again.", provider: "Bishal's Assistant" };
  });
