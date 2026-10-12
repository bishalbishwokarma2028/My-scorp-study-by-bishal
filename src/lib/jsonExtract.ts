/**
 * Extract the first complete JSON object or array from model output in linear time.
 * Fenced responses and short prose before the JSON are supported; truncated JSON
 * is rejected so callers can retry instead of silently accepting partial data.
 */
export function extractJSON<T = unknown>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const stack: string[] = [];
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < candidate.length; i++) {
    const char = candidate[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      if (stack.length > 0) inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      if (stack.length === 0) start = i;
      stack.push(char);
      continue;
    }

    if (char !== "}" && char !== "]") continue;
    const opening = stack.pop();
    if ((opening === "{" && char !== "}") || (opening === "[" && char !== "]") || !opening) {
      stack.length = 0;
      start = -1;
      continue;
    }

    if (stack.length === 0 && start >= 0) {
      try {
        return JSON.parse(candidate.slice(start, i + 1)) as T;
      } catch {
        start = -1;
      }
    }
  }

  return null;
}
