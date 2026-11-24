import { describe, expect, it } from 'vitest';
import { collectLinks, hostPattern, isProbeAllowed, normalizeUrl } from '../src/core/urls';

describe('URL handling', () => {
  it('resolves relative links against the document base and drops fragments', () => {
    expect(normalizeUrl('../guide?q=1#part', 'https://EXAMPLE.com:443/app/docs/'))
      .toBe('https://example.com/app/guide?q=1');
    expect(normalizeUrl('//other.example.org/a', 'https://example.com'))
      .toBe('https://other.example.org/a');
  });

  it.each(['', ' #anchor ', 'mailto:a@example.com', 'javascript:void(0)', 'data:text/plain,hi',
    'ftp://example.com/a', 'http://%', 'https://me:secret@example.com'])('ignores %j', (value) => {
    expect(normalizeUrl(value, 'https://example.com/')).toBeNull();
  });

  it('retains first occurrences, query variants and the unique count beyond the scan limit', () => {
    const links = [
      { href: '/one#intro', label: '  First\n item  ' },
      { href: 'https://example.com:443/one#end', label: 'Duplicate' },
      { href: '/one?v=2', label: '' },
      { href: '/three', label: '' },
    ];
    expect(collectLinks(links, 'https://example.com/', 2)).toEqual({
      links: [
        { url: 'https://example.com/one', label: 'First item' },
        { url: 'https://example.com/one?v=2', label: '' },
      ],
      total: 3,
    });
  });

  it('produces scheme-specific browser host patterns across ports', () => {
    expect(hostPattern('http://127.0.0.1:4173/test')).toBe('http://127.0.0.1/*');
    expect(hostPattern('https://example.com:8443/path')).toBe('https://example.com/*');
  });

  it.each(['localhost', 'localhost.', '127.1', '0x7f000001', '[::1]', '[::ffff:127.0.0.1]',
    '10.0.0.1', '172.31.4.5', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '224.0.0.1', '[fc00::1]', '[fe80::1]', '[2002:7f00:1::1]', 'printer', 'printer.local.'])(
    'blocks non-public host %s by default', (host) => {
      expect(isProbeAllowed('http://' + host + '/')).toBe(false);
    },
  );

  it('enables explicit loopback fixtures while keeping private hosts blocked', () => {
    expect(isProbeAllowed('http://localhost:4173/', true)).toBe(true);
    expect(isProbeAllowed('http://127.0.0.1:4173/', true)).toBe(true);
    expect(isProbeAllowed('http://[::1]:4173/', true)).toBe(true);
    expect(isProbeAllowed('http://192.168.1.1/', true)).toBe(false);
    expect(isProbeAllowed('https://example.com/')).toBe(true);
    expect(isProbeAllowed('http://[2606:4700::1]/')).toBe(true);
  });
});
