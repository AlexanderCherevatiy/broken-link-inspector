import { expect, it } from 'vitest';
import { toCsv } from '../src/core/csv';

it('includes UTF-8 BOM, CRLF, quoted commas and newlines, and escaped quotes', () => {
  expect(toCsv(['Link URL', 'Source page', 'Status', 'Error'], [
    ['https://example.org/a,b', 'https://example.org/', 404, 'Нет "ссылки"\nСтрока 2'],
    ['https://example.org/b', 'https://example.org/', null, ''],
  ])).toBe('\uFEFF"Link URL","Source page","Status","Error"\r\n'
    + '"https://example.org/a,b","https://example.org/","404","Нет ""ссылки""\nСтрока 2"\r\n'
    + '"https://example.org/b","https://example.org/","",""\r\n');
});

it('neutralizes cells that spreadsheet apps could treat as formulas', () => {
  expect(toCsv(['Error'], [[' =1+1'], ['\t+SUM(A1)'], ['@cmd']]))
    .toBe('\uFEFF"Error"\r\n"\' =1+1"\r\n"\'\t+SUM(A1)"\r\n"\'@cmd"\r\n');
});
