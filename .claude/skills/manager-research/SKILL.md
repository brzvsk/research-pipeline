---
name: manager-research
type: manager
version: v4.5
description: "Research pipeline orchestration (phases 1-5) with user confirmation. Supports BOTH web search (exa) AND Twitter/X (getxapi) for real-world experience. Optional counter-thesis exploration for dialectical synthesis. Use this skill when the user wants comprehensive research on a topic. ALWAYS confirms the research plan with the user before firing research workers. Pauses after research with a results summary before proceeding to synthesis."
---

# Research Pipeline Manager v4.5

## Purpose

Orchestrate multi-phase research pipeline from topic decomposition to final report. Features:

* **User confirmation** before firing research workers
* **Research checkpoint** (Phase 2.5) — summary table + user confirmation before synthesis
* **Predictable delays** using `sleep 0.6` (not random jitter)
* **Dual output** - both MD and HTML reports
* **Locale-aware sources** — Russian topics use exa + Yandex generative; global topics use exa + Twitter
* **Counter-thesis** — Optional 2-3 counter-aspects for dialectical synthesis (optional)

## Overview

```
Phase 1        Phase 1.5        Phase 2         Phase 2.5           Phase 3+4              Phase 5
Planning  ───▶ Confirm ───▶  Research ×N ───▶  Summary +  ───▶  synthesizer agent  ───▶  report-generator agent
   │              │              │               Confirm            │         │                  │
   ▼              ▼              ▼                  │               ▼         ▼                  ▼
plan.yaml    user confirms   aspects/*.yaml   user confirms   synthesis.yaml  quality.yaml  *_REPORT.md + *.html
                                                              [paths only returned to orchestrator]
```

**Agent split:**

| Phase | Agent               | Tools                 | Returns                                          |
| ----- | ------------------- | --------------------- | ------------------------------------------------ |
| 2     | `aspect-researcher` | search + Read + Write | `aspects/*.yaml` paths                           |
| 3+4   | `synthesizer`       | Read + Write          | `synthesis.yaml`, `quality.yaml` paths + verdict |
| 5     | `report-generator`  | Read + Write          | `*_REPORT.md`, `*_REPORT.html` paths             |

Orchestrator passes **file paths only** between agents — never raw research content.

## Clarification Protocol

During **Phase 1 (Planning)**, if anything is unclear, ambiguous, or needs user confirmation:

```markdown
Use: `AskUserQuestions` tool
```

Do NOT proceed with planning with incomplete information. Ask before planning, not after.

***

## Prerequisites

Before starting:

* Topic provided by user
* Session ID generated (format: `YYYY-MM-DD_topic_name`)
* artifacts/{session\_id}/ directory created

***

## Phase 1: Planning

**Gate:** None (entry point)

**Actions:**

1. Invoke research-planner skill with topic (and optional counter\_thesis)
2. Decompose into 3-7 thesis aspects (+ 2-3 counter-thesis if enabled)
3. Generate queries for each aspect

**Orchestration:**

```
# Pass counter_thesis if user requested dialectical exploration
# Default: false
Skill(skill: "research-planner", args: "{topic} counter_thesis: true|false")
```

**Output:** `artifacts/{session}/plan.yaml`

```yaml
# plan.yaml schema
topic: string
depth: quick|medium|deep
created_at: timestamp
session_id: string

aspects:
  - id: string
    name: string
    description: string
    queries: string[]
    priority: number

settings:
  max_sources_per_aspect: 15
  min_findings_per_aspect: 5
  min_aspects_for_synthesis: 3
```

**Quality Check:**

* aspects.length >\= 3
* Each aspect has >\= 2 queries

**Next:** Phase 1.5 (User Confirmation)

***

## Phase 1.5: User Confirmation (NEW)

**Gate:** plan.yaml created

**Actions:**

1. Present the research plan to the user for review
2. Ask for confirmation before proceeding
3. Allow modifications if needed

**IMPORTANT:** This step MUST happen before any research workers are spawned. Do NOT skip this step.

**Presentation Format:**

Present the plan in a clear, scannable format. When counter-thesis aspects exist, group them under a separate sub-header with a visual distinction.

