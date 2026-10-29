# Prompt for the assistant writing the documentation PDF and the pitch deck

Paste everything below the line into a new Claude conversation. Attach or upload: `HANDOFF.md`, `HANDOFF-DECK-OUTLINE.md`, and the PNG files from `docs/diagrams/` and `docs/screenshots/` (or give it the repository link).

---

You are helping Collins Shibambo finish the submission for the **Credify System Thinking Challenge 2026** (area 01, AI & Cybersecurity: *How can companies use AI without creating new security risks?*). **Submission closes Thu 29 Oct 2026, 09:00 SAST.** The project is called **Clearance Gateway** (always the full name). Tagline: *"Data only goes where it's cleared to go."*

**Repository (public):** https://github.com/shibambocollins/clearance-gateway
**Live app:** https://clearance-gateway-web.vercel.app · **API health:** https://clearance-gateway-api.vercel.app/health

## What is already built and verified

The prototype is finished and live. Read `HANDOFF.md` first: it is the verified state, with a source for every number. Do not rely on memory or on anything that contradicts it.

In one paragraph: an admin writes a company AI policy in plain English once; an LLM drafts it into rules; a person reviews the decision diff and activates it. After that, every prompt is checked by fixed rules (no LLM decides what gets through): sensitive data is redacted or pseudonymised, and each prompt is routed only to a provider cleared for it. If none is, the request is blocked and explained (fail closed). A browser extension, Lens, applies the same checks on other AI sites. Detection and routing are measured on synthetic data against two baselines.

## Your two jobs

**A. A documentation PDF** (the project documentation Credify asks for). Build it from the repository's own documents, in this order: Overview and problem framing (from Collins) → system map (from Collins) → intervention and why this one (from Collins) → how it works (`docs/architecture.md` and the diagrams) → evidence (`docs/evaluation.md`) → security and misuse (`docs/security.md`) → limitations (`docs/limitations.md`) → how to run and judge it (`README.md`) → AI-use disclosure and decision log (`docs/decisions.md`). Keep it to about 12–16 pages with the diagrams and 3–4 screenshots embedded.

**B. A pitch deck** of about 12–14 slides following `HANDOFF-DECK-OUTLINE.md` (slide by slide, mapped to the judging rubric, with the exact facts and the asset to use on each slide).

Judging rubric (out of 100): Problem understanding 20 · Systems thinking 20 · Innovation 20 · Technical solution 15 · Articulation 15 · Security / misuse awareness 10.

## Hard rules

1. **Facts only from `HANDOFF.md` and the repository.** Every number must come from there. If something is marked UNVERIFIED, say so or leave it out. Never claim 100% detection. Report the measured numbers, and say they are on synthetic data.
2. **Do not invent Collins's reasoning.** Credify requires participants to show their own thinking. The problem analysis (who is affected, why employees bypass approved tools, root causes, feedback loops, why this intervention, pilot and impact) must come from Collins's answers to the questions below. If he has not answered, write that section as clearly marked `[COLLINS: …]` gaps with the question beside it. Do not fill them with plausible text.
3. **Synthetic data only. No real people or companies.** The client names in the demo are fictional. **OpenBox is a fictional site.** Provider tiers are **demo configuration**, not claims about any vendor's data handling (say so wherever tiers appear).
4. **Style:** plain, direct, credibility first, short sentences, British spelling, no marketing filler and no AI-sounding phrases ("seamlessly", "robust", "leverage", "delve"). Match the voice of Collins's FinMe docs (https://github.com/shibambocollins/finme/tree/main/docs).
5. **AI-use disclosure must be honest:** Claude Code (Anthropic) wrote most of the code, tests and technical documentation under Collins's direction; Collins made the design and scope decisions listed in `HANDOFF.md` §11 and `docs/decisions.md` (the rows where "Collins" is in the last column). Collins writes his own "What he designed and decided" paragraph. Offer him a draft list, not a finished claim.
6. Use the diagrams and screenshots as they are (PNG). The system-map diagram does **not** exist yet: after Collins's answers, it can be drawn in the same plain draw.io style (white background, Helvetica, grey outlines) using only his causes, loops and labels. Caption: "Analysis: Collins; drawn by Claude Code".

## Questions for Collins (short answers are enough; ask them all at once)

1. Who is harmed when sensitive data reaches the wrong AI tool, and who is accountable (employee, security team, legal, customers, management)?
2. Why do employees use unapproved AI tools? Give your three main reasons from what you have seen or read.
3. What do companies usually do about it, and why does that response not hold?
4. What makes the approved route slower or worse than a personal AI account?
5. Why this intervention (a policy gateway plus a browser extension) rather than banning tools, training, DLP alone or buying an enterprise AI licence?
6. What would you measure in a 4-week pilot, and what result would make you stop or change course?
7. What did you personally design or decide? (Suggestions to confirm or cut: fail-closed routing; plain-English policy with a human reviewing the diff; keeping detection claims honest and measured; Lens as an opt-in extension; the SA ID and POPIA focus; the FinMe-based design.)
8. What South African context do you want stressed (POPIA, SA ID numbers, the Kaspersky SA data point in `docs/SPEC.md` §1)?

## What to give back

- The documentation as a **PDF**, and the deck as **.pptx or PDF**.
- A list of every `[COLLINS: …]` gap still open, so Collins can fill them in minutes.
- A one-line fact-check for each slide: which `HANDOFF.md` section or repository file backs it.
