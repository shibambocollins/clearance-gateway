# Intervention

## 1. Options I considered

I looked at five ways a company could deal with staff putting sensitive data into AI tools. The root causes (RC1–RC5) are the ones in `system-map.md`.

| Option | What it is | Root causes it helps | Main problem |
|---|---|---|---|
| A. Ban or block AI | Block AI websites and tell staff not to use AI | None for long | People use AI anyway, just hidden (RC5) |
| B. Policy and training only | Write a clear AI policy and train staff | RC3, partly RC4 | People still take shortcuts under pressure |
| C. Let an AI check every prompt | A second AI reads each prompt and decides if it breaks the policy | RC3 | The checker can be tricked, and it sends the prompt to yet another AI |
| D. Buy a commercial AI gateway | Use an existing product | RC2, RC3, RC4 | Cost, and not built for South African data such as SA ID numbers |
| **E. Clearance Gateway** | Policy written once in plain English, enforced on every prompt by fixed rules | **RC2, RC3, RC4, partly RC1 and RC5** | Can only protect what it can detect |

### Why not A (ban or block AI)?
- Bans don't stop AI use, they hide it. 66% of office workers have used AI at work while believing it wasn't allowed [3].
- In one study, forcing people to disclose AI use reduced visible use but increased hidden use [5].
- Blocking websites doesn't reach personal phones or home Wi-Fi.
- On a security forum, practitioners described staff photographing documents and uploading them to personal apps after ChatGPT was blocked [9]. This is an anecdote, not data.

### Why not B (policy and training only)?
- Knowing the rule isn't enough. 59% of SA employees say time pressure makes them make security mistakes even when they know the safe way [2].
- People who think they understand AI security rules use unapproved tools more often, not less [4].
- Training is still useful. It just needs a control at the moment of use to back it up.

### Why not C (an AI checking each prompt)?
- A checker AI can be tricked by the same prompt it is checking. Security researchers argue the enforcement step should be fixed rules outside the model [6].
- Some products that use an AI checker let the prompt through when the checker errors [7]. That fails open, which is the wrong direction for security.
- To check the prompt, you have to send it to another AI, which is the same leak you're trying to stop.

**What I kept from this idea:** I still use AI, but only to turn the written policy into rules **once**, when the admin saves it. The admin reviews the rules before they go live. After that, every prompt is checked by fixed rules, with no AI in the decision.

### Why not D (buy a product)?
- It isn't a bad option. Kaspersky recommends an AI proxy that strips sensitive data and controls access by role [1], and products like Credal already route prompts based on how sensitive the data is [8].
- The trade-offs are cost (hard for SMEs), less control, and detection that isn't built around South African data.
- My prototype shows the approach works and is cheap. I'm not claiming the idea is new.

---

## 2. Why I chose Clearance Gateway

It goes after the root causes instead of the symptom:

- **RC2, the company tool is worse:** It gives staff an approved route that stays fast. It removes the sensitive parts and still sends the prompt, instead of blocking everything.
- **RC3, the policy is on paper only:** The admin writes the policy once in plain English. It becomes rules that are checked on every prompt.
- **RC4, the risk feels invisible:** It tells the employee what was removed and why, at the moment they paste.
- **RC1, speed is rewarded (partly):** The dashboard makes data protection visible to managers.
- **RC5, people hide AI use (partly):** It doesn't store prompt text or report on individual staff, so using it doesn't feel like being watched.

**How it decides (simple version):**
1. Find sensitive data.
2. Check the policy for that person's role.
3. Remove or replace the data.
4. Only send it to an AI provider cleared for that level of data.
5. If no cleared provider is available, don't send it, and explain why. This is "fail closed".

---

## 3. Evidence from testing

I tested it with Bench, my evaluation harness, on **307 synthetic prompts**. The test set uses different sentence templates from the development set.

| What I measured | Result |
|---|---|
| Sensitive values reaching an AI unprotected | No gateway: 126 · simple regex: 48 · **Clearance Gateway: 9** (27 requests blocked outright) |
| Detection F1 score | Simple regex: 57.5% · **Clearance Gateway: 96.3%** |
| Tricks caught (spaced digits, hidden characters, etc.) | Simple regex: 3/54 · **Clearance Gateway: 45/54** |
| False alarms on look-alike numbers | Simple regex: 64.4% · **Clearance Gateway: 0%** |
| Main AI provider down: confidential requests sent to the wrong provider | Naive fallback: 87/87 · **Clearance Gateway: 0 routing mistakes** (81 blocked safely) |
| Policy rules followed (role × data type × provider) | 96/96 |
| Time added per check | 0.047 ms (median), without network |
| Policy compiler run 3 times | 3/3 valid · 0 decisions looser than intended · 35 of 96 decisions stricter than intended |

**What these results don't show:**
- The test data was generated from patterns similar to what the detectors look for, so real-world accuracy will be lower.
- 6 sensitive requests still reached the wrong provider, because their data wasn't detected at all (for example, ID numbers written out as words). Routing can only be as good as detection.
- The compiler is stricter than intended about a third of the time. That's safer than looser, but it could annoy staff, which is why the admin reviews the changes before activating.

---

## 4. Feasibility

- **Cost:** The prototype runs on free tiers (Vercel, Supabase, Gemini and Groq), and I built it as one person in about a day and a night with AI help. A small company could run something similar cheaply.
- **Speed:** A check adds less than a millisecond, so staff won't notice it.
- **What a company would need:**
  - An approved AI provider account
  - Someone to write and approve the policy
  - Apps and staff routed through the gateway
  - The browser extension on work browsers
