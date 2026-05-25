---
name: research-planner
type: atomic
version: v1.1
description: "Decompose topic into researchable aspects with queries. Detects locale (russian/global) and assigns source types accordingly: russian → exa + yandex generative; global → exa + twitter."
input:
  required:
    - topic
  optional:
    - depth
    - focus_areas
    - locale  # Override auto-detection: "russian" | "global"
    - counter_thesis  # boolean, default false: generate 2-3 counter-aspects
output:
  type: data
  schema: plan.yaml
---

# Research Planner

## Purpose

Decompose a research topic into distinct aspects, each with targeted search queries. Produces a structured plan for parallel research.

## Input

| Parameter     | Type      | Required | Description                                      |
| ------------- | --------- | -------- | ------------------------------------------------ |
| `topic`       | string    | Yes      | Research topic                                   |
| `depth`       | enum      | No       | quick (3 aspects), medium (5), deep (7)          |
| `focus_areas` | string\[] | No       | Areas to prioritize                              |
| `locale`          | enum      | No       | Override locale detection: `russian` or `global`    |
| `counter_thesis`  | boolean   | No       | Generate 2-3 counter-thesis aspects (default: false) |

## Procedure

### Step 1: Topic Analysis

Analyze the topic to identify:

* Core concept
* Key dimensions (technical, market, social, etc.)
* Temporal aspects (current state, trends, future)
* Stakeholder perspectives

### Step 1.5: Locale Detection

Determine whether the topic is **Russian/CIS-oriented** or **global**. This drives source type assignment in Step 2.5.

**Auto-detection signals (any one is sufficient):**

| Signal                                   | Examples                                                         |
| ---------------------------------------- | ---------------------------------------------------------------- |
| Cyrillic characters in topic             | "рынок", "цены", "обзор"                                         |
| Russian platforms or brands              | Wildberries, Ozon, Яндекс, ВКонтакте, Авито, Сбер, МТС, Тинькофф |
| Russian geo/market references            | "российский рынок", "рунет", "СНГ", "РФ", "ЦФА"                  |
| Topic explicitly about Russia/CIS        | "Russia e-commerce", "CIS startup ecosystem"                     |
| User provides `locale: russian` override | —                                                                |

**Decision:**

```
if locale override provided:
  use override value
elif any auto-detection signal matches:
  locale = "russian"
else:
  locale = "global"
```

Store `locale` in plan.yaml settings (see Output Schema).

### Step 2: Aspect Generation

Generate aspects based on depth:

| Depth  | Aspects | Focus                  |
| ------ | ------- | ---------------------- |
| quick  | 3       | Core dimensions only   |
| medium | 5       | Core + context         |
| deep   | 7       | Comprehensive coverage |

Each aspect must be:

* **Distinct:** No significant overlap with others
* **Researchable:** Can find sources via web search or Twitter
* **Bounded:** Clear scope

### Step 2.3: Counter-Thesis Generation (Optional)

When `counter_thesis: true`, generate 2-3 additional counter-thesis aspects that explicitly explore opposing positions, limitations, and critical perspectives on the topic. These are researched alongside thesis aspects and feed into synthesis as the antithesis half of the dialectic.

**Counter-aspect generation rules:**

- Each counter-aspect takes a skeptical lens on the topic — identify where the dominant narrative might be wrong, overstated, or incomplete
- Counter-aspects should challenge different dimensions of the topic — do not make 3 aspects that all attack the same claim
- Frame queries to find critical evidence: "limitations of", "why X fails", "criticisms of", "counter-arguments to", "problems with", "gap between X and reality", "evidence against"
- Counter-aspects get `aspect_type: counter_thesis` in plan.yaml

**Counter-aspect framing patterns:**

