import { askAIServer } from "./aiProvider.functions";
import { extractJSON } from "./jsonExtract";

export { extractJSON } from "./jsonExtract";

export type AIResult = { text: string; provider: string; isIdentityAnswer?: boolean; truncated?: boolean };
export type HistoryMsg = { role: "user" | "assistant"; content: string };

export async function askAI(
  prompt: string,
  systemPrompt?: string,
  history?: HistoryMsg[],
  preferLongAnswer?: boolean,
  maxTokens?: number,
): Promise<AIResult> {
  try {
    const result = await askAIServer({ data: { prompt, systemPrompt, history, preferLongAnswer, maxTokens } });
    console.log(`[ScorpStudy AI] Answered by: ${result.provider}`);
    return result;
  } catch (err) {
    console.error("askAI failed:", err);
    return { text: "AI is busy right now, please try again in a moment.", provider: "none" };
  }
}

/**
 * Ask AI and automatically parse the JSON response.
 * Retries once with a stricter system prompt if the first attempt returns unparseable JSON.
 */
export async function askAIJSON<T>(
  prompt: string,
  systemPrompt?: string,
  history?: HistoryMsg[],
  preferLongAnswer?: boolean,
  maxTokens?: number,
): Promise<{ data: T | null; provider: string; truncated?: boolean }> {
  const BASE_JSON_SYSTEM = "You MUST return only a single valid JSON object or array. Do NOT wrap it in markdown code fences. Do NOT include any prose, explanation, or comments — output the raw JSON only.";
  const jsonSystem = systemPrompt || BASE_JSON_SYSTEM;

  // First attempt
  const first = await askAI(prompt, jsonSystem, history, preferLongAnswer, maxTokens);
  if (first.provider === "none") {
    return { data: null, provider: "none" };
  }
  if (!first.truncated) {
    const parsed = extractJSON<T>(first.text);
    if (parsed !== null) return { data: parsed, provider: first.provider };
  }

  // Preserve domain instructions on retry and require a complete, compact object.
  const strictSystem = `${jsonSystem}\n\n${BASE_JSON_SYSTEM}\n\nThe previous response was invalid or cut off. Return one complete, compact object this time; do not omit required fields.`;
  const second = await askAI(prompt, strictSystem, history, preferLongAnswer, maxTokens);
  const parsed2 = extractJSON<T>(second.text);
  return { data: parsed2, provider: second.provider || first.provider, truncated: second.truncated };
}
