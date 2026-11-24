type Cell = string | number | null | undefined;

function quote(value: Cell): string {
  let cell = String(value ?? '');
  if (/^\s*[=+\-@]|^[\t\r\n]/.test(cell)) cell = "'" + cell;
  return '"' + cell.replaceAll('"', '""') + '"';
}

export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly Cell[]>): string {
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n';
}
