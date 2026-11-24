import { expect, it } from 'vitest';
import { parseCatalog, validateCatalog } from '../scripts/check-locales.mjs';

it('rejects incomplete catalogs and mismatched substitutions', () => {
  expect(validateCatalog({ greeting: { message: 'Hello $1' }, goodbye: { message: 'Goodbye' } },
    { greeting: { message: 'Привет $2' }, stray: { message: 'Test' } })).toEqual([
    'substitution mismatch in greeting', 'missing message goodbye', 'unexpected key stray',
  ]);
});

it('rejects malformed placeholder syntax and entry metadata', () => {
  const reference = { greeting: { message: '$1 and $2' }, title: { message: 'Example' } };
  expect(validateCatalog(reference, {
    greeting: { message: '$10 and $2' },
    title: { message: 'Example', description: 12 },
  })).toEqual(['invalid placeholder in greeting', 'invalid message object title']);
  expect(validateCatalog(reference, [])).toEqual(['catalog must be a JSON object']);
});

it('validates reordered substitutions and escaped dollar symbols', () => {
  expect(validateCatalog({ amount: { message: '$$ $1; $2' } },
    { amount: { message: '$2; $1 $$' } })).toEqual([]);
});

it('detects repeated object keys without matching object syntax embedded in messages', () => {
  expect(() => parseCatalog('{"a":{"message":"one","message":"two"}}')).toThrow('duplicate key message');
  expect(parseCatalog(String.raw`{"a":{"message":"{\"a\":5}"},"b":{"message":"ok"}}`)).toEqual({
    a: { message: '{"a":5}' }, b: { message: 'ok' },
  });
});
