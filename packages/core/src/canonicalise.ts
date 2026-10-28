// Canonicalisation (SPEC §5): make evasion variants look the same to detectors while keeping
// a map from every canonical position back to the original text, so findings can always be
// redacted in the text the user actually typed.

/** A transformed view of the original text. starts[i]/ends[i] give the original range of unit i. */
export interface TextView {
  text: string;
  starts: number[];
  ends: number[];
}

export interface Canonical {
  original: string;
  /** NFKC-normalised, zero-width characters removed. */
  text: TextView;
  /** As `text`, plus separators between digit groups removed (for numeric detectors). */
  digits: TextView;
}

const ZERO_WIDTH = new Set([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);

// Separators that may appear between digit groups: whitespace (incl. line breaks), dashes,
// dots, slashes and brackets. Unicode hyphens survive NFKC, so they are listed explicitly.
const SEPARATOR = /[\s\-./()‐‑‒–—−]/;
const MAX_SEPARATOR_RUN = 3;
const DIGIT = /[0-9]/;

export function canonicalise(original: string): Canonical {
  const text = normaliseView(original);
  return { original, text, digits: collapseDigitSeparators(text) };
}

/** Maps a [start, end) span in a view back to the original text. */
export function toOriginalSpan(view: TextView, start: number, end: number): { start: number; end: number } {
  return { start: view.starts[start]!, end: view.ends[end - 1]! };
}

function normaliseView(original: string): TextView {
  const view: TextView = { text: "", starts: [], ends: [] };
  let i = 0;
  // Normalise one code point at a time so every output unit knows its source range.
  for (const char of original) {
    const start = i;
    i += char.length;
    if (ZERO_WIDTH.has(char.codePointAt(0)!)) continue;
    const normalised = char.normalize("NFKC");
    for (let k = 0; k < normalised.length; k++) {
      view.text += normalised[k];
      view.starts.push(start);
      view.ends.push(i);
    }
  }
  return view;
}

function collapseDigitSeparators(view: TextView): TextView {
  const out: TextView = { text: "", starts: [], ends: [] };
  const { text } = view;
  let i = 0;
  while (i < text.length) {
    if (SEPARATOR.test(text[i]!) && i > 0 && DIGIT.test(text[i - 1]!)) {
      let j = i;
      while (j < text.length && SEPARATOR.test(text[j]!)) j++;
      if (j - i <= MAX_SEPARATOR_RUN && j < text.length && DIGIT.test(text[j]!)) {
        i = j; // drop the separator run between two digits
        continue;
      }
    }
    out.text += text[i];
    out.starts.push(view.starts[i]!);
    out.ends.push(view.ends[i]!);
    i++;
  }
  return out;
}