```
## Research Plan Ready for Review

**Topic:** [topic name]
**Depth:** [quick/medium/deep]
**Aspects:** [N] total ([M] thesis + [K] counter-thesis)

### Thesis Aspects:
1. **[aspect name]** - [description]
   - [query 1]
   - [query 2]

2. **[aspect name]** - [description]
   ...

### Counter-Thesis Aspects (Challenging the Dominant Narrative):
3. **[counter-aspect name]** - Challenges the claim that [thesis claim]
   - [query 1: skeptical/falsification framing]
   - [query 2]
   - [query 3]

4. **[counter-aspect name]** - Challenges the assumption that [thesis claim]
   ...

### Next Steps:
- Each aspect will be researched sequentially (thesis first, then counter-thesis)
- All research uses predictable 600ms delays between searches
- Counter-thesis findings will be synthesized alongside thesis findings for dialectical convergence
- Final deliverables: MD report + HTML report
```

**User Options:**

| Response                         | Action                            |
| -------------------------------- | --------------------------------- |
| "Looks good" / "Proceed" / "Yes" | Continue to Phase 2               |
| "Add/remove/modify aspects"      | Update plan.yaml, then re-present |
| "Cancel" / "Stop"                | Halt pipeline, report status      |

**Wait for explicit user confirmation before proceeding.**

**Next:** Phase 2 (only after user confirms)

***

## Phase 2: Sequential Research (Twitter + Yandex + Telegram)

**Gate:**

```yaml
type: file_exists
condition: "plan.yaml"
validation: "user_confirmed: true"
```

**Execution model: foreground only**

All `Task()` calls run **foreground** (`run_in_background: false`, which is the default).
Aspect workers need tool access (`Bash`, `mcp__exa__web_search_exa`, `Read`, `Write`) — background agents cannot make tool calls, so they must block until complete before the next aspect starts.

**Actions:**

1. Read plan.yaml
2. For each aspect, check `source_type` (web|twitter|both|yandex)
3. Invoke aspect worker — **wait for completion** before starting the next one

### Source Type Routing

| source\_type | Search Stack            | Research Worker Action                             |
| ------------ | ----------------------- | -------------------------------------------------- |
| `web`        | exa only                | Use mcp\_\_exa\_\_web\_search\_exa only            |
| `twitter`    | getxapi only            | Use getxapi via twitter-research skill only        |
| `both`       | exa + getxapi (Twitter) | Use BOTH sources, merge findings                   |
| `yandex`     | exa + Yandex generative | Use exa + Yandex generative-answer, merge findings |

**Orchestration:**

```
plan = Read("artifacts/{session}/plan.yaml")

For each aspect in plan.aspects:
  source = aspect.source_type  # web|twitter|both|yandex

  if source == "web":
    queries = filter_web_queries(aspect.queries)
    worker_prompt = build_web_worker(aspect, queries)

  elif source == "twitter":
    queries = filter_twitter_queries(aspect.queries)
    worker_prompt = build_twitter_worker(aspect, queries)

  elif source == "both":
    web_queries = filter_web_queries(aspect.queries)
    twitter_queries = filter_twitter_queries(aspect.queries)
    worker_prompt = build_combined_worker(aspect, web_queries, twitter_queries)

  elif source == "yandex":
    web_queries = filter_web_queries(aspect.queries)          # unprefixed queries → exa
    yandex_queries = filter_yandex_queries(aspect.queries)    # "yandex_query:" prefixed → Yandex generative
    worker_prompt = build_yandex_worker(aspect, web_queries, yandex_queries)

  # run_in_background: false (default) — worker needs tool calls, must run foreground
  Task(
    subagent_type: "aspect-researcher",
    prompt: worker_prompt,
    description: "Research {aspect.name} ({source})",
    run_in_background: false
  )
  # wait for completion before next aspect
```

**Query prefix conventions:**

| Prefix in plan.yaml | Routes to                                         | Cost                             |
| ------------------- | ------------------------------------------------- | -------------------------------- |
| *(no prefix)*       | exa web search                                    | \~$0.001                         |
| `twitter_query:`    | getxapi Twitter search                            | \~$0.001                         |
| `yandex_query:`     | Yandex `web-search` (default)                     | \~$0.004                         |
| `yandex_gen_query:` | Yandex `generative-answer`                        | \~$0.042 — **max 1 per aspect**  |
| `telegram_query:`   | Telegram `search-query` → `search-hashtag` on 429 | quota-limited — **1 per aspect** |

### Web Research Pattern (search-safeguard)

```
# Use mcp__exa__web_search_exa with 600ms delays
for query in web_queries:
  sleep 0.6
  result = mcp__exa__web_search_exa(query, numResults: 8)
  process_result(result)
```

### Twitter Research Pattern (twitter-research skill)

```
# Use getxapi with 600ms delays
Skill(skill: "twitter-research")

for query in twitter_queries:
  sleep 0.6
  result = Bash("npx -y bun run {baseDir}/../getxapi/scripts/client.ts search '{query}'")
  tweet_data = parse_json(result)
  process_tweet_result(tweet_data)
```

