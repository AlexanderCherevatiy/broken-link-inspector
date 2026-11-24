import { collectLinks, MAX_LINKS } from '../core/urls';
import type { Report } from '../core/types';
import { prepareTarget, sourceAddress } from '../core/privacy';
import { extension } from './api';

// executeScript serializes this function. Keep all its dependencies inside the function.
function readMainDocument(nonce: string) {
  // On older Firefox releases, the isolated document scope is our navigation identity.
  const scope = globalThis as typeof globalThis & { __bliDocumentSnapshots?: string[] };
  scope.__bliDocumentSnapshots = [...(scope.__bliDocumentSnapshots ?? []).slice(-7), nonce];
  const anchors = document.querySelectorAll('a[href]');
  const entries: { href: string; label: string }[] = [];
  let chars = 0;
  let limited = false;
  for (const anchor of anchors) {
    if (entries.length >= 20_000 || chars >= 2_000_000) {
      limited = true;
      break;
    }
    const href = anchor.getAttribute('href') ?? '';
    if (href.length > 8_192) {
      limited = true;
      continue;
    }
    const label = (anchor.getAttribute('aria-label') || anchor.textContent || '').slice(0, 240);
    entries.push({ href, label });
    chars += href.length + label.length;
  }
  return {
    entries,
    limited,
    sourceUrl: location.href,
    base: document.baseURI,
    title: document.title.trim().slice(0, 300),
  };
}

export async function captureReport(tabId: number): Promise<Report> {
  if ((await extension.tabs.get(tabId)).incognito) throw new Error('Private browsing');
  const sourceNonce = crypto.randomUUID();
  const [frame] = await extension.scripting.executeScript({
    target: { tabId },
    func: readMainDocument,
    args: [sourceNonce],
  });
  const data = frame?.result;
  const sourceUrl = data && sourceAddress(data.sourceUrl);
  if (!data || !sourceUrl) throw new Error('Unsupported source page');
  const { links, total } = collectLinks(data.entries, data.base, MAX_LINKS, prepareTarget);
  return {
    id: crypto.randomUUID(),
    sourceUrl,
    sourceTabId: tabId,
    sourceDocumentId: frame.documentId,
    sourceNonce,
    title: data.sourceUrl.includes('?') || prepareTarget(data.sourceUrl, data.sourceUrl)?.blocked ? '' : data.title,
    links,
    total,
    captureLimited: data.limited,
    createdAt: Date.now(),
    phase: 'ready',
  };
}


export async function captureBookmarks(): Promise<Report> {
  if (extension.extension.inIncognitoContext) throw new Error('Private browsing');
  const pending = (await extension.bookmarks.getTree()).reverse();
  const entries: { href: string; label: string }[] = [];
  let chars = 0;
  let limited = false;
  while (pending.length) {
    if (entries.length >= 20_000 || chars >= 2_000_000) {
      limited = true;
      break;
    }
    const bookmark = pending.pop()!;
    if (bookmark.url) {
      if (bookmark.url.length > 8_192) limited = true;
      else {
        entries.push({ href: bookmark.url, label: '' });
        chars += bookmark.url.length;
      }
    }
    if (bookmark.children) {
      for (let i = bookmark.children.length - 1; i >= 0; i--) pending.push(bookmark.children[i]!);
    }
  }
  const { links, total } = collectLinks(entries, '', MAX_LINKS, prepareTarget);
  return {
    id: crypto.randomUUID(), kind: 'bookmarks', sourceUrl: '', title: '', links, total,
    captureLimited: limited, createdAt: Date.now(), phase: 'ready',
  };
}

// executeScript serializes this function; no extension scope or page-provided code is used.
function revealAnchor(source: string, target: string, nonce: string): boolean {
  const scope = globalThis as typeof globalThis & { __bliDocumentSnapshots?: string[] };
  if (nonce && !scope.__bliDocumentSnapshots?.includes(nonce)) return false;
  if (location.origin + location.pathname !== source) return false;
  for (const node of document.querySelectorAll('a[href]')) {
    try {
      const url = new URL(node.getAttribute('href') ?? '', document.baseURI);
      url.hash = '';
      if (url.href !== target || !(node instanceof HTMLElement || node instanceof SVGElement)
          || node.getClientRects().length === 0) continue;
      node.scrollIntoView({ block: 'center', inline: 'nearest' });
      node.focus({ preventScroll: true });
      node.animate([{ outline: '3px solid #2563eb', outlineOffset: '4px' }],
        { duration: 4_000, easing: 'steps(1, end)' });
      return true;
    } catch {
      // Continue past malformed anchors.
    }
  }
  return false;
}

export async function locateSourceLink(report: Report, url: string): Promise<boolean> {
  const tabId = report.sourceTabId;
  if (tabId === undefined || !report.sourceUrl || (!report.sourceDocumentId && !report.sourceNonce)) return false;
  try {
    const tab = await extension.tabs.get(tabId);
    if (tab.incognito || (tab.url && sourceAddress(tab.url) !== report.sourceUrl)) return false;
    const [result] = await extension.scripting.executeScript({
      target: report.sourceDocumentId ? { tabId, documentIds: [report.sourceDocumentId] } : { tabId },
      func: revealAnchor,
      args: [report.sourceUrl, url, report.sourceDocumentId ? '' : report.sourceNonce ?? ''],
    });
    if (!result?.result) return false;
    await extension.tabs.update(tabId, { active: true });
    if (tab.windowId !== undefined) await extension.windows.update(tab.windowId, { focused: true });
    return true;
  } catch {
    return false;
  }
}