| Thesis Dimension              | Counter-Aspect Framing                                           |
| ----------------------------- | ---------------------------------------------------------------- |
| Technology/architecture       | "What are the binding architectural limitations or unsolved problems?" |
| Market/ecosystem              | "What data contradicts the growth or adoption narrative?"        |
| Adoption/signals              | "What is the gap between announcements/claims and operational reality?" |
| Economic/business model       | "What structural barriers prevent the predicted economic transition?" |
| Human/social impact           | "What independent evidence challenges the transformation claim?" |

**Per counter-aspect:**
- Identify which thesis aspects it challenges (reference by aspect id)
- 3-4 queries framed to find contradictory or limiting evidence
- Same source_type logic as thesis aspects (Step 2.5 applies to all aspects)

**Depth scaling for counter-thesis:**

| Depth  | Base aspects | Counter aspects | Total |
| ------ | ------------ | --------------- | ----- |
| quick  | 3            | 2               | 5     |
| medium | 5            | 2               | 7     |
| deep   | 7            | 3               | 10    |

### Step 2.5: Source Type Selection

For each aspect (both thesis and counter-thesis), determine `source_type` based on **locale** (from Step 1.5) and aspect content:

| source\_type | Search Stack                           | Use When                                           |
| ------------ | -------------------------------------- | -------------------------------------------------- |
| `web`        | exa only                               | Global factual: docs, specs, architecture, pricing |
| `twitter`    | getxapi only                           | Global social: sentiment, opinions, user reactions |
| `both`       | exa + getxapi (Twitter)                | Global mixed: product reviews, tool comparisons    |
| `yandex`     | exa + Yandex web/generative + Telegram | Russian/CIS topics (factual OR social)             |

**Locale-aware decision guide:**

```
if locale == "russian":
  ALL aspects → source_type = "yandex"
  # Russian stack: exa (English context) + Yandex web/generative (RU web) + Telegram (RU community signal)

elif locale == "global":
  Ask: "Does this aspect need real human opinions/experiences?"
    YES → "both"   (exa + Twitter)
    NO  → "web"    (exa only)
  # Use "twitter" only when web content is NOT needed at all
```

### Step 3: Query Generation

For each aspect, generate 3-5 search queries based on `source_type`:

**For `web` source\_type:**

| Query Type   | Example                      |
| ------------ | ---------------------------- |
| Definitional | "What is {concept}"          |
| Comparative  | "{concept} vs {alternative}" |
| Practical    | "{concept} implementation"   |
| Expert       | "{concept} best practices"   |
| Recent       | "{concept} 2025 2026"        |

**For `twitter` source\_type:**

Generate **1-2 keyword queries only**. Twitter/X search is highly restrictive — queries with boolean operators (`OR`, `AND`), `min_faves:`, `since:`, or long phrases return very few or zero results. Short, focused keywords work best.

| Query Type | Example                          |
| ---------- | -------------------------------- |
| Direct     | `{concept} review`               |
| Direct     | `{concept} feedback`             |
| Direct     | `{concept}` (single word)        |

**For `yandex` source\_type:**

Two Yandex operations are available with very different costs. Use the correct prefix:

| Prefix              | Operation                                                   | Cost         | Limit                |
| ------------------- | ----------------------------------------------------------- | ------------ | -------------------- |
| `yandex_query:`     | Yandex `web-search` (list of results, crawlable)            | \~$0.004/req | generous             |
| `yandex_gen_query:` | Yandex `generative-answer` (synthesized answer + citations) | \~$0.042/req | **max 1 per aspect** |

Generate per aspect: **2-3 `yandex_query:`** + **1 `yandex_gen_query:`** + **1 `telegram_query:`** + **1-2 exa** (unprefixed, English):

