# System map: why company data ends up in AI tools

## 1. The problem

Most people at work now use AI tools, but a lot of that use happens where the company can't see or control it, like personal ChatGPT accounts. When someone pastes client details, ID numbers or passwords into one of these tools, that data leaves the company.

In South Africa, 72.5% of professionals say they use AI for work, but only 30% have had any guidance on using it safely [1]. And 64% of organisations say their AI use is unapproved or ungoverned [2].

This matters because the company is still responsible for that data. Under POPIA, it has to keep personal information secure with reasonable technical and organisational measures [10].

---

## 2. Who is involved

| Who | What they want | How much power they have | How they are affected |
|---|---|---|---|
| Employees | Finish work faster | Low over company tools, but full control over what they paste | They use the tools every day and can get disciplined |
| Managers and leadership | More productivity | High: they set targets, budgets and approved tools | They get the speed benefit and carry the legal risk |
| IT and security team | Keep data safe | Medium: they can approve or block tools, but are often not the ones driving AI adoption [3] | They find out about problems late |
| Clients and customers | Keep their personal data private | None: they usually don't know their data was pasted | **They carry the harm but have no say** |
| AI providers | More users and more data | They control how the data is stored and used | Outside the company's control |
| Information Regulator | Make sure POPIA is followed | Can investigate and act | Only gets involved after something goes wrong |

**Key point:** the people who get hurt (clients) have no say, and the people who decide (managers) feel the benefit, not the risk.

---

## 3. Root causes

### Root cause 1: Speed gets rewarded, safety doesn't get checked

- **What happens:** Companies push staff to use AI to work faster, and they also say "protect client data". When the two clash, people pick speed.
- **Why:** Deadlines and output get measured. Data protection usually doesn't.
- **Evidence:**
  - **Known (SA):** 59% of employees say time pressure and distractions cause them to make security mistakes, even when they know the safe way [2].
  - **Known (SA):** AI adoption in SA companies is mostly driven by senior leaders, not by IT [3].
  - **Assumed:** Data protection is rarely part of anyone's targets.

### Root cause 2: The company's AI tool is missing or not as good

- **What happens:** If the company doesn't give people a good AI tool, they use their own.
- **Why:** Most people started using AI on personal accounts, so that's what they're used to, and free tools are often quicker or better than the approved one.
- **Evidence:**
  - **Known (SA):** 35% of employees get their own AI tools when approved options aren't there or are too restrictive [2].
  - **Opinion (SA security firm):** Staff pick ChatGPT over the approved Copilot because it's faster or has more features [6].
  - **Known (not SA):** 89% of people who use AI for work started using it outside work first [7].

### Root cause 3: The AI policy is on paper, not in practice

- **What happens:** AI policies are missing, unclear, hard to find or not enforced.
- **Why:** Leaders think writing and announcing a policy is enough, and nothing checks it at the moment someone actually uses AI.
- **Evidence:**
  - **Known (SA):** Only 14% of mid-sized and large SA companies have a company-wide gen AI strategy, and only 13% have governance frameworks [3].
  - **Known (SA):** 33% of executives say they've shared a clear AI plan with staff, but only 10% of staff agree [4].
  - **Known (SA):** 9% of professionals aren't even sure if AI is allowed at their work [1].
  - **Known (not SA):** 81% of office workers think leaders follow different AI rules from everyone else [7].

### Root cause 4: The risk feels invisible

- **What happens:** Pasting data saves time right now. If anything bad happens, it happens later and usually to someone else, like the client.
- **Why:** Nothing seems to go wrong after pasting, so it starts to feel normal.
- **Evidence:**
  - **Known (SA):** 46.5% of professionals have had no AI training at all [1].
  - **Known (SA):** Out of 364 AI users, 10% never take safety steps and 41% only sometimes do [5].
  - **Known (not SA):** People who think they understand AI security rules actually use unapproved tools more often [8]. So training on its own won't fix this.
  - **Known (not SA):** 70% know of colleagues sharing sensitive data with AI tools [8].

### Root cause 5: People hide their AI use

- **What happens:** Some people use AI secretly so they don't get judged or get in trouble.
- **Why:** Bans and strict rules make open use risky for the employee, so they use AI where nobody can see it.
- **Evidence:**
  - **Known (not SA):** 33% would hide their AI use from managers, and 30% would hide it because of strict policies or what colleagues might think [7].
  - **Known (not SA):** In one study, forcing people to disclose their AI use reduced visible use but increased hidden use [9]. This is a working paper and isn't peer reviewed yet.
  - **Assumed for SA:** There is no proper South African data on hidden AI use yet [9].

---

## 4. How it all connects

**The chain:**
1. Leaders push AI for speed (root cause 1).
2. The company tool is missing or worse (root cause 2), so the employee uses a personal account.
3. The policy isn't clear or checked (root cause 3).
4. The risk feels far away (root cause 4), so they paste client data.
5. Nothing visibly happens.

