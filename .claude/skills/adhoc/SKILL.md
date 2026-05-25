---
name: adhoc
type: orchestration
version: v1.0
description: "Lightweight targeted research for specific factual questions. No pipeline, no decomposition, no synthesis phase. Searches directly per question and answers in chat. Use when questions are concrete, scoped, and validation-oriented rather than exploratory."
---

# Adhoc Research

## Purpose

Answer a concrete set of factual questions fast and reliably — without the overhead of the full manager-research pipeline. Each question gets direct search coverage. Results go to chat. No aspect workers, no YAML outputs, no synthesis stage.

**Key distinction from manager-research:**

|                  | adhoc                                                            | manager-research              |
| ---------------- | ---------------------------------------------------------------- | ----------------------------- |
| Shape of request | Specific questions with known answer targets                     | Topics / areas to explore     |
| Workers          | None — direct execution                                          | Parallel aspect researchers   |
| Depth strategy   | 3–5 targeted searches per question + deep-dive crawl on top hits | Broad coverage across aspects |
| Synthesis phase  | No — answer inline per question                                  | Yes — cross-aspect synthesis  |
| Output default   | Chat, with inline citations                                      | Files in artifacts/           |
| File output      | Only if user explicitly asks                                     | Always                        |

***

## Trigger Signals

Load this skill when the request contains any of:

* Explicit: `adhoc`, `/adhoc`, `quick`, `just look up`, `validate`, `check`, `find specific`
* Structural: a numbered list of specific factual questions (prices, terms, configs, names)
* Stated intent: "no full pipeline", "don't need full research", "just need the data"

When in doubt between adhoc and manager-research: if the user already knows what answer shape they expect (a price, a policy clause, a product name), use adhoc. If they're exploring a space, use manager-research.

***

## Procedure

### Step 0 — Ambiguity Check (before any searching)

Scan the question set for:

1. **Scope ambiguity** — question could have multiple valid interpretations that lead to different searches (e.g. "current price" — which date, which tier, which region?)
2. **Missing context** — question depends on an unknown variable (e.g. "is this compliant?" — compliant with what?)
3. **Output format preferences** — if not stated: output to chat. If >5 questions or user says "save", write file.

If ambiguity exists on more than 1 critical dimension → call `mcp__kojori__askUserQuestions` before proceeding. Keep it ≤5 questions, single/multi choice preferred over free text.

If ambiguity is minor and inferable from context → state your assumption inline ("I'm assuming X, proceeding") and continue.

**Do not ask about things that are clearly answerable by searching.**

***

### Step 1 — Parse Questions + Detect Locale

Extract the question list from the user's input. For each question:

* Assign a short ID (`Q1`, `Q2`, …)
* Note the expected answer type: price / policy clause / product name / config / comparison / yes-no
* Flag if the question is composite (requires 2+ independent searches)
* **Assign locale** (see table below)

Break composite questions into sub-questions. Each sub-question inherits the parent's locale.

**Locale detection — any one signal is sufficient:**

| Signal                            | Examples                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Cyrillic characters in question   | "цены", "условия", "тарифы"                                                    |
| Russian platforms / brands        | Wildberries, Ozon, Яндекс, Сбер, ВКонтакте, МТС, Тинькофф, GigaChat, YandexGPT |
| Russian geo / market references   | "российский рынок", "РФ", "рублях", "СНГ", "реселлер РФ"                       |
| Topic explicitly about Russia/CIS | even if written in English: "Russian resellers", "Yandex Cloud pricing"        |

```
if any signal matches → locale = "russian"
else                  → locale = "global"
```

A single session can have mixed-locale questions. Detect per question, not globally.

***

### Step 2 — Search Per Question

For each question (or sub-question), run searches using the **locale-appropriate stack**.

***

#### Russian locale stack

Per question: **2–3 Yandex web-search + 1 Yandex generative + 1 Telegram + 1–2 Exa (English)**

| Tool              | Call                                             | Cost         | Rule                                                                                                                                     |
| ----------------- | ------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Yandex web-search | `yandex-search` skill, `type: web-search`        | \~$0.004/req | 2–3 per question                                                                                                                         |
| Yandex generative | `yandex-search` skill, `type: generative-answer` | \~$0.042/req | **max 1 per question** — use for the highest-value synthesis query only                                                                  |
| Telegram search   | `telegram-search` skill                          | quota-based  | 1 per question — **keyword phrase only** (e.g. `wildberries репрайсер`); skill handles quota check and `#hashtag` fallback automatically |
| Exa               | `mcp__exa__web_search_exa`                       | \~$0.001/req | 1–2 English-language queries for international context                                                                                   |

Query construction for Russian questions:

