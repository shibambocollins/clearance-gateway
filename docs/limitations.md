# Known limitations

Technical limitations, written as they are found. SPEC §19 has the starting list. The README summarises this file at freeze.

## Detection (Engine, Phase 1)

Measured rates come from the Bench (`eval/results/`), not from this list. Clearance Gateway never claims 100% detection.

- **Pattern- and dictionary-based.** There is no contextual understanding: a strategy document, salary discussion or unreleased financials contain no pattern to match.
- **SA ID numbers** need a valid date, citizenship digit 0/1/2 and a valid Luhn check digit. A mistyped ID (wrong check digit) is not detected.
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

- Works only on the fictional OpenBox demo page, in Chromium browsers (Manifest V3). It does not protect real AI sites, other browsers, or the desktop.
- The page must be opened with a full page load (the content script matches the URL at load time). Navigating there inside the single-page app would skip it, so the nav uses a plain link.
- It relies on the page's form structure (`data-lens` attributes) and sets a React-controlled textarea's value through the native setter. Real sites change their markup.
- Paste-time and keystroke checks, file uploads and screenshots are not covered: only submit is intercepted.
- A user can switch Lens off in the popup or remove the extension. Managed deployment (enterprise policy) is out of scope.
- No GIF recording yet. The browser automation was unavailable when Lens was built, so the end-to-end check is manual (README steps).
