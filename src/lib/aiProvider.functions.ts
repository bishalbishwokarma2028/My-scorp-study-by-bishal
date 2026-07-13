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
  /** When true: route through the Cerebras-first path (long-answer features). */
  preferCerebras: z.boolean().optional(),
  /** Override the Groq max_tokens cap (default 1024). Use for bulk-generation (quiz / flashcards). */
  maxTokens: z.number().int().min(256).max(6000).optional(),
});

/**
 * Rotating pointer per key-pool so consecutive requests spread across all
 * available keys instead of always hammering key #1 first. On a rate-limit
 * or failure we still fall through the rest of the pool in order starting
 * from the rotated position.
 */
const rotationPointers = new Map<string, number>();

function rotatedKeys(poolName: string, keys: string[]): string[] {
  if (keys.length === 0) return keys;
  const start = (rotationPointers.get(poolName) ?? 0) % keys.length;
  rotationPointers.set(poolName, (start + 1) % keys.length);
  return [...keys.slice(start), ...keys.slice(0, start)];
}

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

// ── Math verification ─────────────────────────────────────────────────────────
// Independently solves any math/science problem to check a proposed answer.
// Used internally by analyzeImageServer and exported via verifyMathServer so the
// Solver can call it after askAIJSON. All three features then converge on the same
// verified answer regardless of which model produced the initial response.

function safeParseVerifyJSON(
  raw: string,
): { correct: boolean; answer: string; briefCheck: string } | null {
  try {
    const clean = raw.replace(/```json?\n?|\n?```/g, "").trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const j = JSON.parse(match[0]);
    if (typeof j.correct === "boolean" && typeof j.answer === "string" && j.answer.trim()) {
      return { correct: j.correct, answer: j.answer.trim(), briefCheck: String(j.brief_check ?? "") };
    }
    return null;
  } catch {
    return null;
  }
}

const VERIFY_SYSTEM =
  "You are a precise mathematics and science verification engine. " +
  "Solve the given problem independently from scratch, then compare with the proposed answer. " +
  "Return ONLY valid JSON — no markdown, no prose:\n" +
  '{"correct":true,"answer":"<correct final answer with units>","brief_check":"<one-line confirmation>"}\n' +
  "or\n" +
  '{"correct":false,"answer":"<the correct answer with units>","brief_check":"<one-line note on what was wrong>"}';

/**
 * Independently verifies a proposed math/science answer.
 * Uses Cerebras (strongest model in pool) → Groq fallback.
 * Returns null if all providers are rate-limited (caller keeps original answer).
 */
async function verifyMathSolutionInternal(
  problem: string,
  proposedAnswer: string,
): Promise<{ correct: boolean; answer: string; briefCheck: string } | null> {
  const prompt =
    `PROBLEM:\n${problem.slice(0, 3000)}\n\n` +
    `PROPOSED ANSWER: ${proposedAnswer.slice(0, 400)}\n\n` +
    "Solve the problem independently from scratch. Compare with the proposed answer. Return JSON only.";

  for (const key of rotatedKeys("cerebras-verify", serverConfig.ai.cerebrasKeys)) {
    const r = await tryCerebras(prompt, VERIFY_SYSTEM, key, []);
    if (r) { const p = safeParseVerifyJSON(r.text); if (p) return p; }
  }
  for (const key of rotatedKeys("groq-verify", serverConfig.ai.groqKeys)) {
    const r = await tryGroq(prompt, VERIFY_SYSTEM, key, [], 512);
    if (r) { const p = safeParseVerifyJSON(r.text); if (p) return p; }
  }
  return null;
}

