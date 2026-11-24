import { isProbeAllowed, MAX_URL_LENGTH } from './urls';

const sensitiveName = /(?:token|password|passwd|credential|secret|signature|session|assertion|saml|authorization|oauth|xamz|xgoog)|^(?:key|apikey|sig|jwt|auth|code|state|otp|pwd|sid|ticket|reset)$/i;
const jwt = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/;
const sensitivePath = /\/(?:reset(?:-password)?|password-reset|magic-link|invite|activate|verify(?:-email)?|token|recover)\/[^/]+/i;

function decode(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function urlObject(address: string, base?: string) {
  try {
    const url = new URL(address, base || undefined);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.href.length <= MAX_URL_LENGTH
      ? url : undefined;
  } catch { return undefined; }
}

function hasSensitivePath(url: URL) {
  const path = decode(url.pathname);
  return sensitivePath.test(path) || jwt.test(path) || /(?:%40|@)[^/]+\./i.test(path);
}

export function sourceAddress(address: string): string {
  const url = urlObject(address);
  if (!url) return '';
  if (url.username || url.password || hasSensitivePath(url)) return url.origin + '/';
  return url.origin + url.pathname;
}

export function prepareTarget(address: string, base: string): { url: string; blocked?: true } | undefined {
  if (!address.trim() || address.trim().startsWith('#')) return undefined;
  const url = urlObject(address, base);
  if (!url) return undefined;
  const privateQuery = [...url.searchParams].some(([name, value]) =>
    sensitiveName.test(name.replace(/[^a-z0-9]/gi, '')) || jwt.test(value) || /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value));
  const privateFragment = jwt.test(decode(url.hash))
    || /(?:access[_-]?token|id[_-]?token|signature|password)=/i.test(decode(url.hash));
  if (url.username || url.password || hasSensitivePath(url) || privateQuery || privateFragment) {
    return { url: sourceAddress(url.href), blocked: true };
  }
  url.hash = '';
  return { url: url.href };
}

export function publicDnsResult(addresses: readonly string[]): boolean {
  return addresses.length > 0 && addresses.every((item) => {
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(item) && !/^[\da-f:]+:[\da-f:.]+$/i.test(item)) return false;
    return isProbeAllowed('http://' + (item.includes(':') ? '[' + item + ']' : item) + '/');
  });
}
