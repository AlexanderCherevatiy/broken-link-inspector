import { expect, it } from 'vitest';
import { runQueue } from '../src/core/queue';

it('processes the full queue with at most three tasks in flight', async () => {
  let active = 0;
  let peak = 0;
  const completed: number[] = [];
  await runQueue([1, 2, 3, 4, 5, 6, 7], new AbortController().signal, async (item) => {
    peak = Math.max(peak, ++active);
    await Promise.resolve();
    completed.push(item);
    active--;
  });
  expect(peak).toBe(3);
  expect(completed.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

it('starts no additional work after abort', async () => {
  const controller = new AbortController();
  const started: number[] = [];
  await runQueue([1, 2, 3, 4, 5], controller.signal, async (item) => {
    started.push(item);
    controller.abort();
  });
  expect(started).toEqual([1]);
});

it('waits for in-flight work to settle before propagating failure', async () => {
  let settled = false;
  await expect(runQueue([1, 2, 3, 4], new AbortController().signal, async (item) => {
    if (item === 1) throw new Error('save failed');
    await new Promise((resolve) => setTimeout(resolve, 5));
    settled = true;
  })).rejects.toThrow('save failed');
  expect(settled).toBe(true);
});
