import type { RedirectHeaders, RedirectObservation } from '../core/probe';
import type { Method } from '../core/types';
import { hostPattern, isLoopbackTarget, isProbeAllowed } from '../core/urls';
import { publicDnsResult } from '../core/privacy';
import { dataPermission, extension, isFirefox } from './api';

export function hasAccess(url: string, bookmarks: boolean): Promise<boolean> {
  return extension.permissions.contains({ origins: [hostPattern(url)], ...dataPermission(bookmarks) });
}

export async function verifyNetworkAddress(url: string): Promise<'dns' | 'privateHost' | undefined> {
  if (!isFirefox) return;
  const host = new URL(url).hostname;
  if (isLoopbackTarget(url) && host.replace(/\.+$/, '') !== 'localhost') return;
  if (/^\d+\.\d+\.\d+\.\d+$|^\[.*\]$/.test(host)) return;
  try {
    const result = await extension.dns?.resolve(host);
    if (!result?.addresses.length) return 'dns';
    if (isLoopbackTarget(url)) {
      return result.addresses.every((ip) => ip === '127.0.0.1' || ip === '::1') ? undefined : 'privateHost';
    }
    return publicDnsResult(result.addresses) ? undefined : 'privateHost';
  } catch {
    return 'dns';
  }
}

export async function missingOrigins(urls: readonly string[], allowLoopback: boolean): Promise<string[]> {
  const origins = [...new Set(urls.filter((url) => isProbeAllowed(url, allowLoopback)).map(hostPattern))];
  const grants = await Promise.all(origins.map(
    (origin) => extension.permissions.contains({ origins: [origin] }),
  ));
  return origins.filter((_, index) => !grants[index]);
}

function watchRedirect(tabId: number, url: string, method: Method): RedirectObservation | undefined {
  if (!extension.webRequest?.onHeadersReceived) return undefined;
  let response: RedirectHeaders | undefined;
  let timeout: number | undefined;
  let resolveHeaders: ((value: RedirectHeaders | undefined) => void) | undefined;
  const ownOrigin = location.origin;
  const listener = (details: chrome.webRequest.OnHeadersReceivedDetails & { originUrl?: string; documentUrl?: string }): undefined => {
    const ownRequest = isFirefox
      ? details.tabId === tabId && (details.originUrl ?? details.documentUrl ?? '').startsWith(ownOrigin + '/')
      : details.tabId === tabId && details.initiator === ownOrigin;
    if (!ownRequest || details.url !== url || details.method !== method
        || details.statusCode < 300 || details.statusCode >= 400) return;
    response = {
      status: details.statusCode,
      location: details.responseHeaders?.find((header) => header.name.toLowerCase() === 'location')?.value,
    };
    resolveHeaders?.(response);
    return undefined;
  };
  try {
    extension.webRequest.onHeadersReceived.addListener(listener, {
      urls: [hostPattern(url)],
      types: ['xmlhttprequest'],
    }, ['responseHeaders']);
  } catch {
    return undefined;
  }
  return {
    read() {
      if (response) return response;
      // webRequest events and the Fetch response reach the extension on separate channels.
      return new Promise((resolve) => {
        resolveHeaders = resolve;
        timeout = window.setTimeout(() => resolve(undefined), 150);
      });
    },
    close() {
      clearTimeout(timeout);
      resolveHeaders?.(undefined);
      extension.webRequest.onHeadersReceived.removeListener(listener);
    },
  };
}

export async function redirectObserver() {
  const tabId = (await extension.tabs.getCurrent().catch(() => undefined))?.id;
  return tabId === undefined ? undefined : (url: string, method: Method) => watchRedirect(tabId, url, method);
}
