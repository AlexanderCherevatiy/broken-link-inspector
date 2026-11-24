import { describe, expect, it, vi } from 'vitest';
import { prepareTarget, publicDnsResult, sourceAddress } from '../src/core/privacy';
import { checkLink } from '../src/core/probe';

describe('URL privacy', () => {
  it('removes the entire source query and fragment and retains normal destination URLs', () => {
    expect(sourceAddress('https://example.org/docs?email=private#jump')).toBe('https://example.org/docs');
    expect(prepareTarget('/docs?q=books#jump', 'https://example.org/'))
      .toEqual({ url: 'https://example.org/docs?q=books' });
  });

  it.each([
    'https://user:secret@example.org/a',
    'https://example.org/a?access_token=secret',
    'https://example.org/a?X-Amz-Signature=secret',
    'https://example.org/reset/opaque-secret',
    'https://example.org/a?n=eyJabcdef.a23456789.zzzzzzzz',
  ])('redacts and blocks %s before saving', (url) => {
    const target = prepareTarget(url, url);
    expect(target?.blocked).toBe(true);
    expect(target?.url).not.toMatch(/secret|eyJ/);
    expect(target?.url).not.toContain('?');
  });

  it('rejects mixed DNS answers and verifies only canonical public IP literals', () => {
    expect(publicDnsResult(['93.184.216.34','2606:4700::1'])).toBe(true);
    expect(publicDnsResult(['93.184.216.34','::ffff:127.0.0.1'])).toBe(false);
    expect(publicDnsResult(['127.0.0.1'])).toBe(false);
    expect(publicDnsResult(['2001::1', '2001:1ff::1'])).toBe(false);
    expect(publicDnsResult(['public.example.org'])).toBe(false);
    expect(publicDnsResult([])).toBe(false);
  });

  it('does not fetch a blocked or unverifiable URL or an ungranted host', async () => {
    const request = vi.fn<typeof fetch>();
    const options = { url: 'https://example.org/resource', request, allowed: async () => true,
      signal: new AbortController().signal, verifyAddress: async () => 'dns' as const };
    expect(await checkLink(options)).toEqual({category: 'notChecked', reason: 'dns'});
    expect(await checkLink({ ...options, blocked: true })).toEqual({category: 'notChecked', reason: 'unsafeUrl'});
    expect(await checkLink({ ...options, allowed: async () => false })).toEqual({category: 'notChecked', reason: 'permission'});
    expect(request).not.toHaveBeenCalled();
  });
});

it('rechecks permissions when the address validation completes', async () => {
  let consent = true;
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
  const outcome = await checkLink({
    url: 'https://example.org/resource', request,
    signal: new AbortController().signal,
    allowed: async () => consent,
    verifyAddress: async () => { consent = false; return undefined; },
  });
  expect(outcome).toEqual({ category: 'notChecked', reason: 'permission' });
  expect(request).not.toHaveBeenCalled();
});