### Combined Pattern (both)

```
# Run web and twitter searches, merge results
web_findings = []
for query in web_queries:
  sleep 0.6
  result = mcp__exa__web_search_exa(query, numResults: 8)
  web_findings.extend(extract_findings(result))

twitter_findings = []
for query in twitter_queries:
  sleep 0.6
  result = Bash("npx -y bun run .../client.ts search '{query}'")
  twitter_findings.extend(extract_tweets(result))

all_findings = web_findings + twitter_findings
write_findings(all_findings)
```

### Yandex Pattern (yandex) — for Russian/CIS topics

Two Yandex operations run in the same aspect worker. **web-search is the default; generative is selective.**

```
# Load yandex-search skill for script path
Skill(skill: "yandex-search")
YANDEX_SCRIPT = ".claude/skills/yandex-search/scripts/client.ts"

# 1. Yandex web-search (cheap, ~$0.004/req) — for yandex_query: prefixed queries
yandex_web_findings = []
for query in yandex_web_queries:  # prefixed "yandex_query:" in plan.yaml
  sleep 0.6
  result = Bash("npx -y bun run {YANDEX_SCRIPT} web-search '{query}'")
  yandex_web_findings.extend(extract_web_findings(result))  # crawl top results like exa

# 2. Yandex generative-answer (~$0.042/req) — for yandex_gen_query: prefixed queries ONLY
#    Max 1 per aspect. Skip if no yandex_gen_query: in plan.
yandex_gen_findings = []
for query in yandex_gen_queries:  # prefixed "yandex_gen_query:" in plan.yaml (max 1)
  sleep 1.0  # respect 1 req/s hard rate limit
  result = Bash("npx -y bun run {YANDEX_SCRIPT} generative-answer '{query}'")
  gen_data = parse_json(result)  # { answer, sources[] }
  if gen_data.answer is not empty:
    yandex_gen_findings.append(extract_generative_finding(gen_data))
  else:
    # Fallback: run as web-search instead
    result = Bash("npx -y bun run {YANDEX_SCRIPT} web-search '{query}'")
    yandex_gen_findings.extend(extract_web_findings(result))

# 3. exa (supplemental English-language context)
exa_findings = []
for query in web_queries:  # unprefixed queries in plan.yaml
  sleep 0.6
  result = mcp__exa__web_search_exa(query, numResults: 8)
  exa_findings.extend(extract_findings(result))

all_findings = exa_findings + yandex_web_findings + yandex_gen_findings
write_findings(all_findings)
```

**Yandex generative extraction rules:**

* `gen_data.answer` → finding with `type: yandex_generative`, `content: answer`
* `gen_data.sources` → `cited_sources` list on that finding (do NOT crawl)
* Tag generative findings with `tier: A` (Yandex synthesizes from authoritative RU sources)
* Yandex web-search results are crawlable via `mcp__exa__crawling_exa` — treat like exa results

```
# 4. Telegram (community signal — all public channels)
TG_SCRIPT = ".claude/skills/telegram-search/scripts/client.ts"

for query in telegram_queries:  # prefixed "telegram_query:" in plan.yaml (always 1)
  stripped = strip_prefix("telegram_query:", query)

  result = Bash("npx -y bun run {TG_SCRIPT} search-query '{stripped}' 15")

  if result starts with "ERROR: 429" or result contains "FLOOD_PREMIUM":
    # Quota exhausted — derive hashtag and fall back
    hashtag = derive_hashtag(stripped)  # concatenate key words with _
    result = Bash("npx -y bun run {TG_SCRIPT} search-hashtag '{hashtag}' 15")

  posts = parse_json(result)  # list of post items
  pass_to_aspect_researcher(posts)  # researcher handles depth expansion
```

**Cost estimate per Russian research session:**

| Depth  | Aspects | Yandex gen calls | Telegram calls  | Approx Yandex cost |
| ------ | ------- | ---------------- | --------------- | ------------------ |
| quick  | 3       | 3                | 3 (quota-based) | \~$0.13            |
| medium | 5       | 5                | 5 (quota-based) | \~$0.21            |
| deep   | 7       | 7                | 7 (quota-based) | \~$0.29            |

**Output:** `artifacts/{session}/aspects/*.yaml`

```yaml
# aspect YAML includes source info per finding
aspect_id: "user_experience"
source_type: "both|yandex"
findings:
  - type: web|tweet|yandex_generative
    source: "..."
    content: "..."
  # yandex_generative findings include cited_sources[]
  - type: yandex_generative
    source: "https://yandex.ru/search/..."
    content: "Synthesized answer from Yandex"
    cited_sources:
      - title: "Source 1"
        url: "https://..."
  # ...
```

