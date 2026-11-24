import { describe, expect, it, vi } from 'vitest';
import { checkLink, classifyStatus } from '../src/core/probe';

const url = 'https://example.org/download';
const options = { url, allowed: async () => true, signal: new AbortController().signal };

describe('HTTP checks', () => {
  it.each([
    [200, 'working'], [206, 'working'], [301, 'redirect'], [304, 'redirect'],
    [404, 'missing'], [410, 'missing'], [403, 'uncertain'], [429, 'uncertain'],
    [500, 'uncertain'], [401, 'uncertain'], [100, 'uncertain'], [416, 'uncertain'],
  ])('classifies %i as %s', (status, category) => {
    expect(classifyStatus(Number(status))).toBe(category);
  });

  it('scopes requests to the permission grant and blocks private hosts before fetching', async () => {
    const request = vi.fn<typeof fetch>();
    expect(await checkLink({ ...options, allowed: async () => false, request }))
      .toEqual({ category: 'notChecked', reason: 'permission' });
    expect(await checkLink({ ...options, url: 'http://127.0.0.1/', request }))
      .toEqual({ category: 'notChecked', reason: 'privateHost' });
    expect(request).not.toHaveBeenCalled();
  });

  it('uses a cancellable range GET only when the server does not support HEAD', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(body, { status: 206 }));
    expect(await checkLink({ ...options, request })).toEqual({
      category: 'working', status: 206, method: 'GET',
    });
    expect(request).toHaveBeenNthCalledWith(1, url, expect.objectContaining({
      method: 'HEAD', redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer',
      targetAddressSpace: 'public',
    }));
    expect(request).toHaveBeenNthCalledWith(2, url, expect.objectContaining({
      method: 'GET', headers: { Range: 'bytes=0-0' }, redirect: 'manual',
    }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([401, 403, 429, 500])('does not retry HTTP %i using GET', async (status) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    expect(await checkLink({ ...options, request })).toMatchObject({ category: 'uncertain', status });
    expect(request).toHaveBeenCalledOnce();
  });

  it('reports the first redirect without requesting its destination', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 302, headers: { Location: 'http://127.0.0.1/private' },
    }));
    expect(await checkLink({ ...options, request })).toEqual({
      category: 'redirect', status: 302, redirectUrl: 'http://127.0.0.1/private', method: 'HEAD',
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it('reports an opaque redirect even without response headers', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue({
      type: 'opaqueredirect', status: 0, headers: new Headers(), body: null,
    } as Response);
    expect(await checkLink({ ...options, request })).toEqual({
      category: 'redirect', reason: 'redirectHidden', method: 'HEAD',
    });
  });

  it('waits for asynchronously observed Chromium redirect headers', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue({
      type: 'opaqueredirect', status: 0, headers: new Headers(), body: null,
    } as Response);
    expect(await checkLink({ ...options, request, observe: () => ({
      read: async () => ({ status: 307, location: '/next' }), close: () => {},
    }) })).toEqual({
      category: 'redirect', status: 307, redirectUrl: 'https://example.org/next', method: 'HEAD',
    });
  });

  it('aborts the network operation at the timeout', async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
      const result = checkLink({ ...options, request, timeoutMs: 25 });
      await vi.advanceTimersByTimeAsync(25);
      expect(await result).toEqual({ category: 'uncertain', reason: 'timeout', method: 'HEAD' });
      expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('distinguishes user cancellation from a failed network request', async () => {
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const result = checkLink({ ...options, request, signal: controller.signal });
    controller.abort();
    expect(await result).toEqual({ category: 'notChecked', reason: 'stopped' });
    const failed = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await checkLink({ ...options, request: failed }))
      .toEqual({ category: 'uncertain', reason: 'network', method: 'HEAD' });
  });
});