| Query Type         | Prefix              | Cost       | Example                                                                                       |
| ------------------ | ------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| Web search (RU)    | `yandex_query:`     | \~$0.004   | "репрайсер Wildberries как работает"                                                          |
| Web search (RU)    | `yandex_query:`     | \~$0.004   | "автоматическое ценообразование маркетплейс"                                                  |
| **Core synthesis** | `yandex_gen_query:` | \~$0.042   | **"Как работает репрайсер на Wildberries?"** — the single most valuable synthesis question    |
| **Telegram**       | `telegram_query:`   | free/quota | **"wildberries"** or **"репрайсер wb"** — 1-2 keywords max. Short queries return more results. Researcher handles quota/#hashtag fallback automatically |
| Exa fallback       | *(no prefix)*       | \~$0.001   | "Wildberries repricer tool how it works"                                                      |

**Rules:**

* `yandex_gen_query:` — the most important synthesis question for this aspect. One per aspect, no exceptions.
* `telegram_query:` — **1-2 keywords max** for the aspect topic. One per aspect. Shorter queries return more results on Telegram. The researcher will run `search-query` first (quota-checked); if quota is exhausted it derives a `#hashtag` fallback automatically — the planner does not need to provide a hashtag.
* Do NOT generate `#hashtag` values for `telegram_query:`. Write 1-2 plain keywords (e.g., `"wildberries"`, `"репрайсер wb"`).

**For `both` source\_type:**
Generate 2-3 queries for EACH source (web + twitter).

**Query Quality:**

* Specific enough to get relevant results
* Not so narrow that results are sparse
* Include temporal markers for freshness (web queries only)
* Twitter and Telegram: **1-2 keywords max** — short queries return more results

### Step 4: Output

Generate plan.yaml with session metadata.

## Output Schema

```yaml
topic: "Original topic"
depth: quick|medium|deep
locale: russian|global          # Detected or overridden in Step 1.5
created_at: "timestamp"
session_id: "YYYY-MM-DD_topic_name"

aspects:
  - id: "aspect_1"
    name: "Aspect Name"
    description: "What this aspect covers"
    priority: 1  # 1 = highest
    aspect_type: thesis|counter_thesis  # Defaults to "thesis" if not set
    source_type: web|twitter|both|yandex  # Assigned in Step 2.5
    challenges: "string|null"  # Only for counter_thesis: which thesis claim this challenges (reference thesis aspect id)
    queries:
      # For web/both/yandex(exa part):
      - "web query 1"
      - "web query 2"
      # For twitter or both (prefix with twitter_query:):
      - "twitter_query: tool comparison"
      - "twitter_query: user experience"
      # For yandex: web-search queries (cheap, crawlable):
      - "yandex_query: репрайсер X как работает"
      - "yandex_query: сравнение X и Y 2026"
      # For yandex: 1 generative query per aspect (expensive, synthesized):
      - "yandex_gen_query: Как работает X и чем отличается от Y?"
      # For yandex: 1 telegram search per aspect (1-2 keywords max; researcher handles quota/hashtag fallback):
      - "telegram_query: X репрайсер"

  - id: "counter_1"
    name: "Counter: [dimension challenged]"
    description: "Critical examination of [specific claim or tendency]"
    priority: 2
    aspect_type: counter_thesis
    source_type: web  # or yandex/both per locale
    challenges: "The claim from [thesis aspect id] that [specific thesis claim being challenged]"
    queries:
      - "limitations of [topic claim]"
      - "why [topic claim] fails in practice"
      - "evidence against [topic claim]"
      - "gap between [topic claim] and operational reality"

  - id: "aspect_2"
    name: "Another Aspect"
    description: "Coverage description"
    priority: 2
    source_type: both
    queries:
      - "technical deep-dive query"
      - "twitter_query: developer experience"

settings:
  max_sources_per_aspect: 15
  min_findings_per_aspect: 5
  min_aspects_for_synthesis: 3
  twitter_queries_per_aspect: 3      # Target twitter queries (global only)
  yandex_queries_per_aspect: 2       # Target yandex web-search queries per aspect (russian only)
  yandex_gen_queries_per_aspect: 1   # Yandex generative queries per aspect — max 1, costs 10× more
  telegram_queries_per_aspect: 1     # Telegram search queries per aspect — always 1, keyword query (hashtag fallback on quota exhaust)
  locale: russian|global             # Mirror of top-level locale for worker access
```

