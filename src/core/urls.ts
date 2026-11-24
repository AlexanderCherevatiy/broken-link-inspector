import type { LinkTarget } from './types';

export const MAX_LINKS = 1_000;
export const MAX_URL_LENGTH = 8_192;

export function normalizeUrl(href: string, base: string): string | null {
  const candidate = href.trim();
  if (!candidate || candidate.startsWith('#')) return null;
  try {
    const url = new URL(candidate, base);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      return null;
    }
    url.hash = '';
    return url.href.length <= MAX_URL_LENGTH ? url.href : null;
  } catch {
    return null;
  }
}

export function collectLinks(
  anchors: ReadonlyArray<{ href: string; label: string }>,
  base: string,
  limit = MAX_LINKS,
  prepare: (href: string, base: string) => { url: string; blocked?: true } | undefined = (href, from) => {
    const url = normalizeUrl(href, from);
    return url ? { url } : undefined;
  },
): { links: LinkTarget[]; total: number } {
  const seen = new Set<string>();
  const links: LinkTarget[] = [];
  for (const { href, label } of anchors) {
    const target = prepare(href, base);
    if (!target) continue;
    const key = target.blocked ? 'blocked:' + target.url : target.url;
    if (seen.has(key)) continue;
    seen.add(key);
    if (links.length < limit) {
      links.push({ ...target, label: target.blocked ? '' : label.replace(/\s+/g, ' ').trim().slice(0, 160) });
    }
  }
  return { links, total: seen.size };
}

export function hostPattern(address: string): string {
  const { protocol, hostname } = new URL(address);
  return protocol + '//' + hostname + '/*';
}

const specialSuffixes = new Set([
  'arpa', 'corp', 'example', 'home', 'internal', 'invalid', 'lan', 'local', 'localhost', 'onion', 'test',
]);

export function isLoopbackTarget(address: string): boolean {
  const host = new URL(address).hostname.replace(/\.+$/, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export function isProbeAllowed(address: string, allowLoopback = false): boolean {
  if (!normalizeUrl(address, address)) return false;
  const host = new URL(address).hostname.replace(/\.+$/, '');
  if (isLoopbackTarget(address)) return allowLoopback;

  if (host.startsWith('[')) {
    // Only global unicast space, excluding special-use and IPv4 tunneling prefixes.
    if (!/^\[[23][0-9a-f]{3}:/.test(host)) return false;
    const [first, second] = host.slice(1, -1).split(':');
    const secondPart = Number.parseInt(second || '0', 16);
    if (first === '2001' && (secondPart <= 0x1ff || secondPart === 0xdb8)) return false;
    return first !== '2002' && first !== '3fff';
  }

  if (/^\d+(?:\.\d+){3}$/.test(host)) {
    const [a = 0, b = 0, c = 0] = host.split('.').map(Number);
    return a !== 0 && a !== 10 && a !== 127 && a < 224
      && !(a === 100 && b >= 64 && b <= 127)
      && !(a === 169 && b === 254)
      && !(a === 172 && b >= 16 && b <= 31)
      && !(a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)))
      && !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      && !(a === 203 && b === 0 && c === 113);
  }

  const labels = host.split('.');
  return labels.length > 1 && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
    && !specialSuffixes.has(labels.at(-1) ?? '');
}
