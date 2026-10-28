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
