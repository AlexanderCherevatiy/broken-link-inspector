import { extension } from '../browser/api';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { languages, localeDirection, resolveLocale, translate } from '../core/i18n';
import type { Translate } from '../core/i18n';

export const themes = ['system', 'light', 'dark'] as const;
type Theme = typeof themes[number];

interface Settings {
  locale: string;
  theme: Theme;
  allowLoopback: boolean;
}
interface Preferences extends Settings {
  t: Translate;
  ready: boolean;
  error: boolean;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const Context = createContext<Preferences | null>(null);
const defaults: Settings = {
  locale: resolveLocale(extension?.i18n?.getUILanguage() ?? navigator.language),
  theme: 'system',
  allowLoopback: false,
};

function validate(settings: Record<string, unknown>): Settings {
  return {
    locale: typeof settings.locale === 'string' ? resolveLocale(settings.locale) : defaults.locale,
    theme: settings.theme === 'dark' || settings.theme === 'light' ? settings.theme : 'system',
    allowLoopback: settings.allowLoopback === true,
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const storage = extension?.storage;
    if (!storage) {
      setReady(true);
      return;
    }
    let live = true;
    const listener: Parameters<typeof storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== 'local') return;
      setSettings((old) => validate({
        ...old,
        ...Object.fromEntries(Object.entries(changes).map(([key, change]) => [key, change.newValue])),
      }));
    };
    storage.onChanged.addListener(listener);
    void storage.local.get(Object.keys(defaults)).then((saved) => {
      if (live) setSettings(validate(saved));
    }).catch(() => {
      if (live) setError(true);
    }).finally(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
      storage.onChanged.removeListener(listener);
    };
  }, []);

  const { locale, theme } = settings;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
  }, [theme, locale]);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    const previous = settings[key];
    setSettings((old) => ({ ...old, [key]: value }));
    setError(false);
    void extension?.storage?.local.set({ [key]: value }).catch(() => {
      setSettings((old) => old[key] === value ? { ...old, [key]: previous } : old);
      setError(true);
    });
  }

  return <Context.Provider value={{ ...settings, ready, error, set, t: (key, ...values) =>
    translate(locale, key, ...values) }}>{children}</Context.Provider>;
}

export function useSettings() {
  const settings = useContext(Context);
  if (!settings) throw new Error('Settings provider missing');
  return settings;
}

export function LanguageSelect() {
  const { locale, t, set } = useSettings();
  return <select aria-label={t('language')} value={locale}
    onChange={(event) => set('locale', event.target.value)}>
    {languages.map(({ code, name }) => <option value={code} key={code} lang={code}>{name}</option>)}
  </select>;
}
