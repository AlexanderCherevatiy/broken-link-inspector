import { expect, it } from 'vitest';
import { languages, localeDirection, resolveLocale, translate } from '../src/core/i18n';
import en from '../_locales/en/messages.json';

it('offers all release languages and chooses a matching regional or script variant', () => {
  expect(languages.map(({ code }) => code)).toEqual(expect.arrayContaining([
    'ar', 'de', 'en', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'nl', 'pl', 'pt-BR', 'ru', 'th', 'tr', 'uk',
    'vi', 'zh-CN', 'zh-TW',
  ]));
  expect(resolveLocale('ru-RU')).toBe('ru');
  expect(resolveLocale('ja')).toBe('ja');
  expect(resolveLocale('zh-Hant-HK')).toBe('zh-TW');
  expect(resolveLocale('zh-Hans-SG')).toBe('zh-CN');
  expect(resolveLocale('pt_BR')).toBe('pt-BR');
  expect(resolveLocale('id-ID')).toBe('id');
  expect(resolveLocale('sv-SE')).toBe('en');
  expect(resolveLocale('invalid_!!!')).toBe('en');
});

it('interpolates values in language-specific order and preserves literal dollar signs in arguments', () => {
  expect(translate('en', 'scan')).toBe('Scan');
  expect(translate('ru', 'scan')).toBe('Проверить');
  expect(translate('ru', 'progressCount', 3, 8)).toBe('Обработано 3 из 8');
  expect(translate('ja', 'progressCount', 3, 8)).toBe('8 件中 3 件を処理済み');
  expect(translate('ar', 'selectLink', 'https://example.org/$value')).toContain('https://example.org/$value');
});

it('chooses a right-to-left direction for Arabic and left-to-right for other release locales', () => {
  expect(localeDirection('ar-SA')).toBe('rtl');
  expect(localeDirection('en')).toBe('ltr');
  expect(localeDirection('zh-Hans')).toBe('ltr');
});

it('supplies meaningful nonempty labels in every locale', () => {
  for (const { code, name } of languages) {
    expect(translate(code, 'localeName')).toBe(name);
    expect(translate(code, 'retrySelected')).not.toBe('');
  }
  expect(Object.keys(en).length).toBeGreaterThanOrEqual(115);
});