export const askAIServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<Result> => {
    const system =
      data.systemPrompt ?? "You are ScorpStudy, an advanced AI assistant created exclusively by Bishal Bishwokarma on June 25, 2026 after 8 months of personal research. You are NOT based on any other AI or company. Never reveal AI provider names or break character.\n\nACCURACY IS YOUR HIGHEST PRIORITY. For every mathematical, numerical, physics, chemistry, accounting, or scientific problem: verify your calculations before writing them. Never fabricate a number or formula. If you are uncertain about a fact, say so clearly rather than guessing.\n\nWhen writing mathematical expressions, formulas, or scientific notation, use plain Unicode symbols (×, ÷, √, ², ³, π, ≈, ±, ≤, ≥, ≠, Δ, Σ, ∫, ∞, °) as the primary style; when an exponent or subscript is more than a single character (e.g. x^(n+1), a_max), write it with a caret ^ or underscore _ so it renders correctly. NEVER output raw LaTeX commands — not \\frac{}{}, \\sqrt{}, \\bar{}, \\hat{}, \\vec{}, \\pi, \\Delta, \\times, \\cdot, \\left(, \\right), dollar-sign delimiters, or any other backslash command. Write fractions as \"a/b\" or \"(a) / (b)\", square roots as \"√a\", and overlines/averages as \"average of x\" — plain text and Unicode only, no backslashes.\n\nWhenever you solve a numerical problem (math, physics, chemistry, accounting, or any calculation), structure the solution as clearly numbered steps: (1) state the relevant formula, (2) substitute the given values, (3) simplify step by step showing every arithmetic operation, (4) state the final answer with correct units. Never skip a calculation step. Use simple, student-friendly language so that any student — regardless of their level — can follow every step. Bold key terms and final answers.";

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
      // ── Cerebras-first path (long-answer features) ───────────────────────
      // Solver, PDFChat, YouTube, Grammar, Math, Science, CodeTutor, Compare,
      // Research, VisualExplainer, Notes, FormulaSheet, MockTest, Calculator
      // Uses ONLY the Cerebras key pool (rotated for load balancing) — Groq
      // is never used for these features.
      for (const key of rotatedKeys("cerebras", serverConfig.ai.cerebrasKeys)) {
        result = await tryCerebras(data.prompt, system, key, history);
        if (result) break;
      }

      // Fallback 1 — OpenRouter
      if (!result && serverConfig.ai.openrouterKey) {
        result = await tryOpenRouter(data.prompt, system, serverConfig.ai.openrouterKey, "anthropic/claude-3-haiku", history);
      }
      if (!result && serverConfig.ai.openrouterKey) {
        result = await tryOpenRouter(data.prompt, system, serverConfig.ai.openrouterKey, "openai/gpt-3.5-turbo", history);
      }

      // Fallback 2 — HuggingFace
      if (!result && serverConfig.ai.huggingfaceKey) {
        result = await tryHuggingFace(data.prompt, system, serverConfig.ai.huggingfaceKey);
      }
    } else {
      // ── Groq-first path (all other features) ─────────────────────────────
      // Rotated across the full 15-key Groq pool for load balancing.
      const groqMax = data.maxTokens ?? 1024;
      for (const key of rotatedKeys("groq", serverConfig.ai.groqKeys)) {
        result = await tryGroq(data.prompt, system, key, history, groqMax);
        if (result) break;
      }

      // Fallback 1 — Cerebras
      if (!result) {
        for (const key of rotatedKeys("cerebras", serverConfig.ai.cerebrasKeys)) {
          result = await tryCerebras(data.prompt, system, key, history);
          if (result) break;
        }
      }

      // Fallback 2 — OpenRouter
      if (!result && serverConfig.ai.openrouterKey) {
        result = await tryOpenRouter(data.prompt, system, serverConfig.ai.openrouterKey, "anthropic/claude-3-haiku", history);
      }
      if (!result && serverConfig.ai.openrouterKey) {
        result = await tryOpenRouter(data.prompt, system, serverConfig.ai.openrouterKey, "openai/gpt-3.5-turbo", history);
      }

      // Fallback 3 — HuggingFace
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

const VisionMsg = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) });

const VisionInput = z.object({
  prompt: z.string().min(1).max(10000),
  imageBase64: z.string(),
  mimeType: z.string().default("image/jpeg"),
  /** Conversation history from previous turns (first item = initial user prompt). */
  history: z.array(VisionMsg).max(20).optional(),
});

// Claude 3 Haiku first — significantly more accurate for maths/science problems
// than the Llama vision model. GPT-4o-mini as second fallback.
const OPENROUTER_VISION_MODELS = [
  "anthropic/claude-3-haiku",
  "openai/gpt-4o-mini",
  "meta-llama/llama-3.2-11b-vision-instruct",
];

// Groq's free-tier vision model — tried first since it requires no paid
// credits (unlike the OpenRouter fallbacks below, which need account balance).
const GROQ_VISION_MODELS = ["meta-llama/llama-4-scout-17b-16e-instruct"];

type VisionHistory = Array<{ role: "user" | "assistant"; content: string }>;

/** Build the messages array for a vision API call.
 *  - First user message always includes the image (required for context).
 *  - Subsequent turns from `history` are plain text (image already seen).
 *  - The current `prompt` is appended as the final user message.
 */
