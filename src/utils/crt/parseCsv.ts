/**
 * @file parseCsv.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A small reader for CSV and tab separated text, following RFC 4180, used to read text pasted into
 * the table editor. It is a hand written state machine over the string, not a regex split, so it
 * runs in linear time on large input. Fields are never trimmed: spaces, tabs and emoji come back
 * exactly as written.
 */

const BOM = 0xfeff;
const LF = 0x0a;
const CR = 0x0d;
const COMMA = 0x2c;
const QUOTE = 0x22;

function isDelimiter(code: number): boolean {
  return code === COMMA || code === LF || code === CR;
}

/**
 * Parses CSV text into records of raw string fields.
 *
 * - A leading byte order mark is dropped.
 * - Records end at LF, CRLF or a lone CR, outside quotes.
 * - A line break at the very end of the text does not start another record. A blank line in
 *   the middle of the text is a record with one empty field.
 * - A quoted field may hold commas and line breaks. A doubled quote inside it is one quote.
 * - Malformed quoting is read leniently: text after a closing quote is kept as written, and an
 *   unterminated quote runs to the end of the text.
 * - An empty string gives no records.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  const n = text.length;
  let i = n > 0 && text.charCodeAt(0) === BOM ? 1 : 0;
  if (i >= n) return records;

  let record: string[] = [];
  for (;;) {
    let value: string;

    if (i < n && text.charCodeAt(i) === QUOTE) {
      // Quoted field: copy runs of text, turning each doubled quote into a single quote.
      i++;
      let out = '';
      let runStart = i;
      let closed = false;
      while (i < n && !closed) {
        if (text.charCodeAt(i) !== QUOTE) {
          i++;
          continue;
        }
        if (i + 1 < n && text.charCodeAt(i + 1) === QUOTE) {
          out += text.slice(runStart, i + 1);
          i += 2;
          runStart = i;
        } else {
          out += text.slice(runStart, i);
          i++;
          closed = true;
        }
      }
      if (!closed) out += text.slice(runStart, i);

      // Anything between the closing quote and the next delimiter is kept as written.
      const tailStart = i;
      while (i < n && !isDelimiter(text.charCodeAt(i))) i++;
      value = out + text.slice(tailStart, i);
    } else {
      // Unquoted field: every character is kept, up to the next delimiter.
      const start = i;
      while (i < n && !isDelimiter(text.charCodeAt(i))) i++;
      value = text.slice(start, i);
    }

    record.push(value);

    if (i >= n) {
      records.push(record);
      break;
    }

    if (text.charCodeAt(i) === COMMA) {
      i++;
      continue;
    }

    // A line break ends the record. CRLF counts as one break.
    records.push(record);
    record = [];
    i += text.charCodeAt(i) === CR && i + 1 < n && text.charCodeAt(i + 1) === LF ? 2 : 1;
    if (i >= n) break;
  }

  return records;
}
