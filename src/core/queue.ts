export async function runQueue<T>(
  items: readonly T[],
  signal: AbortSignal,
  visit: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  let failed = false;
  async function worker() {
    while (!signal.aborted && !failed && cursor < items.length) {
      const index = cursor++;
      try {
        await visit(items[index]!, index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  const workers = Array.from({ length: Math.min(3, items.length) }, worker);
  const settled = await Promise.allSettled(workers);
  const failure = settled.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
}
