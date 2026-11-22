// Fast drop-in for csv-reader 1.0.0 (make.fun bounty csv-reader-speed-01-run-20261121).
//
// Written from the published brief alone: one left-to-right pass over the text,
// answering {columns, rows, errors} exactly as csv-reader 1.0.0 does. Where the
// reference walks one character at a time, this reader jumps with indexOf to the
// next delimiter and builds fields with slice, so the common unquoted field costs
// a few native scans instead of a JS loop per character; a whole record with no
// quotes and no stray CR is split at once, and no result array is allocated per
// field. Quoted fields take the same fast path unless they hold a line break or
// a doubled quote.
//
// Semantics (from the brief):
// - a U+FEFF at the very start is dropped;
// - a record ends at LF or CRLF; a line left with no characters is no record;
// - outside quotes a CR not followed by LF is dropped (stray_cr);
// - a field opening with a quote runs to the next quote that is not doubled,
//   "" inside it is one quote, each CRLF or lone CR inside it reads as LF;
//   what follows its closing quote, up to the next comma or line break, is
//   appended as it stands (quote_junk, when the field ends); a quote that never
//   closes is a literal character and the text after it is read again as
//   unquoted (unterminated_quote);
// - a quote inside an unquoted field is a literal character; fields stay
//   strings, never trimmed or converted;
// - columns is the first record when header is true, else null; rows holds the
//   records after it (every record when header is false), each padded with ""
//   (short_row, with fields: its field count) or cut (long_row, with extra:
//   the cut fields) to the first record's width;
// - each error is {code, line, row}, in the order met; line is the 1-based
//   line its record starts on, row its record's index in rows (null for the
//   header).
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to the next.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read, shared by readUnquoted/readQuoted so no result array
  // is allocated per field: its value, how it ended (COMMA/LINE_BREAK/END)
  // and how many characters the unquoted read kept.
  let fieldValue = '';
  let fieldEnded = END;
  let fieldAdded = 0;

  // Reads an unquoted field starting at pos, with `init` already in its value.
  // Sets fieldValue/fieldEnded/fieldAdded: `fieldAdded` counts the characters
  // this read kept (the junk check after a closing quote counts only those).
  function readUnquoted(init) {
    let value = init;
    let added = 0;
    let start = pos;
    for (;;) {
      const ci = text.indexOf(',', pos);
      const ni = text.indexOf('\n', pos);
      const ri = text.indexOf('\r', pos);
      const c = ci === -1 ? Infinity : ci;
      const l = ni === -1 ? Infinity : ni;
      const r = ri === -1 ? Infinity : ri;
      if (c < l && c < r) {
        fieldValue = value + text.slice(start, ci);
        fieldAdded = added + (ci - start);
        pos = ci + 1;
        fieldEnded = COMMA;
        return;
      }
      if (l < r) {
        fieldValue = value + text.slice(start, ni);
        fieldAdded = added + (ni - start);
        pos = ni + 1;
        line += 1;
        fieldEnded = LINE_BREAK;
        return;
      }
      if (r < Infinity) {
        if (text.charCodeAt(ri + 1) === 10) {
          fieldValue = value + text.slice(start, ri);
          fieldAdded = added + (ri - start);
          pos = ri + 2;
          line += 1;
          fieldEnded = LINE_BREAK;
          return;
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        value += text.slice(start, ri);
        added += ri - start;
        pos = ri + 1;
        start = ri + 1;
        continue;
      }
      fieldValue = value + text.slice(start, n);
      fieldAdded = added + (n - start);
      pos = n;
      fieldEnded = END;
      return;
    }
  }

  // Appends the quoted chunk text[a..b) to `value`, turning each CRLF or lone CR
  // inside it into one LF and counting the lines. The fast path takes the slice
  // whole when the chunk holds no line break at all.
  function appendQuotedChunk(value, a, b) {
    const ni = text.indexOf('\n', a);
    if (ni !== -1 && ni < b) return appendQuotedSlow(value, a, b);
    const ri = text.indexOf('\r', a);
    if (ri !== -1 && ri < b) return appendQuotedSlow(value, a, b);
    return value + text.slice(a, b);
  }

  function appendQuotedSlow(value, a, b) {
    let out = value;
    let cur = a;
    for (;;) {
      const ni = text.indexOf('\n', cur);
      const ri = text.indexOf('\r', cur);
      const l = ni === -1 || ni >= b ? Infinity : ni;
      const r = ri === -1 || ri >= b ? Infinity : ri;
      if (l === Infinity && r === Infinity) {
        out += text.slice(cur, b);
        return out;
      }
      if (l < r) {
        out += text.slice(cur, l);
        out += '\n';
        line += 1;
        cur = l + 1;
      } else {
        out += text.slice(cur, r);
        out += '\n';
        line += 1;
        cur = r + (text.charCodeAt(r + 1) === 10 ? 2 : 1);
      }
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets the shared
  // fieldValue/fieldEnded/fieldAdded like readUnquoted (fieldAdded is 0 here
  // except for the junk read that follows a closing quote, which reports its
  // own count).
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let chunkStart = pos;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after
        // it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        readUnquoted('"');
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        value = appendQuotedChunk(value, chunkStart, q);
        value += '"';
        pos = q + 2;
        chunkStart = q + 2;
        continue;
      }
      value = appendQuotedChunk(value, chunkStart, q);
      pos = q + 1;
      break;
    }
    if (pos >= n) {
      fieldValue = value;
      fieldAdded = 0;
      fieldEnded = END;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fieldValue = value;
      fieldAdded = 0;
      fieldEnded = COMMA;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fieldValue = value;
      fieldAdded = 0;
      fieldEnded = LINE_BREAK;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fieldValue = value;
      fieldAdded = 0;
      fieldEnded = LINE_BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    readUnquoted(value);
    if (fieldAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  // Finishes one record's fields: header, padding/cutting and the row push.
  function finishRecord(fields, firstQuoted) {
    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !firstQuoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: a record whose line holds no quote and no stray CR splits at
    // once. The line ends at the next LF (or the end of the text); a CR right
    // before that LF is the CRLF ending and not content. A CR at the end of
    // the text with no LF after it is a lone CR, not a CRLF ending, so it
    // only counts as the ending when a LF was actually found.
    const lineEnd = text.indexOf('\n', pos);
    const end = lineEnd === -1 ? n : lineEnd;
    let effEnd = end;
    if (lineEnd !== -1 && effEnd > pos && text.charCodeAt(effEnd - 1) === 13) effEnd -= 1;
    const qi = text.indexOf('"', pos);
    if (qi === -1 || qi >= effEnd) {
      const ri = text.indexOf('\r', pos);
      if (ri === -1 || ri >= effEnd) {
        const fields = text.slice(pos, effEnd).split(',');
        pos = lineEnd === -1 ? n : lineEnd + 1;
        line += 1;
        finishRecord(fields, false);
        continue;
      }
    }

    const fields = [];
    let firstQuoted = false;
    do {
      const quoted = text.charCodeAt(pos) === 34;
      if (fields.length === 0) firstQuoted = quoted;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fieldValue);
    } while (fieldEnded === COMMA);
    finishRecord(fields, firstQuoted);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