- **Constraints:**
  - It doesn't cover personal phones.
  - The extension only works in Chromium browsers.
  - Coding agents (like Claude Code) and AI built into other apps (like Copilot in Teams) are designed for in the docs but not built.

---

## 5. Risks and assumptions

**Risks:**

| Risk | What could happen | How I reduce it |
|---|---|---|
| Too strict | Staff get blocked too often and go back to personal accounts | Redact and continue instead of block; clear explanations; shadow mode to test a policy first |
| Feels like spying | Staff hide their AI use even more (RC5) | No prompt text stored, only counts; no per-person reports |
| False sense of safety | Managers think all data is protected | The README and the UI show measured numbers, not "100% safe"; limitations are listed |
| Missed data | Data the rules don't recognise (strategy, salaries, numbers written as words) goes through | Listed in limitations; the policy can add terms; future work: better detection |
| Compiler mistakes | The AI reads the policy wrong | The admin must review and activate; looser changes are flagged; 0 looser in testing |
| The gateway itself | It sees prompts briefly, so it becomes a target | Nothing is stored; keys stay server-side; fails closed |

**Assumptions:**
- Staff will use an approved tool if it's as fast and useful as the free one.
- Showing the reason ("removed 1 ID number because…") changes behaviour over time.
- A company has at least one AI provider it trusts more than the others.
- Provider "trust tiers" in the demo are my own settings, not facts about real vendors.

---

## 6. Expected impact and how I would measure it

**Pilot idea:** one department, 6 weeks.

1. **Weeks 1–2, shadow mode:** Nothing is blocked. The gateway just records what it *would* have removed. This gives a baseline.
2. **Weeks 3–6, enforce mode:** The rules are switched on.
3. **Before and after:** A short anonymous staff survey.

| Goal | How I'd measure it | Good result |
|---|---|---|
| More AI use goes through the approved route | Share of AI requests going through the gateway | Goes up |
| Less sensitive data leaves | Sensitive findings per 100 prompts reaching uncleared providers | Goes down to near zero |
| Staff don't get blocked too much | Block rate and "this was wrong" reports | Low and stable |
| Staff don't switch to personal accounts | Anonymous survey: "Do you use a personal AI account for work?" | Doesn't go up |
| Staff understand the policy | Survey: "Do you know what you can and can't paste?" | Goes up (SA baseline: only 10% of staff feel their company's AI plan was explained clearly [10]) |

**What I can't measure:** use on personal phones. The survey is the only way to see that, and people may not answer honestly.

---

## References

[1] Kaspersky (2025). *Shadow AI vs Managed AI: Kaspersky reviews the use of neural networks for work in South Africa.* https://www.kaspersky.co.za/about/press-releases/kaspersky-reviews-the-use-of-neural-networks-for-work-in-south-africa

[2] KnowBe4 (July 2026). *Ungoverned AI Agents and Sophisticated Deepfakes Pose Critical Threats for South African Organisations.* SA sample: 250. https://www.businesswire.com/news/home/20260720999502/en/Ungoverned-AI-Agents-and-Sophisticated-Deepfakes-Pose-Critical-Threats-for-South-African-Organisations-New-KnowBe4-Research-Warns

[3] PagerDuty and Wakefield Research (2026). *Shadow AI Survey.* 1,250 office workers in Australia, Japan, the UK and the US. https://www.pagerduty.com/blog/ai/shadow-ai-workplace-survey-2026/

[4] UpGuard (2025). *The State of Shadow AI*, reported by Cybersecurity Dive. https://www.cybersecuritydive.com/news/shadow-ai-employee-trust-upguard/805280/

[5] Kgomosotho, K., Techila Law (September 2026). *Shadow AI: The ungoverned layer of artificial intelligence use in South Africa.* Cites Dong et al. (2025, working paper). https://www.techilalaw.com/shadow-ai-the-ungoverned-layer-of-artificial-intelligence-use-in-south-africa/

[6] NHI Mgmt Group (January 2026), summarising Lakera. *LLM-as-a-judge fails as prompt injection defense for AI systems.* https://nhimg.org/articles/llm-as-a-judge-fails-as-prompt-injection-defense-for-ai-systems/

[7] Bifrost documentation. *Prompt Guardrails.* (Says the LLM-judge guardrail fails open on judge errors.) https://docs.getbifrost.ai/enterprise/guardrails/prompt-guardrails

[8] TechCrunch (October 2023). *Credal aims to connect company data to LLMs securely.* https://techcrunch.com/2023/10/26/credal-aims-to-connect-company-data-to-llms-securely/

[9] r/AskNetsec thread (snapshot, March 2026). Anecdotal. https://reddit.sentinel-team.org/posts/1rrj2oq/snapshots/2026-03-13T08%3A01%3A39.342777Z

[10] Oliver Wyman (October 2026). *AI is reshaping work, trust and brands in South Africa.* https://www.oliverwyman.com/our-expertise/insights/2026/oct/ai-is-reshaping-work-trust-brands-in-south-africa.html

[11] OWASP GenAI Security Project (November 2024). *Top 10 for LLM Applications 2025.* https://genai.owasp.org/2024/11/17/owasp-reveals-updated-2025-top-10-risks-for-llms-announces-new-llm-project-sponsorship-program-and-inaugural-sponsors/

Test results: `eval/results/results.md` and `eval/results/compiler-check.md` in this repo.