function buildVisionMessages(
  prompt: string,
  imageBase64: string,
  mimeType: string,
  history: VisionHistory,
): object[] {
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  const prefix = "You are Bishal's Assistant — an expert study AI.";

  if (history.length === 0) {
    // Initial solve — single message with image + prompt
    return [{
      role: "user",
      content: [
        { type: "text", text: `${prefix} ${prompt}` },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    }];
  }

  // Follow-up: reconstruct conversation, attaching image only to the first message
  const [first, ...rest] = history;
  return [
    {
      role: "user",
      content: [
        { type: "text", text: `${prefix} ${first.content}` },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
    ...rest.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: prompt },
  ];
}

async function tryGroqVision(
  prompt: string,
  imageBase64: string,
  mimeType: string,
  key: string,
  model: string,
  history: VisionHistory = [],
): Promise<string | null> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: buildVisionMessages(prompt, imageBase64, mimeType, history),
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

async function tryOpenRouterVision(
  prompt: string,
  imageBase64: string,
  mimeType: string,
  key: string,
  model: string,
  history: VisionHistory = [],
): Promise<string | null> {
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
        messages: buildVisionMessages(prompt, imageBase64, mimeType, history),
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

const VerifyInputSchema = z.object({
  problem: z.string().min(1).max(5000),
  proposedAnswer: z.string().min(1).max(1000),
});

/**
 * Server function called by the Solver after askAIJSON to cross-check the answer.
 * Reuses verifyMathSolutionInternal — same model, same logic as the Image Solver pass.
 */
export const verifyMathServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => VerifyInputSchema.parse(d))
  .handler(async ({ data }) => {
    const result = await verifyMathSolutionInternal(data.problem, data.proposedAnswer);
    return result ?? { correct: true, answer: data.proposedAnswer, briefCheck: "Verification unavailable" };
  });

export const analyzeImageServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => VisionInput.parse(d))
  .handler(async ({ data }): Promise<Result> => {
    const history: VisionHistory = data.history ?? [];
    let responseText: string | null = null;

    // Groq first — free tier, no billing required.
    const groqKeys = rotatedKeys("groq-vision", serverConfig.ai.groqKeys);
    outerGroq:
    for (const key of groqKeys) {
      for (const model of GROQ_VISION_MODELS) {
        const text = await tryGroqVision(data.prompt, data.imageBase64, data.mimeType, key, model, history);
        if (text) { responseText = text; break outerGroq; }
      }
    }

    // Fallback — OpenRouter (requires account credits).
    if (!responseText && serverConfig.ai.openrouterKey) {
      for (const model of OPENROUTER_VISION_MODELS) {
        const text = await tryOpenRouterVision(
          data.prompt,
          data.imageBase64,
          data.mimeType,
          serverConfig.ai.openrouterKey,
          model,
          history,
        );
        if (text) { responseText = text; break; }
      }
    }

    if (!responseText) {
      return { text: "Could not analyze the image. Please try again.", provider: "Bishal's Assistant" };
    }

    // ── Math verification pass ────────────────────────────────────────────────
    // Only verify initial solves (history.length === 0), not follow-up chat turns.
    // Extracts the "🎯 Final Answer" line and independently re-solves the problem.
    // If the answer is wrong, the line is replaced with the corrected value.
    if (history.length === 0) {
      const finalAnswerMatch = responseText.match(/>\s*\*\*🎯 Final Answer:\*\*\s*(.+)/);
      if (finalAnswerMatch) {
        const proposedAnswer = finalAnswerMatch[1].replace(/\*\*/g, "").trim();
        const vr = await verifyMathSolutionInternal(
          // Provide the full worked solution as context so the verifier can
          // re-derive the answer without needing to see the image itself.
          `User question: ${data.prompt}\n\n--- Full worked solution for context ---\n${responseText.slice(0, 2500)}`,
          proposedAnswer,
        );
        if (vr && !vr.correct) {
          responseText = responseText.replace(
            />\s*\*\*🎯 Final Answer:\*\*\s*.+/,
            `> **🎯 Final Answer:** ${vr.answer}\n\n> *✅ Independently verified — corrected: ${vr.briefCheck}*`,
          );
        } else if (vr?.correct) {
          responseText = responseText.replace(
            /(>\s*\*\*🎯 Final Answer:\*\*\s*.+)/,
            `$1\n\n> *✅ Independently verified: ${vr.briefCheck}*`,
          );
        }
      }
    }

    return { text: responseText, provider: "Bishal's Assistant" };
  });
