type BatchResponse<T> = { items: T[] | null; provider: string };

type GenerateBatchesOptions<T> = {
  count: number;
  batchSize: number;
  createPrompt: (count: number, offset: number, previousItems: T[]) => string;
  requestBatch: (prompt: string, count: number) => Promise<BatchResponse<T>>;
  isValidItem: (item: unknown) => item is T;
  onProgress?: (generated: number, total: number) => void;
};

/**
 * Generate large lists through small JSON requests. If one response is truncated
 * or malformed, retry only the missing items with a smaller request.
 */
export async function generateInBatches<T>({
  count,
  batchSize,
  createPrompt,
  requestBatch,
  isValidItem,
  onProgress,
}: GenerateBatchesOptions<T>): Promise<{ items: T[]; provider: string; complete: boolean }> {
  const items: T[] = [];
  let provider = "none";
  let nextBatchSize = Math.max(1, batchSize);
  let requests = 0;
  const maxRequests = Math.max(count * 2, Math.ceil(count / nextBatchSize) + 4);

  while (items.length < count && requests < maxRequests) {
    const requested = Math.min(nextBatchSize, count - items.length);
    const prompt = createPrompt(requested, items.length, items);
    const response = await requestBatch(prompt, requested);
    requests++;

    if (response.provider !== "none") provider = response.provider;
    const validItems = Array.isArray(response.items)
      ? response.items.filter(isValidItem).slice(0, requested)
      : [];

    if (validItems.length === 0) {
      if (response.provider === "none" || requested === 1) break;
      nextBatchSize = Math.max(1, Math.floor(requested / 2));
      continue;
    }

    items.push(...validItems);
    onProgress?.(items.length, count);
    nextBatchSize = validItems.length < requested
      ? requested - validItems.length
      : batchSize;
  }

  return { items, provider, complete: items.length === count };
}
