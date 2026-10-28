import { toOriginalSpan, type Canonical, type TextView } from "../canonicalise.js";
import type { DetectContext, Finding } from "../types.js";

export interface Detector {
  id: string;
  detect(input: Canonical, ctx: DetectContext): Finding[];
}

export interface ViewMatch {
  /** Matched text in the view (canonical, so separators/zero-width chars are already gone). */
  value: string;
  /** Span in the original text. */
  start: number;
  end: number;
  /** Span in the view, for looking at surrounding context. */
  viewStart: number;
  viewEnd: number;
  match: RegExpExecArray;
}

/** All matches of a global regex in a view, with spans mapped back to the original text. */
export function scan(view: TextView, regex: RegExp): ViewMatch[] {
  const out: ViewMatch[] = [];
  for (const match of view.text.matchAll(regex)) {
    if (match[0].length === 0) continue;
    const viewStart = match.index;
    const viewEnd = viewStart + match[0].length;
    out.push({ value: match[0], viewStart, viewEnd, ...toOriginalSpan(view, viewStart, viewEnd), match });
  }
  return out;
}

/** Numeric detectors look at the text as written and with separators between digit groups removed. */
export function numericViews(input: Canonical): TextView[] {
  return [input.text, input.digits];
}