* Yandex web queries: Russian-language, describe the target page naturally ("тарифы YandexGPT Pro 2026", "условия использования GigaChat для юрлиц")
* Yandex generative: single best synthesis question ("Какие обязательства Яндекс несёт по необучению моделей на данных клиентов?")
* Telegram: keyword phrase matching likely channel/post language
* Exa: English equivalent of the core question for international sources

***

#### Global locale stack

Per question: **3–5 Exa searches**, optionally + Twitter for opinion/social questions

| Tool                       | Use when                                                                        |
| -------------------------- | ------------------------------------------------------------------------------- |
| `mcp__exa__web_search_exa` | All factual global questions — always                                           |
| `twitter-research` skill   | Question needs real human opinions, reviews, or live reactions — not pure facts |

Query construction for global questions:

* Write queries as natural-language descriptions of the ideal page, not keyword strings
* Vary angles: official docs, third-party analysis, pricing page, legal commentary, community
* Include year (2025/2026) when looking for current data

***

**When to go deeper (both locales):**

* First-pass results are vague, outdated, or contradictory → run `mcp__exa__crawling_exa` on the 1–2 most promising URLs to extract exact text
* You find a pricing/policy page but the relevant section is ambiguous → crawl and read the clause directly
* Official source is behind a bot check → try a secondary source (community, cached version, aggregator)

**Apply search-safeguard timing:** 600ms delay between requests.

***

### Step 3 — Validate Before Answering

Before writing the answer for each question:

* Do results agree? If multiple sources conflict → note the conflict, cite both, flag as "needs verification"
* Is the data current? Check publish/update dates. Flag if data is >6 months old and the domain is fast-moving (pricing, legal terms, product availability)
* Is the source primary or secondary? Prefer primary (official docs, ToS pages, vendor pricing) over secondary (blogs, aggregators)

If a question has no reliable answer in search results → say so explicitly. Do not infer or approximate without flagging.

***

### Step 4 — Answer Inline

Present results grouped by question. For each:

```
## Q1: [Question text]

[Answer — dense, factual, no padding]

Source: [title](url), [title](url)
```

Use tables when comparing ≥3 data points across the same dimension (e.g. pricing tiers, provider comparison).

**Grounding rules (mandatory):**

* Every factual claim cites a source inline
* Numbers must come from a source — never approximated unless explicitly flagged with `~`
* If a fact is inferred rather than stated in the source → mark as `[inferred]`
* If data is missing → write "Not found in available sources" — never fill the gap with assumptions

***

### Step 5 — Output Decision

**Default:** results in chat only.

**Write a file** when:

* User explicitly requests saving ("save this", "put it in artifacts")
* Question set is large (>5 questions) AND results are dense
* User pre-stated file output preference

**File format when writing:**

* Path: `artifacts/YYYY-MM-DD_[slug]/research.md`
* Structure: one `##` section per question block
* Include date, type `Ad-hoc research`, and source list at top

Always confirm the file was written and give the path.

***

## Search Depth Reference

| Question type                | Searches                                           | Crawl?                                            |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| Current price / rate         | 3–4 (official + aggregator + comparison)           | If price page found, crawl to extract exact table |
| Legal / policy clause        | 4–5 (official ToS + legal commentary + comparison) | Yes — crawl primary doc to extract exact clause   |
| Product availability / specs | 3–4                                                | If ambiguous, crawl product page                  |
| Yes/no existence question    | 2–3                                                | Only if first pass is inconclusive                |
| Comparison (A vs B)          | 3–4 per subject + 1–2 comparison queries           | If direct comparison page found, crawl it         |

Never stop at 1 search. 3 is the minimum for any factual claim that will be relied upon.

***

## Error Handling

| Situation                                | Action                                                               |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Search returns no relevant results       | Try 1–2 reformulated queries before declaring not found              |
| Source is paywalled / bot-blocked        | Try crawling a cached/secondary URL; note provenance                 |
| Results conflict between sources         | Present both, note conflict, recommend verification                  |
| Question is unanswerable with web search | Say so — suggest alternative (calling vendor, checking specific doc) |
| Clarification needed mid-search          | Pause, ask the specific question, then resume                        |

***

## Integration

**Search tools used:**

| Tool                       | When                                                        |
| -------------------------- | ----------------------------------------------------------- |
| `mcp__exa__web_search_exa` | All questions (both locales)                                |
| `mcp__exa__crawling_exa`   | Deep-dive on specific URLs when highlights are insufficient |
| `yandex-search` skill      | Russian locale — web-search and generative-answer           |
| `telegram-search` skill    | Russian locale — community signal per question              |
| `twitter-research` skill   | Global locale — opinion/social questions only               |

When outputting files, follow the `grounding-protocol` for source attribution.

Does **not** use: aspect-researcher workers, YAML outputs, synthesis skill, quality-gate, phase-checkpoint.