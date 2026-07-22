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

async function tryGeminiVision(
  prompt: string,
  imageBase64: string,
  mimeType: string,
  key: string,
  history: VisionHistory = [],
): Promise<string | null> {
  // Build contents array: history turns (text-only) + final user turn with image
  const contents: object[] = [];

  if (history.length > 0) {
    const [first, ...rest] = history;
    // First history message includes the image
    contents.push({
      role: "user",
      parts: [
        { text: first.content },
        { inlineData: { mimeType, data: imageBase64 } },
      ],
    });
    for (const msg of rest) {
      contents.push({ role: msg.role === "assistant" ? "model" : "user", parts: [{ text: msg.content }] });
    }
    contents.push({ role: "user", parts: [{ text: prompt }] });
  } else {
    contents.push({
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: imageBase64 } },
      ],
    });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      },
    );
    const body = await res.text();
    if (!res.ok) {
      console.error(`[Vision] Gemini HTTP ${res.status}:`, body.slice(0, 400));
      return null;
    }
    const data = JSON.parse(body);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return (typeof text === "string" && text.trim()) ? text.trim() : null;
  } catch (err) {
    console.error("[Vision] Gemini exception:", err);
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

// ── Dedicated step-by-step math solver ───────────────────────────────────────
// Keeps the JSON schema in the SYSTEM context and sends only the problem as the
// USER message. This frees the full 6 000-token output budget for the solution
// instead of wasting input tokens on a schema description embedded in the prompt.
// Cerebras 120B first → Groq fallback (same key pools, separate rotation pointers).

const SOLVE_SYSTEM = `You are a world-class mathematics and science tutor. Solve the given problem with maximum detail and return ONLY a valid JSON object — no markdown fences, no prose before or after the JSON.

Required JSON schema:
{
  "problem_type": "specific type, e.g. Quadratic Equation, Projectile Motion, Bond Valuation",
  "subject": "Math|Physics|Chemistry|Biology|Economics|Other",
  "difficulty": "Easy|Medium|Hard",
  "given": ["each given value as a string, e.g. Mass m = 1200 kg"],
  "find": ["what we need to find, e.g. Acceleration a = ?"],
  "steps": [
    {
      "title": "action-oriented step title, 4-8 words",
      "what": "WHAT you are doing in this step (1-2 sentences, specific)",
      "why": "WHY this step is necessary — theory and reasoning (2-3 sentences)",
      "how": "HOW to perform this step — detailed method (2-4 sentences)",
      "formula": "formula using plain Unicode only — e.g. F = ma, x = (-b ± √(b²-4ac)) / (2a). null if no formula.",
      "formula_explanation": "explain each variable in context of this problem. null if no formula.",
      "calculation": "full numeric substitution and arithmetic — e.g. F = 1200 × 2.5 = 3000 N. null if no calculation.",
      "result": "result with units, e.g. a = 2.5 m/s². null if no numeric result.",
      "common_mistake": "most common mistake in this step and how to avoid it. null if none."
    }
  ],
  "final_answer": "complete final answer with all values and units",
  "verification": "independent check — substitute back, dimensional analysis, or alternate method. Never null.",
  "self_check": "review (1) formulas correct? (2) values substituted correctly? (3) arithmetic right? (4) units consistent? State corrections or confirm all steps verified.",
  "key_concept": "most important concept this problem tests (2-3 sentences)",
  "tip": "one powerful exam tip or shortcut for this problem type"
}

REQUIREMENTS:
- Include 6 to 12 steps. Never fewer than 6.
- Every step must be DETAILED with full theory in 'why'.
- Show ALL arithmetic in 'calculation' — substitute numbers, simplify step by step.
- MATH NOTATION — plain Unicode ONLY. NEVER LaTeX backslash commands:
  Fractions: (a) / (b) | Exponents: x² or x^2 | Roots: √(expr) | Greek: π θ α β γ Δ Σ μ λ ω
  Operators: × ÷ ± ≈ ≠ ≤ ≥ ∞ ° · | FORBIDDEN: \\frac \\sqrt \\text \\times \\left \\right $...$ &= \\\\`;

/** Greedy JSON extractor — salvages valid JSON even from partially fenced responses. */
function extractSolveJSON(text: string): Record<string, unknown> | null {
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced ? fenced[1] : text).trim();
    const start = candidate.search(/\{/);
    if (start === -1) return null;
    const sliced = candidate.slice(start);
    for (let end = sliced.length; end > 0; end--) {
      try {
        const parsed = JSON.parse(sliced.slice(0, end));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch { /* keep shrinking */ }
    }
    return null;
  } catch {
    return null;
  }
}

const SolveInputSchema = z.object({
  problem: z.string().min(1).max(20000),
  subject: z.string().min(1).max(50),
});

/**
 * Dedicated solver used by the Step-by-Step Solver feature.
 * Cerebras 120B → Groq fallback. Retries once on unparseable JSON.
 * Returns { data: Solution, provider } or { data: null, provider: "none" }.
 */
export const solveMathServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SolveInputSchema.parse(d))
  .handler(async ({ data }) => {
    const userMsg = `Subject: ${data.subject}\n\nProblem: ${data.problem}`;

    // Two attempts per provider so a one-off JSON slip gets a retry.
    for (let attempt = 0; attempt < 2; attempt++) {
      // Cerebras 120B — highest quality for multi-step JSON
      for (const key of rotatedKeys("cerebras-solve", serverConfig.ai.cerebrasKeys)) {
        const r = await tryCerebras(userMsg, SOLVE_SYSTEM, key, []);
        if (r) {
          const parsed = extractSolveJSON(r.text);
          if (parsed) return { data: parsed, provider: r.provider };
        }
      }
      // Groq fallback — handles shorter/simpler problems well
      for (const key of rotatedKeys("groq-solve", serverConfig.ai.groqKeys)) {
        const r = await tryGroq(userMsg, SOLVE_SYSTEM, key, [], 6000);
        if (r) {
          const parsed = extractSolveJSON(r.text);
          if (parsed) return { data: parsed, provider: r.provider };
        }
      }
    }

    return { data: null as Record<string, unknown> | null, provider: "none" };
  });

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

