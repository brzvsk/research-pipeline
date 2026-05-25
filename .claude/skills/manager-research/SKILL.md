---
name: manager-research
type: manager
version: v4.4
description: "Research pipeline orchestration (phases 1-5) with user confirmation. Supports BOTH web search (exa) AND Twitter/X (getxapi) for real-world experience. Optional counter-thesis exploration for dialectical synthesis. Use this skill when the user wants comprehensive research on a topic. ALWAYS confirms the research plan with the user before firing research workers. Pauses after research with a results summary before proceeding to synthesis."
---

# Research Pipeline Manager v4.4

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
Phase 1        Phase 1.5        Phase 2         Phase 2.5        Phase 3       Phase 4        Phase 5
Planning  ───▶ Confirm ───▶  Research ×N ───▶  Summary +  ───▶ Synthesis ───▶ Quality ───▶ Report (MD + HTML)
   │              │              │               Confirm            │             │            │
   ▼              ▼              ▼                  │               ▼             ▼            ▼
plan.yaml    user confirms   aspects/*.yaml   user confirms   synthesis.yaml  quality.yaml  *_REPORT.md + *.html
```

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

1. Invoke research-planner skill with topic (and optional counter_thesis)
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

| Prefix in plan.yaml | Routes to                                                  | Cost                                             |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| *(no prefix)*       | exa web search                                             | \~$0.001                                         |
| `twitter_query:`    | getxapi Twitter search                                     | \~$0.001                                         |
| `yandex_query:`     | Yandex `web-search` (default)                              | \~$0.004                                         |
| `yandex_gen_query:` | Yandex `generative-answer`                                 | \~$0.042 — **max 1 per aspect**                  |
| `telegram_query:`   | Telegram `search-query` → `search-hashtag` on 429         | quota-limited — **1 per aspect**                 |

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

| Depth  | Aspects | Yandex gen calls | Telegram calls | Approx Yandex cost |
| ------ | ------- | ---------------- | -------------- | ------------------ |
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

| Response | Action |
| -------- | ------ |
| "Proceed" / "Yes" / "Go" | Continue to Phase 3 |
| "Re-run [aspect name]" | Re-run that aspect worker, then re-present summary |
| "Stop" / "Cancel" | Halt pipeline, report status |

**Wait for explicit user response before proceeding.**

**Next:** Phase 3 (only after user confirms)

***

## Phase 3: Synthesis

**Gate:**

```yaml
type: quality_threshold
condition: "count(aspects/*.yaml) >= 3"
```

**Actions:**

1. Load all aspect files
2. Invoke synthesis skill
3. Find cross-aspect patterns
4. Generate aggregated insights

**Orchestration:**

```
Skill(skill: "synthesis")

# Synthesis skill reads from artifacts/{session}/aspects/
# Writes to artifacts/{session}/synthesis.yaml
```

**Output:** `artifacts/{session}/synthesis.yaml`

```yaml
# synthesis.yaml schema
metadata:
  session_id: string
  aspects_count: number
  total_findings: number
  total_sources: number
  created_at: timestamp

insights:
  - id: string
    title: string
    description: string
    evidence:
      - finding_id: string
        aspect_id: string
        weight: number
    confidence: high|medium|low

cross_aspect_patterns:
  - pattern: string
    aspects: string[]
    strength: number

themes:
  - name: string
    insights: string[]

quality_metrics:
  saturation: number      # 0-100, information completeness
  diversity: number       # 0-1, source variety
  tier_quality: number   # Weighted avg of source tiers
  evidence_depth: number # Avg findings per insight
```

**Next:** Phase 4

***

## Phase 4: Quality Gate

**Gate:**

```yaml
type: file_exists
condition: "synthesis.yaml"
```

**Actions:**

1. Invoke quality-gate skill
2. Evaluate against thresholds
3. Route based on verdict

**Orchestration:**

```
Skill(skill: "quality-gate")

quality = Read("artifacts/{session}/quality.yaml")

# Route based on verdict
```

**Output:** `artifacts/{session}/quality.yaml`

```yaml
# quality.yaml schema
verdict: PASS|WARN|FAIL
scores:
  saturation: number
  diversity: number
  tier_quality: number
  evidence_depth: number
thresholds:
  saturation: 50
  diversity: 0.5
  tier_quality: 0.6
issues: string[]
recommendations: string[]
```

**Routing:**

| Verdict | Action                             |
| ------- | ---------------------------------- |
| PASS    | → Phase 5                          |
| WARN    | → Phase 5 (with caveats noted)     |
| FAIL    | → Report gaps, suggest re-research |

**Next:** Phase 5 or halt

***

## Phase 5: Report Generation (ENHANCED)

**Gate:**

```yaml
type: quality_verdict
condition: "verdict in [PASS, WARN]"
```

**Execution model: foreground only**

Both report tasks run foreground — they use `Read` and `Write` tool calls to load synthesis data and write output files.

**Actions:**

1. Invoke MD report generator — wait for completion
2. Invoke HTML report generator — wait for completion
3. Update state to completed

**Orchestration:**

```
# 1. Generate Markdown Report
# run_in_background: false — needs Read/Write tool calls
Task(
  subagent_type: "report-generator",
  run_in_background: false,
  description: "Generate MD report",
  prompt: |
    Generate research report in Markdown format:
    - synthesis_path: artifacts/{session}/synthesis.yaml
    - plan_path: artifacts/{session}/plan.yaml
    - quality_path: artifacts/{session}/quality.yaml
    - session_id: {session}
    - output_path: artifacts/{session}/{topic_slug}_REPORT.md

    Create comprehensive report with:
    - Executive Summary
    - Market Context
    - Key sections based on themes from synthesis
    - Recommendations
    - Sources with tier classifications
    - Research methodology notes
)

# 2. Generate HTML Report (after MD completes — reads the MD file)
# run_in_background: false — needs Read/Write tool calls
Task(
  subagent_type: "report-generator",
  run_in_background: false,
  description: "Generate HTML report",
  prompt: |
    Generate a VISUAL HTML report from the research data.

    **IMPORTANT:** This is the Phase 5 report generator. Follow the create-document design standards below.

    Read source files:
    - artifacts/{session}/synthesis.yaml
    - artifacts/{session}/plan.yaml
    - artifacts/{session}/quality.yaml
    - artifacts/{session}/{topic_slug}_REPORT.md

    Output to: artifacts/{session}/{topic_slug}_REPORT.html

    ## Design System (AI Sreda Default — No Exceptions)

    Use these tokens. Do NOT use purple gradients, glassmorphism, emoji decoration, decorative icons, fake KPI cards, or generic AI templates.

    ```
    --bg: #fafaf8;            /* warm off-white page background */
    --surface: #ffffff;       /* white card surface */
    --warm: #f5f3ef;          /* warm tint for diagram zones */
    --text: #1a1a1a;          /* graphite — near-black body */
    --text-sub: #5c5c5c;      /* secondary text */
    --text-soft: #8a8a8a;     /* tertiary/metadata text */
    --border: #e2e0dc;        /* section borders */
    --border-subtle: #eeede9; /* card borders */
    --teal: #0d9488;          /* primary accent */
    --teal-bg: #e8f7f4;      /* teal callout background */
    --teal-dark: #0b7a6f;    /* teal hover/stat text */
    --amber: #b45309;         /* warning accent */
    --amber-bg: #fef7ed;     /* warning callout background */
    --green: #15803d;         /* success/PASS */
    --green-bg: #f0faf2;     /* success callout background */
    --slate: #475569;         /* info accent */
    --slate-bg: #f1f5f9;     /* info callout background */
    --shadow-card: 0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.03);
    --shadow-raised: 0 2px 4px rgba(0,0,0,0.04), 0 6px 16px rgba(0,0,0,0.05);
    --radius: 8px;
    --radius-lg: 12px;
    --font-sans: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
    --font-serif: "Newsreader", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    ```

    **Font rules:** Reference DM Sans and Newsreader in font-family stacks with system fallbacks (do NOT load Google Fonts CDN). The fonts render as system-ui/Georgia on machines without them. Add `-webkit-font-smoothing: antialiased`.

    **No external dependencies:** Single self-contained .html file. No CDN links. No external JS. No external CSS.

    ## Document Structure

    The report is a single-column, max-width ~920px, centered layout. No sidebars. No sticky headers.

    ### 1. Header
    - Eyebrow: "Research Report · [Month Year]"
    - H1 title
    - Subtitle paragraph (thesis statement, max 2-3 sentences)
    - Stats row: grid of 5 stat cards (findings, sources, insights, aspects, quality verdict)
    - Wide border-bottom separator

    ### 2. Paradigm Diagram (inline SVG)
    Draw an 800×280 SVG showing the core thesis:
    - **Left panel** ("PRE-BUILT SCREENS"): warm background rectangle containing smaller rects for "Dashboard with nav paths", "Form pages & workflows", and "Human navigates function calls via menus & clicks"
    - **Arrow** between panels
    - **Right panel** ("TOOL SURFACES"): teal-tinted background with small rects for "Tool Schema (typed action)" (2×), a larger "Tool Registry" rect (versioned schemas, per-tenant, deprecation), "Agent harness composes tools from intent" bar, and a dashed-border note "Visual artifacts rendered on-demand"
    - Caption below: "The paradigm shift: from pre-built navigation paths to agent-composed tool surfaces..."

    ### 3. Executive Summary
    3-4 paragraphs in the body font. First paragraph opens with the strongest claim. Include key stats inline.

    ### 4. Research Sections (5 numbered sections)
    Each section starts with `<h2><span class="num">N</span>Title</h2>`.

    Use **three callout box types** interspersed:
    - `.callout.evidence` — teal background, left border: key evidence, protocol specs, data points
    - `.callout.data` — slate background, left border: comparisons, frameworks, structured info
    - `.callout.warning` — amber background, left border: risks, Jevons paradox, security gaps

    For analyst timelines (e.g. 2026→2030 projections), use the **timeline pattern**: alternating rows with year label on the left and prediction text on the right. Each row has a source citation below the text.

    ### 5. Key Insights Grid (3-column grid at desktop, 1-column on mobile)
    Each card contains:
    - Confidence badge (`.conf-badge .conf-high` = green, `.conf-medium` = amber)
    - h4 title
    - Short description (2-3 sentences max)
    - Sources note: "N sources · [tier] tier"

    ### 6. Recommendations (2×2 grid at desktop, 1-column on mobile)
    Four cards: "For SaaS Companies", "For Enterprise Software Buyers", "For Designers & Product Builders", "For Investors"
    Each card has an h4 title and a `<ul>` with 5 action items.

    ### 7. Quality & Methodology
    Two tables:
    1. Metric | Value | Threshold | Result (PASS in green)
    2. Tier | Count | Description (S:12, A:45, B:15, C:4 tiers with pill badges)
    Followed by a methodology paragraph in sans-serif smaller text.

    ### 8. Footer
    Three lines: research date, stat summary, quality summary. Centered. Light text color.

    ## Interaction & Motion
    - Only motion: view-driven fade-in on sections (`@media prefers-reduced-motion: no-preference`)
    - No hover effects beyond row highlight
    - No click handlers, no JS dependencies

    ## Responsive
    - 768px breakpoint: stats → 3-col, insight/rec grids → 1-col, h1 smaller
    - 480px breakpoint: stats → 2-col, smaller padding

    ## Quality Gate (check before output)
    - [ ] First viewport communicates thesis + research scope immediately
    - [ ] No purple/blue gradients, no glassmorphism, no emoji
    - [ ] No external CDN dependencies
    - [ ] System font stack with fallbacks (not loaded from external sources)
    - [ ] SVG diagram renders the shift visually
    - [ ] prefers-reduced-motion respected
    - [ ] Responsive at 768px and 480px
    - [ ] Every insight is traceable to synthesis data
    - [ ] All claims grounded in source citations
    - [ ] Page renders non-blank when opened in a browser
)
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

## Key Changes from v1.0

| Feature           | v1.0          | v2.0                         |
| ----------------- | ------------- | ---------------------------- |
| User confirmation | None          | **MANDATORY after planning** |
| Search delays     | Random jitter | **Predictable 600ms**        |
| Report output     | MD only       | **MD + HTML**                |
| HTML design       | N/A           | **Light theme, teal accent** |

## Key Changes from v2.0

| Feature          | v2.0                | v3.0                          |
| ---------------- | ------------------- | ----------------------------- |
| Sources          | exa web search only | **exa + Twitter/X (getxapi)** |
| Source selection | N/A                 | **source\_type per aspect**   |
| Twitter queries  | N/A                 | **twitter-research skill**    |
| Findings         | web only            | **web + tweets merged**       |

## Key Changes from v3.0

| Feature          | v3.0                     | v4.0                                         |
| ---------------- | ------------------------ | -------------------------------------------- |
| Locale detection | None                     | **Auto-detect russian vs global in planner** |
| Russian topics   | exa only (no RU sources) | **exa + Yandex generative-answer**           |
| Global topics    | exa + Twitter            | **exa + Twitter (unchanged)**                |
| Source types     | web / twitter / both     | **+ yandex (exa + Yandex generative)**       |
| Yandex queries   | N/A                      | **Natural-language RU questions preferred**  |
| Generative mode  | N/A                      | **Yandex generative-answer as primary call** |

## Key Changes from v4.0

| Feature         | v4.0                             | v4.1                                        |
| --------------- | -------------------------------- | ------------------------------------------- |
| Phase 2 workers | `subagent_type: general-purpose` | **`subagent_type: aspect-researcher`**      |
| Phase 5 workers | `subagent_type: general-purpose` | **`subagent_type: report-generator`**       |
| Agent context   | Anonymous agent, no tool spec    | **Named agent with defined tools + skills** |

## Key Changes from v4.1

| Feature                    | v4.1                                  | v4.2                                                    |
| -------------------------- | ------------------------------------- | ------------------------------------------------------- |
| HTML report design         | Generic prompt, frontend-design skill | **create-document standards embedded in skill**         |
| Design system              | Referenced externally                 | **Inline CSS tokens, font stacks, color palette**       |
| SVG paradigm diagram       | None                                  | **800×280 inline SVG: PRE-BUILT SCREENS → TOOL SURFACES** |
| Callout boxes              | None                                  | **evidence / data / warning callout types**             |
| Timeline pattern           | None                                  | **Year + prediction rows for analyst data**             |
| Quality gate for HTML      | None                                  | **10-item checklist before output**                     |
| External dependencies      | Google Fonts CDN                      | **Zero external deps — system font stacks**             |
| Generic AI aesthetics      | Allowed                               | **Explicitly banned (no purple gradients, glassmorphism, emoji)** |

## Key Changes from v4.2

| Feature                    | v4.2                     | v4.3                                                    |
| -------------------------- | ------------------------ | ------------------------------------------------------- |
| Counter-thesis             | None                     | **Optional 2-3 counter-aspects for dialectical synthesis** |
| Planner invocation         | Topic only               | **Passes counter_thesis flag to research-planner**      |
| Phase 1.5 presentation     | Flat aspect list         | **Thesis/counter-thesis grouped separately**            |
| Synthesis                  | Aggregate findings only  | **Detects counter-thesis aspects, convergence analysis** |

## Key Changes from v4.3

| Feature                    | v4.3                             | v4.4                                                       |
| -------------------------- | -------------------------------- | ---------------------------------------------------------- |
| Post-research gate         | None — synthesis started immediately | **Phase 2.5: summary table + user checkpoint**         |
| Research visibility        | Silent until synthesis           | **Aspect-by-aspect summary with findings count + key source** |
| User control               | No mid-pipeline control          | **Can re-run individual aspects before synthesis starts**  |