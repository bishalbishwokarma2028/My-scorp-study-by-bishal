import { askAIServer } from "./aiProvider.functions";

export type AIResult = { text: string; provider: string };
export type HistoryMsg = { role: "user" | "assistant"; content: string };

export async function askAI(
  prompt: string,
  systemPrompt?: string,
  history?: HistoryMsg[],
): Promise<AIResult> {
  try {
    const result = await askAIServer({ data: { prompt, systemPrompt, history } });
    console.log(`[ScorpStudy AI] Answered by: ${result.provider}`);
    return result;
  } catch (err) {
    console.error("askAI failed:", err);
    return { text: "AI is busy right now, please try again in a moment.", provider: "none" };
  }
}

/** Try to extract a JSON object/array from an AI text response. */
export function extractJSON<T = unknown>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const firstBrace = candidate.search(/[\[{]/);
  if (firstBrace === -1) return null;
  const sliced = candidate.slice(firstBrace);
  for (let end = sliced.length; end > 0; end--) {
    try {
      return JSON.parse(sliced.slice(0, end)) as T;
    } catch {
      // continue
    }
  }
  return null;
}