## Examples

### Example 1: Medium Depth

**Input:**

```
topic: "AI agents orchestration patterns"
depth: medium
```

**Output:**

```yaml
topic: "AI agents orchestration patterns"
depth: medium
created_at: "2026-01-30T10:00:00Z"
session_id: "2026-01-30_ai_agents_orchestration_patterns"

aspects:
  - id: "architecture"
    name: "Architecture Patterns"
    description: "Structural patterns for multi-agent systems: hierarchical, mesh, swarm"
    priority: 1
    queries:
      - "multi-agent system architecture patterns"
      - "hierarchical vs mesh agent orchestration"
      - "agent swarm coordination patterns"

  - id: "communication"
    name: "Inter-Agent Communication"
    description: "How agents communicate: message passing, shared state, events"
    priority: 2
    queries:
      - "agent to agent communication protocols"
      - "multi-agent message passing patterns"
      - "shared state vs message passing agents"

  - id: "tools"
    name: "Orchestration Frameworks"
    description: "Frameworks and tools: LangGraph, AutoGen, CrewAI, Claude Code"
    priority: 2
    queries:
      - "LangGraph vs AutoGen vs CrewAI comparison 2026"
      - "multi-agent orchestration frameworks"
      - "AI agent framework comparison"

  - id: "challenges"
    name: "Challenges & Limitations"
    description: "Common problems: coordination, state management, debugging"
    priority: 3
    queries:
      - "multi-agent system challenges"
      - "AI agent debugging and observability"
      - "agent coordination problems"

  - id: "implementation"
    name: "Implementation Patterns"
    description: "Tool use, prompt chaining, memory, file-based state"
    priority: 3
    queries:
      - "AI agent tool use patterns production"
      - "agent memory architecture implementation"
      - "file-based state management agents"

settings:
  max_sources_per_aspect: 15
  min_findings_per_aspect: 5
  min_aspects_for_synthesis: 3
```

### Example 2: Quick Depth

**Input:**

```
topic: "Effective prompt engineering for code generation"
depth: quick
```

**Output:**

```yaml
topic: "Effective prompt engineering for code generation"
depth: quick
created_at: "2026-02-10T14:00:00Z"
session_id: "2026-02-10_effective_prompt_engineering_for_code_generation"

aspects:
  - id: "techniques"
    name: "Structural Techniques"
    description: "Chain-of-thought, few-shot examples, system prompts, structured output"
    priority: 1
    queries:
      - "chain of thought prompting code generation"
      - "few-shot examples programming LLM best practices"

  - id: "error-reduction"
    name: "Error Reduction"
    description: "Grounding, validation loops, self-correction, hallucination prevention"
    priority: 1
    queries:
      - "reducing hallucination code generation LLM"
      - "LLM self-correction patterns code output"

  - id: "evaluation"
    name: "Evaluation Methods"
    description: "Benchmarks, pass@k, human eval, automated quality metrics"
    priority: 2
    queries:
      - "code generation evaluation benchmarks 2026"
      - "pass@k metric LLM coding assessment"

settings:
  max_sources_per_aspect: 15
  min_findings_per_aspect: 5
  min_aspects_for_synthesis: 3
```

### Example 3: Deep Depth

**Input:**

```
topic: "PostgreSQL performance tuning for analytics workloads"
depth: deep
```

**Output:**