**Quality Check:**

* count(aspects/\*.yaml) >\= plan.min\_aspects
* Each file has findings.length >\= 3 (combined web + twitter)

**Next:** Phase 2.5 (or retry failed aspects)

***

## Phase 2.5: Research Summary & User Checkpoint

**Gate:** `count(aspects/*.yaml) >= plan.min_aspects`

**IMPORTANT:** This step MUST happen before synthesis. Do NOT skip this step. Present findings and wait for explicit user confirmation.

**Actions:**

1. Read all completed `aspects/*.yaml` files
2. Count total findings and unique sources across all aspects
3. Build a summary table (one row per aspect)
4. Present to user with a concise overview
5. Wait for explicit confirmation before proceeding to synthesis

**Presentation Format:**

```
## Research Complete — Ready for Synthesis

**Session:** {session_id}
**Completed:** N/M aspects  |  Total findings: F  |  Unique sources: S

| Aspect | Findings | Key source | Status |
|--------|----------|------------|--------|
| [name] | N        | domain.com | ✓      |
| [name] | N        | domain.com | ✓      |
| ...    |          |            |        |

**Top signals:** [1-2 sentence observation about what stands out across aspects]

Proceed to synthesis? (or name an aspect to re-run)
```

**User Options:**

| Response                 | Action                                             |
| ------------------------ | -------------------------------------------------- |
| "Proceed" / "Yes" / "Go" | Continue to Phase 3                                |
| "Re-run \[aspect name]"  | Re-run that aspect worker, then re-present summary |
| "Stop" / "Cancel"        | Halt pipeline, report status                       |

**Wait for explicit user response before proceeding.**

**Next:** Phase 3 (only after user confirms)

***

## Phase 3+4: Synthesis + Quality Gate

**Gate:**

```yaml
type: quality_threshold
condition: "count(aspects/*.yaml) >= 3"
```

**Pre-phase: update state.yaml**

```yaml
current_phase: synthesis
phase_states.synthesis: in_progress
last_updated: now()
```

**Orchestration:**

```
# Pass file paths only — never raw research content
Task(
  subagent_type: "synthesizer",
  description: "Synthesize findings + quality gate",
  prompt: |
    session_id: {session_id}
    aspects_path: artifacts/{session}/aspects/
    plan_path: artifacts/{session}/plan.yaml
    synthesis_output_path: artifacts/{session}/synthesis.yaml
    quality_output_path: artifacts/{session}/quality.yaml
)

# Synthesizer returns:
result = {
  synthesis_path: "artifacts/{session}/synthesis.yaml",
  quality_path: "artifacts/{session}/quality.yaml",
  verdict: PASS|WARN|FAIL,
  total_score: 0.0-1.0,
  issues_count: 0
}
```

**Post-task: schema validation**

After the synthesizer Task returns, assert the following before proceeding:

```
synthesis = Read("artifacts/{session}/synthesis.yaml")

Assert synthesis.insights[*].type is present        # observation|recommendation|warning
Assert synthesis.cross_aspect_patterns[*].type is present  # recurring|contradiction|causal|gap
Assert synthesis.source_summary is present
Assert synthesis.quality_metrics is present

If any assertion fails:
  Report missing fields to user
  Ask: "Retry synthesis or patch manually?"
  Halt until resolved
```

**Post-phase: update state.yaml**

```yaml
phase_states.synthesis: completed
phase_states.quality_gate: completed
last_updated: now()
```

**Routing on verdict:**

| Verdict | Action                                                           |
| ------- | ---------------------------------------------------------------- |
| PASS    | → Phase 5                                                        |
| WARN    | → Phase 5 (pass issues\_count to report-generator)               |
| FAIL    | → Report gaps to user, suggest re-running affected aspects, halt |

**Outputs:**

* `artifacts/{session}/synthesis.yaml`
* `artifacts/{session}/quality.yaml`

**Next:** Phase 5 or halt

***

## Phase 5: Report Generation

**Gate:**

```yaml
type: quality_verdict
condition: "verdict in [PASS, WARN]"
```

**Pre-phase: update state.yaml**

```yaml
current_phase: report
phase_states.report: in_progress
last_updated: now()
```

**Orchestration:**

