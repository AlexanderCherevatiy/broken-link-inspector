export const isFirefox = typeof location !== 'undefined' && location.protocol === 'moz-extension:';

export type DataScope = 'websiteContent' | 'bookmarksInfo';
export type SitePermissions = chrome.permissions.Permissions & { data_collection?: DataScope[] };

type Extension = typeof chrome & {
  dns?: { resolve(hostname: string): Promise<{ addresses: string[] }> };
};

const globals = globalThis as typeof globalThis & { browser?: Extension };
// Firefox's browser namespace provides Promises even for APIs that require callbacks under chrome.
export const extension: Extension = isFirefox ? globals.browser! : globals.chrome;

export function dataPermission(bookmarks: boolean): SitePermissions {
  return isFirefox ? { data_collection: [bookmarks ? 'bookmarksInfo' : 'websiteContent'] } : {};
}