```yaml
topic: "PostgreSQL performance tuning for analytics workloads"
depth: deep
created_at: "2026-02-12T09:00:00Z"
session_id: "2026-02-12_postgresql_performance_tuning_for_analytics_workloads"

aspects:
  - id: "query-optimization"
    name: "Query Planning & Optimization"
    description: "EXPLAIN ANALYZE, planner hints, CTE strategies, join optimization"
    priority: 1
    queries:
      - "PostgreSQL query planner optimization analytics"
      - "CTE vs subquery performance PostgreSQL"
      - "PostgreSQL join strategies large tables"
      - "EXPLAIN ANALYZE interpreting slow queries"

  - id: "indexing"
    name: "Indexing Strategies"
    description: "B-tree, GIN, BRIN, partial indexes for analytical queries"
    priority: 1
    queries:
      - "PostgreSQL BRIN index analytics workload"
      - "partial index strategies Postgres large tables"
      - "GIN index JSONB performance PostgreSQL"
      - "covering indexes PostgreSQL optimization"

  - id: "partitioning"
    name: "Table Partitioning"
    description: "Range, list, hash partitioning; partition pruning trade-offs"
    priority: 2
    queries:
      - "PostgreSQL table partitioning analytics 2026"
      - "partition pruning performance PostgreSQL"
      - "declarative partitioning best practices"

  - id: "configuration"
    name: "Configuration Tuning"
    description: "shared_buffers, work_mem, parallel workers, JIT compilation"
    priority: 2
    queries:
      - "PostgreSQL configuration analytics workload"
      - "parallel query tuning PostgreSQL"
      - "JIT compilation PostgreSQL when to enable"
      - "work_mem tuning complex queries"

  - id: "data-modeling"
    name: "Data Modeling"
    description: "Columnar storage, materialized views, denormalization strategies"
    priority: 2
    queries:
      - "columnar extension PostgreSQL analytics"
      - "materialized view refresh strategies production"
      - "star schema vs flat tables PostgreSQL"

  - id: "monitoring"
    name: "Monitoring & Profiling"
    description: "pg_stat_statements, auto_explain, wait events, query fingerprinting"
    priority: 3
    queries:
      - "PostgreSQL performance monitoring production"
      - "pg_stat_statements analysis slow queries"
      - "auto_explain configuration PostgreSQL"

  - id: "infrastructure"
    name: "Hardware & Architecture"
    description: "Storage selection, read replicas, connection pooling, caching layers"
    priority: 3
    queries:
      - "PostgreSQL hardware sizing analytics workload"
      - "PgBouncer vs pgcat connection pooling comparison"
      - "read replica strategies PostgreSQL analytics"

settings:
  max_sources_per_aspect: 15
  min_findings_per_aspect: 5
  min_aspects_for_synthesis: 3
```

## Quality Criteria

* [ ] Locale detected and stored in plan.yaml (`russian` or `global`)
* [ ] Aspects are distinct (no major overlap)
* [ ] Each aspect has correct `source_type` matching locale and content type
* [ ] Russian topics: all aspects use `source_type: yandex`
* [ ] Global topics: factual aspects use `web`, mixed/social use `both`
* [ ] Each aspect has 2-5 queries (matching depth)
* [ ] Yandex aspects have 2-3 `yandex_query:` + 1 `yandex_gen_query:` + 1 `telegram_query:` + 1-2 exa per aspect
* [ ] `yandex_gen_query:` is the highest-value synthesis question, not a generic lookup
* [ ] `telegram_query:` is **1-2 keywords max** (no `#hashtag` — researcher handles quota check and hashtag fallback)
* [ ] Twitter queries are **1-2 keywords max** (no boolean operators, no `min_faves:`, no `since:`)
* [ ] Queries include temporal markers for freshness (web queries only)
* [ ] Priorities assigned (1 = core, 2 = context, 3 = peripheral)
* [ ] Settings included
* [ ] When `counter_thesis`: 2-3 counter aspects generated with `aspect_type: counter_thesis`
* [ ] Each counter-aspect targets a different thesis dimension (not all attacking the same claim)
* [ ] Counter-aspect queries are genuinely skeptical — not reworded thesis queries
* [ ] Counter-aspects have `challenges` field referencing a specific thesis aspect id