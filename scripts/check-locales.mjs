import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const folder = new URL('../_locales/', import.meta.url);
const releaseLocales = [
  'ar', 'de', 'en', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'nl', 'pl', 'pt_BR', 'ru', 'th', 'tr', 'uk', 'vi',
  'zh_CN', 'zh_TW',
];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseCatalog(source) {
  const catalog = JSON.parse(source);
  // JSON.parse accepts repeated names. Detect them before a later value can silently replace an earlier one.
  const scopes = [];
  for (const match of source.matchAll(/"(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|[{}]/g)) {
    const token = match[0];
    if (token === '{') scopes.push(new Set());
    else if (token === '}') scopes.pop();
    else if (token.endsWith(':')) {
      const name = JSON.parse(token.slice(0, -1));
      const scope = scopes.at(-1);
      if (scope?.has(name)) throw new Error('duplicate key ' + name);
      scope?.add(name);
    }
  }
  return catalog;
}

function variables(message) {
  const matched = message.match(/\$\$|\$[1-9](?!\d)|\$/g) ?? [];
  return {
    invalid: matched.includes('$'),
    keys: matched.filter((match) => match !== '$$').sort().join(','),
  };
}

export function validateCatalog(reference, catalog) {
  if (!isObject(reference) || !isObject(catalog)) return ['catalog must be a JSON object'];
  const errors = [];
  for (const [key, expected] of Object.entries(reference)) {
    const entry = catalog[key];
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) errors.push('invalid key ' + key);
    if (!isObject(entry) || typeof entry.message !== 'string' || !entry.message.trim()) {
      errors.push('missing message ' + key);
      continue;
    }
    if (Object.keys(entry).some((field) => field !== 'message' && field !== 'description')
        || (entry.description !== undefined && typeof entry.description !== 'string')) {
      errors.push('invalid message object ' + key);
    }
    const supplied = variables(entry.message);
    if (supplied.invalid) errors.push('invalid placeholder in ' + key);
    else if (typeof expected?.message === 'string' && supplied.keys !== variables(expected.message).keys) {
      errors.push('substitution mismatch in ' + key);
    }
    if (key === 'extensionDescription' && entry.message.length > 132) {
      errors.push('extensionDescription exceeds 132 characters');
    }
  }
  for (const key of Object.keys(catalog)) {
    if (!Object.hasOwn(reference, key)) errors.push('unexpected key ' + key);
  }
  return errors;
}

async function checkLocales() {
  const codes = (await readdir(folder, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const required of releaseLocales) {
    if (!codes.includes(required)) throw new Error('Missing locale directory: ' + required);
  }
  const read = async (code) => {
    try {
      Intl.getCanonicalLocales(code.replaceAll('_', '-'));
      if (!/^[a-z]{2,3}(?:_[A-Z][a-z]{3})?(?:_[A-Z]{2}|_\d{3})?$/.test(code)) {
        throw new Error('invalid WebExtension locale folder name');
      }
      return parseCatalog(await readFile(new URL(code + '/messages.json', folder), 'utf8'));
    } catch (error) {
      throw new Error(code + ': ' + error.message);
    }
  };
  const reference = await read('en');
  const listings = parseCatalog(await readFile(new URL('../store-listings/listings.json', import.meta.url), 'utf8'));
  if (!isObject(listings)) throw new Error('Store listings must be a JSON object');
  const failures = [];
  const expectedListings = new Set();
  for (const code of codes) {
    const catalog = await read(code);
    for (const error of validateCatalog(reference, catalog)) failures.push(code + ': ' + error);
    const tag = Intl.getCanonicalLocales(code.replaceAll('_', '-'))[0];
    expectedListings.add(tag);
    const listing = listings[tag];
    if (!isObject(listing) || listing.catalog !== code
        || listing.name !== catalog.extensionName?.message || listing.summary !== catalog.extensionDescription?.message) {
      failures.push(tag + ': store listing metadata must match the catalog');
      continue;
    }
    const length = typeof listing.description === 'string' ? [...listing.description.trim()].length : 0;
    if (length < 250 || length > 10_000) failures.push(tag + ': store description must be 250–10,000 characters');
    if (listing.reviewStatus !== 'needs-human-review' && listing.reviewStatus !== 'human-reviewed') {
      failures.push(tag + ': invalid store review status');
    }
  }
  for (const tag of Object.keys(listings)) {
    if (!expectedListings.has(tag)) failures.push(tag + ': no catalog for this store listing');
  }
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(`Verified ${Object.keys(reference).length} localization keys and store metadata for ${codes.length} locales.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkLocales();
}