**The loops that keep it going** (my reasoning, partly supported by the evidence above):
- **Loop A: it becomes normal.** Paste data → nothing bad happens → it feels safe → do it more → colleagues copy.
- **Loop B: bans backfire.** The company worries about leaks → bans AI or adds strict rules → people hide their use (root cause 5) → the company sees less → it worries more → stricter rules.
- **Loop C: the policy loses respect.** Leaders are seen breaking the rules → staff stop taking the policy seriously → the policy stays on paper.

**In one sentence:** the person who pastes the data gets the benefit straight away, but the client and the company carry the risk later, and nobody is measuring that risk.

---

## 5. Where Clearance Gateway helps, and where it doesn't

| Root cause | Does it help? | How |
|---|---|---|
| 1. Speed rewarded, safety not checked | Partly | The dashboard makes data protection visible to managers, but it doesn't change their targets |
| 2. Company tool missing or worse | Yes | It gives an approved route that stays fast: it removes the sensitive parts and still sends, instead of just blocking |
| 3. Policy on paper only | Yes | It turns the written policy into rules that are checked on every prompt |
| 4. Risk feels invisible | Yes | It shows the employee what was removed and why, at the moment they paste |
| 5. People hide AI use | Partly | It doesn't store prompt text or report on individuals, but if staff see it as spying, they might hide even more |

**What it doesn't fix:**
- Personal phones and home Wi-Fi
- How leaders set targets
- AI features built into other approved apps

---

## 6. What I know vs what I assume

- Most numbers come from surveys run by security companies or consultancies, and some SA samples are small (250 people for KnowBe4, 364 for Kaspersky 2026).
- Several findings come from other countries. I've marked those "not SA".
- The loops, and the claim that data protection isn't in anyone's targets, are my own reasoning, not proven facts.
- I haven't tested this with real employees yet.

---

## References

[1] Kaspersky (2025). *Shadow AI vs Managed AI: Kaspersky reviews the use of neural networks for work in South Africa.* Survey of 2,800 people in 7 countries, including South Africa. https://www.kaspersky.co.za/about/press-releases/kaspersky-reviews-the-use-of-neural-networks-for-work-in-south-africa

[2] KnowBe4 (July 2026). *Ungoverned AI Agents and Sophisticated Deepfakes Pose Critical Threats for South African Organisations.* SA sample: 250 (50 security leaders, 200 employees). https://www.businesswire.com/news/home/20260720999502/en/Ungoverned-AI-Agents-and-Sophisticated-Deepfakes-Pose-Critical-Threats-for-South-African-Organisations-New-KnowBe4-Research-Warns

[3] World Wide Worx with Dell Technologies and Intel (2025). *South African Generative AI Roadmap 2025.* 100+ mid-sized and large SA companies (sponsored research). Reported by TechCentral, https://techcentral.co.za/sa-businesses-embrace-gen-ai-dell-intel/266963/, and Reframed, https://reframed.co/?p=21878

[4] Oliver Wyman (October 2026). *AI is reshaping work, trust and brands in South Africa.* https://www.oliverwyman.com/our-expertise/insights/2026/oct/ai-is-reshaping-work-trust-brands-in-south-africa.html

[5] Kaspersky, via AfricaBusiness.com (October 2026). *South African AI users: frequent use, uneven safety habits.* 364 AI users, not nationally representative. https://africabusiness.com/2026/10/18/south-african-ai-users-safety-habits/

[6] Frost, R. (Armata Cyber Security), Lifestyle & Tech (October 2026). *It's in the shadows: unsanctioned AI tools are a pervasive risk to the business.* Opinion piece. https://lifestyleandtech.co.za/ai-cloud/article/2026-10-19/its-in-the-shadows-unsanctioned-ai-tools-are-a-pervasive-risk-to-the-business

[7] PagerDuty and Wakefield Research (2026). *Shadow AI Survey.* 1,250 office workers in Australia, Japan, the UK and the US. https://www.pagerduty.com/blog/ai/shadow-ai-workplace-survey-2026/

[8] UpGuard (2025). *The State of Shadow AI*, reported by Cybersecurity Dive. Workers in 7 countries (not SA). https://www.cybersecuritydive.com/news/shadow-ai-employee-trust-upguard/805280/

[9] Kgomosotho, K., Techila Law (September 2026). *Shadow AI: The ungoverned layer of artificial intelligence use in South Africa.* Cites Dong et al. (2025, working paper). https://www.techilalaw.com/shadow-ai-the-ungoverned-layer-of-artificial-intelligence-use-in-south-africa/

[10] Bowmans (2025). *South Africa: AI in the workplace (2 of 6): POPIA considerations.* https://bowmanslaw.com/insights/south-africa-ai-in-the-workplace-2-of-6-popia-considerations/