```
# Pass file paths only — agent reads all content from disk
Task(
  subagent_type: "report-generator",
  description: "Generate MD + HTML report",
  prompt: |
    session_id: {session_id}
    synthesis_path: artifacts/{session}/synthesis.yaml
    quality_path: artifacts/{session}/quality.yaml
    plan_path: artifacts/{session}/plan.yaml
    output_dir: artifacts/{session}/
    topic_slug: {topic_slug}
)

# report-generator returns:
result = {
  md_report_path: "artifacts/{session}/{topic_slug}_REPORT.md",
  html_report_path: "artifacts/{session}/{topic_slug}_REPORT.html"
}
```

**Post-phase: update state.yaml**

```yaml
phase_states.report: completed
current_phase: completed
last_updated: now()
```

**Output:**

* `artifacts/{session}/{topic_slug}_REPORT.md`
* `artifacts/{session}/{topic_slug}_REPORT.html`

**Next:** None (terminal)

***

## State Management

### State File

Location: `artifacts/{session}/state.yaml`

```yaml
session_id: "2026-01-30_topic_name"
topic: "AI agents orchestration"
workflow: "manager-research"
version: "v2.0"
current_phase: "confirm"
phase_states:
  planning: completed
  confirm: pending
  research: pending
  synthesis: pending
  quality_gate: pending
  report: pending
started_at: "2026-01-30T10:00:00Z"
last_updated: "2026-01-30T10:00:00Z"
user_confirmed: false
error: null
```

### Update Pattern

Before phase:

```yaml
current_phase: "{phase}"
phase_states.{phase}: "in_progress"
last_updated: now()
```

After phase:

```yaml
phase_states.{phase}: "completed"
last_updated: now()
```

After user confirmation:

```yaml
current_phase: "research"
phase_states.confirm: "completed"
user_confirmed: true
last_updated: now()
```

On error:

```yaml
phase_states.{phase}: "failed"
error: "{error_message}"
```

***

## Recovery

### On Worker Failure

```
1. Log which aspect failed
2. Continue with remaining workers
3. At phase end:
   - If completed >= min_aspects → continue
   - If completed < min_aspects → retry failed only
```

### On Phase Failure

```
1. Update state with error
2. Report to user:
   - What phase failed
   - What was completed
   - Specific error
3. Suggest action:
   - Retry command
   - Manual intervention
```

### On Resume

```
1. Read state.yaml
2. Find current_phase
3. If in_progress → resume from there
4. If failed → offer retry or rollback
5. Skip completed phases
```

### On Rollback

Use resume-checkpoint skill to restore to previous phase:

```
Skill(skill: "resume-checkpoint", args: |
  session_id: {session}
  target_phase: {phase_to_restore_to}
)
```

***

## Example Run

```
User: /research "AI agents orchestration patterns"

Phase 1: Planning
  ✓ Decomposed into 5 aspects
  → artifacts/2026-01-30_topic_name/plan.yaml

Phase 1.5: User Confirmation
  ? Present plan to user for review
  ✓ User confirmed: "Proceed with research"

Phase 2: Research
  ✓ Running 5 researchers sequentially (600ms delays)
  ✓ aspects/architecture.yaml (12 findings)
  ✓ aspects/patterns.yaml (8 findings)
  ✓ aspects/tools.yaml (15 findings)
  ✓ aspects/challenges.yaml (7 findings)
  ✓ aspects/future.yaml (6 findings)

Phase 2.5: Research Summary & User Checkpoint
  ? Research Complete — Ready for Synthesis
    Session: 2026-01-30_topic_name | 5/5 aspects | 48 findings | 31 sources

    | Aspect       | Findings | Key source          | Status |
    |--------------|----------|---------------------|--------|
    | architecture | 12       | martinfowler.com    | ✓      |
    | patterns     | 8        | arxiv.org           | ✓      |
    | tools        | 15       | github.com          | ✓      |
    | challenges   | 7        | hbr.org             | ✓      |
    | future       | 6        | research.google.com | ✓      |

    Top signals: Strong convergence on tool-use patterns; future aspect flags reliability concerns.

  ✓ User confirmed: "Proceed"

Phase 3: Synthesis
  ✓ Aggregated 48 findings
  ✓ Identified 4 cross-aspect patterns
  → artifacts/2026-01-30_topic_name/synthesis.yaml

Phase 4: Quality Gate
  ✓ Saturation: 72% (threshold: 50%)
  ✓ Diversity: 0.81 (threshold: 0.5)
  → Verdict: PASS

Phase 5: Report
  ✓ Generated MD report (2,400 words)
  ✓ Generated HTML report (visual, light theme)
  → artifacts/2026-01-30_topic_name/topic_name_REPORT.md
  → artifacts/2026-01-30_topic_name/topic_name_REPORT.html

Status: COMPLETED
```

***

See [CHANGELOG.md](/CHANGELOG.md) for version history.