const VisionMsg = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(60000) });

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
    if (!res.ok) {
      console.error(`[Vision] Groq ${model} HTTP ${res.status}:`, body.slice(0, 400));
      return null;
    }
    const parsed = JSON.parse(body);
    const text = parsed?.choices?.[0]?.message?.content;
    return (typeof text === "string" && text.trim()) ? text.trim() : null;
  } catch (err) {
    console.error(`[Vision] Groq ${model} exception:`, err);
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
    if (!res.ok) {
      console.error(`[Vision] OpenRouter ${model} HTTP ${res.status}:`, body.slice(0, 400));
      return null;
    }
    const parsed = JSON.parse(body);
    const text = parsed?.choices?.[0]?.message?.content;
    return (typeof text === "string" && text.trim()) ? text.trim() : null;
  } catch (err) {
    console.error(`[Vision] OpenRouter ${model} exception:`, err);
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

    // Primary — Gemini (free tier, multimodal, rotated across up to 5 keys).
    // Groq no longer offers vision models; Gemini is the best free alternative.
    for (const key of rotatedKeys("gemini-vision", serverConfig.ai.geminiKeys)) {
      const text = await tryGeminiVision(data.prompt, data.imageBase64, data.mimeType, key, history);
      if (text) return { text, provider: "Bishal's Assistant" };
    }

    // Fallback — OpenRouter (requires account credits).
    if (serverConfig.ai.openrouterKey) {
      for (const model of OPENROUTER_VISION_MODELS) {
        const text = await tryOpenRouterVision(
          data.prompt,
          data.imageBase64,
          data.mimeType,
          serverConfig.ai.openrouterKey,
          model,
          history,
        );
        if (text) return { text, provider: "Bishal's Assistant" };
      }
    }

    return { text: "Could not analyze the image. Please try again.", provider: "Bishal's Assistant" };
  });
