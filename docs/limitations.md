# Known limitations

Technical limitations, written as they are found. The README summarises this file.

## Detection (Engine, Phase 1)

Measured rates come from the Bench (`eval/results/`), not from this list. Clearance Gateway never claims 100% detection.

- **Pattern- and dictionary-based.** There is no contextual understanding: a strategy document, salary discussion or unreleased financials contain no pattern to match.
- **SA ID numbers** with a valid date, citizenship digit 0/1/2 and a valid Luhn check digit are found with high confidence. With a wrong check digit (mistyped or altered) they are still found, at low confidence, and redacted (D-058), so the occasional 13-digit order number that happens to have an ID-like structure is redacted too.
- **Card numbers** cover Visa, Mastercard and Amex prefixes only. Other brands (e.g. Discover, Diners, UnionPay) are not detected.
- **Bank account numbers** are only reported within about 40 characters of a banking context word (account, acc, acct, a/c, branch code, FNB, Absa, Standard Bank, Nedbank, Capitec). An account number pasted without context is not detected; this is a deliberate trade-off against false positives on order numbers.
- **Phone numbers** cover South African formats only (`0` or `+27`, then 9 digits). `0027…`, `27…` without `+`, `+27 (0)82…` and international numbers are not detected.
- **Credential assignments** after a colon need a digit or symbol in an unquoted value, so `password: correcthorsebattery` (letters only) is missed. Assignments with `=` or quoted values are detected. Secrets with no keyword and no known format are left to the entropy detector (COULD, not built yet).
- **Evasion handled:** spaces, dashes, dots, slashes and brackets between digit groups (up to 3 characters), line breaks inside numbers, zero-width characters, and fullwidth digits/letters (NFKC). **Not handled:** digits written as words ("eight zero zero one…"), homoglyphs outside NFKC (e.g. Cyrillic letters in an email), `name [at] example [dot] com`, base64 or other encodings, and data split across multiple messages.
- **Terms** (client names, codenames) match whole words only, case-insensitively, including across line breaks. Misspellings are not matched (fuzzy matching is a COULD item). Plurals and compound words ("Fynbosch") are deliberately not matched.

## Chat path (Phase 3)

- **Provider health is per serverless instance** for real failures (2 consecutive failures → 60 s down). Simulated outages are shared through the database with up to a 2-second delay.
- **Rate limiting is by salted IP hash.** Visitors behind one NAT or proxy share a quota. Over the limit, or if usage can't be counted, replies come from the mock provider (and the UI says so).
- **The output guard is pattern-based**, like detection. It removes sensitive data the model introduced, and system-prompt fragments it echoes **verbatim**. A paraphrased leak is not caught.
- **Token restore depends on the model keeping placeholders.** If a model rewrites `[CLIENT_NAME_1]` as "the client", nothing is restored there. Leftover placeholders are counted and shown, but rewritten ones can't be counted.
- **Mock replies** (tier 1 in the demo, and everything in offline mode) are deterministic text, not real AI answers.
- **Models imitate the placeholder format.** In a live test, Gemini answered a prompt containing `[REDACTED:EMAIL]` with a reply addressed to `[CLIENT_NAME_1]`, a placeholder it invented. The guard can't restore a placeholder it never issued; it leaves it and counts it as unrestored.

## Policy compiler (Phase 4)

- **The compiler is an LLM.** It can misread ambiguous wording. In the compiler check it read "never send … numbers" as *block the request*, where the hand-written policy *removes the value* (stricter, never looser in 3/3 runs). Mitigations: schema validation, configuration the LLM cannot touch, a decision diff with looser changes flagged, the simulator, and manual activation. Nothing compiled is ever enforced without an admin activating it.
- **The compiler check uses one policy text** (the seed), 3 runs, one model. That is not a broad accuracy study.
- **Prompt injection in policy text** is mitigated by delimiters and the "text is data" instruction, and every output is validated and reviewed. It is not formally tested.
- **No concurrency control on versions:** two admins compiling at the same moment could race for the next version number. Demo scope.

## Lens extension (Phase 7)

- Chromium browsers only (Manifest V3), installed with "Load unpacked". It is not in any extension store (D-056). A user can switch it off or remove it; managed force-install is out of scope.
- **Protect this site** is generic and heuristic: it watches `textarea`, `contenteditable` and `role="textbox"` editors, Enter without Shift, and buttons that look like Send (`type=submit`, "send" in the aria-label, test id or title). Sites with unusual editors or send controls may not be intercepted, and some rich editors may refuse programmatic replacement (Lens then offers Copy). **It has not been tested on real AI sites**, because browser automation was unavailable when it was built.
- On protected sites, drafts are checked with the API shortly after typing stops (not stored). If the API is down, sends are held back until the user switches Lens off for that site.
- Paste-time checks, file uploads, screenshots and voice input are not covered.
- The demo page must be opened with a full page load (the static content script matches the URL at load time).
- No GIF recording yet. The end-to-end check is manual (README steps).

## Demo security (see docs/security.md)

- The admin code is public for judges. A **policy floor** stops anyone activating a policy looser than the baseline; tightening, simulated outages (10-minute expiry) and compiles (daily budget) remain open to anyone with the code.
- Provider API keys were reused from other local projects for testing and should be rotated after the challenge.

- **The header's "Policy updated" date is the last activation time.** Using Reset (which re-activates the seed policy) also moves it, so it means "last activation", not "last change to the rules".
