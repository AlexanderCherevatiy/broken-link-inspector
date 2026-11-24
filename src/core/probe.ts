import { isLoopbackTarget, isProbeAllowed } from './urls';
import { prepareTarget } from './privacy';
import type { Category, Method, Outcome } from './types';

export interface RedirectHeaders { status: number; location?: string }

export interface RedirectObservation {
  read(): Promise<RedirectHeaders | undefined> | RedirectHeaders | undefined;
  close(): void;
}

interface ProbeOptions {
  url: string;
  signal: AbortSignal;
  allowed: (url: string) => Promise<boolean>;
  allowLoopback?: boolean;
  blocked?: boolean;
  verifyAddress?: (url: string) => Promise<'dns' | 'privateHost' | undefined>;
  timeoutMs?: number;
  request?: typeof fetch;
  observe?: (url: string, method: Method) => RedirectObservation | undefined;
}

export function classifyStatus(status: number): Category {
  if (status >= 200 && status < 300) return 'working';
  if (status >= 300 && status < 400) return 'redirect';
  if (status === 404 || status === 410) return 'missing';
  return 'uncertain';
}

function redirectTarget(location: string | undefined, original: string): string | undefined {
  if (!location) return undefined;
  const target = prepareTarget(location, original);
  return target && !target.blocked ? target.url : undefined;
}

export async function checkLink({
  url, signal, allowed, allowLoopback, blocked, verifyAddress, timeoutMs = 8_000, request = fetch, observe,
}: ProbeOptions): Promise<Outcome> {
  const stopped: Outcome = { category: 'notChecked', reason: 'stopped' };
  if (signal.aborted) return stopped;
  if (blocked || prepareTarget(url, url)?.blocked) return { category: 'notChecked', reason: 'unsafeUrl' };
  if (!isProbeAllowed(url, allowLoopback)) return { category: 'notChecked', reason: 'privateHost' };

  const network = new AbortController();
  let method: Method = 'HEAD';
  let timedOut = false;
  const stop = () => network.abort();
  signal.addEventListener('abort', stop, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    network.abort();
  }, timeoutMs);

  async function send(): Promise<Outcome> {
    const observation = observe?.(url, method);
    const closeObservation = () => observation?.close();
    if (observation) network.signal.addEventListener('abort', closeObservation, { once: true });
    try {
      const options: RequestInit & { targetAddressSpace: 'loopback' | 'public' } = {
        // Chromium can validate DNS-resolved addresses when this Fetch option is supported.
        targetAddressSpace: isLoopbackTarget(url) ? 'loopback' : 'public',
        method,
        headers: method === 'GET' ? { Range: 'bytes=0-0' } : undefined,
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: network.signal,
      };
      const response = await request(url, options);
      // Range is advisory. Cancel the stream as soon as the headers are available.
      void response.body?.cancel().catch(() => {});
      const opaque = response.type === 'opaqueredirect';
      const observed = opaque ? await observation?.read() : undefined;
      const status = opaque ? observed?.status : response.status;
      const category = opaque ? 'redirect' : classifyStatus(response.status);
      const outcome: Outcome = { category, method };
      if (status !== undefined && status !== 0) outcome.status = status;
      if (category === 'redirect') {
        const redirectUrl = redirectTarget(observed?.location ?? response.headers.get('location') ?? undefined, url);
        if (redirectUrl) outcome.redirectUrl = redirectUrl;
        if (opaque && !redirectUrl) outcome.reason = 'redirectHidden';
      }
      if (category === 'uncertain' || category === 'missing') outcome.reason = 'httpError';
      return outcome;
    } finally {
      network.signal.removeEventListener('abort', closeObservation);
      closeObservation();
    }
  }

  const work = async (): Promise<Outcome> => {
    if (!await allowed(url)) return { category: 'notChecked', reason: 'permission' };
    network.signal.throwIfAborted();
    const addressError = await verifyAddress?.(url);
    if (addressError) return { category: 'notChecked', reason: addressError };
    if (verifyAddress && !await allowed(url)) return { category: 'notChecked', reason: 'permission' };
    network.signal.throwIfAborted();
    const head = await send();
    if (head.status !== 405 && head.status !== 501) return head;
    network.signal.throwIfAborted();
    if (!await allowed(url)) return { category: 'notChecked', reason: 'permission' };
    const fallbackError = await verifyAddress?.(url);
    if (fallbackError) return { category: 'notChecked', reason: fallbackError };
    if (verifyAddress && !await allowed(url)) return { category: 'notChecked', reason: 'permission' };
    network.signal.throwIfAborted();
    method = 'GET';
    return send();
  };

  const aborted = new Promise<never>((_, reject) => {
    network.signal.addEventListener('abort', () => reject(network.signal.reason), { once: true });
  });
  try {
    return await Promise.race([work(), aborted]);
  } catch {
    if (signal.aborted) return stopped;
    if (timedOut) return { category: 'uncertain', reason: 'timeout', method };
    // Permission can change while the request is in flight.
    if (!await allowed(url).catch(() => false)) return { category: 'notChecked', reason: 'permission' };
    return { category: 'uncertain', reason: 'network', method };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', stop);
  }
}
