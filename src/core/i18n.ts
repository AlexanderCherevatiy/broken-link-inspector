import english from '../../_locales/en/messages.json';

export type MessageKey = keyof typeof english;
type Catalog = Record<MessageKey, { message: string }>;
const loaded = import.meta.glob<Catalog>('../../_locales/*/messages.json', {
  eager: true, import: 'default',
});
const catalogs = new Map<string, Catalog>();
for (const [path, catalog] of Object.entries(loaded)) {
  const folder = path.split('/').at(-2);
  if (folder) catalogs.set(Intl.getCanonicalLocales(folder.replaceAll('_', '-'))[0]!, catalog);
}

export const languages = [...catalogs].map(([code, catalog]) => ({
  code,
  name: catalog.localeName.message,
}));

export function resolveLocale(preferred?: string): string {
  if (!preferred) return 'en';
  if (catalogs.has(preferred)) return preferred;
  try {
    const locale = new Intl.Locale(preferred.replaceAll('_', '-'));
    for (const candidate of [locale.baseName, locale.language + '-' + locale.script, locale.language]) {
      if (catalogs.has(candidate)) return candidate;
    }
    // The available Chinese catalogs distinguish writing systems and the Portuguese catalog is Brazilian.
    if (locale.language === 'zh') {
      return locale.maximize().script === 'Hant' ? 'zh-TW' : 'zh-CN';
    }
    if (locale.language === 'pt') return 'pt-BR';
  } catch {
    // Old storage values or platform-provided locale names can be invalid.
  }
  return 'en';
}

const rtlScripts = new Set(['Adlm', 'Arab', 'Hebr', 'Nkoo', 'Rohg', 'Samr', 'Syrc', 'Thaa']);

export function localeDirection(locale: string): 'ltr' | 'rtl' {
  const script = new Intl.Locale(resolveLocale(locale)).maximize().script;
  return script && rtlScripts.has(script) ? 'rtl' : 'ltr';
}

export function translate(locale: string, key: MessageKey, ...values: Array<string | number>): string {
  const entry = catalogs.get(resolveLocale(locale))?.[key] ?? english[key];
  return entry.message.replace(/\$\$|\$([1-9])/g, (token, index: string | undefined) => {
    return index === undefined ? token[0]! : String(values[Number(index) - 1] ?? '');
  });
}

export type Translate = (key: MessageKey, ...values: Array<string | number>) => string;
