---
name: setup
type: meta
version: v1.0
description: "Pipeline overview, skill/agent inventory, and entry point for upgrading the research pipeline. Load this skill first when modifying the pipeline architecture, adding new sources, creating skills, or changing phases."
---

# Research Pipeline — /setup

## Purpose

This is the **meta-skill** for the research workspace. It provides:

- **Complete inventory** of all skills, agents, and pipeline phases
- **Architecture overview** showing how components relate
- **Upgrade entry points** — specific guides for common modifications

Load this skill whenever you need to modify the pipeline, add a new capability, or understand how the full system fits together.

---

## Pipeline Architecture

### Request Routing (CLAUDE.md)

```
User Request
     │
     ├─ Adhoc research (specific facts)    ──▶ skill: adhoc
     │
     ├─ Open-ended exploration             ──▶ skill: manager-research
     │
     └─ File/Edit operations               ──▶ Read/Write/Edit tools directly
```

### Full Pipeline Flow (manager-research)

```
Phase 1        Phase 1.5        Phase 2              Phase 2.5         Phase 3        Phase 4       Phase 5
Planning  ──▶  Confirm  ───▶   Research ×N  ───▶    Summary +    ──▶ Synthesis ──▶ Quality  ──▶ Report (MD + HTML)
   │                │               │               Confirm           │             │            │
   ▼                ▼               ▼                   │              ▼             ▼            ▼
plan.yaml     user confirms   aspects/*.yaml      user confirms   synthesis.yaml   quality.yaml  *_REPORT.md + *.html
```

### Source Routing (per aspect)

| source_type | Search Stack                                           | Use When                              |
| ----------- | ------------------------------------------------------ | ------------------------------------- |
| `web`       | exa only                                               | Global factual topics                 |
| `twitter`   | getxapi only                                           | Global social/opinion                 |
| `both`      | exa + getxapi (Twitter)                                | Global mixed (reviews, comparisons)   |
| `yandex`    | exa + Yandex web + Yandex gen + Telegram + getxapi     | Russian/CIS topics (all-in-one stack) |

---

## Skill Inventory

### Orchestration Skills

| Skill | Type | Version | Description | File |
|-------|------|---------|-------------|------|
| `setup` | meta | v1.0 | Pipeline overview and upgrade entry point | `.claude/skills/setup/SKILL.md` |
| `manager-research` | manager | v4.4 | Full research pipeline (phases 1-5) with user confirmation | `.claude/skills/manager-research/SKILL.md` |
| `adhoc` | orchestration | v1.0 | Lightweight targeted research — no pipeline | `.claude/skills/adhoc/SKILL.md` |

### Atomic Skills (called by orchestrators)

| Skill | Type | Version | Description | File |
|-------|------|---------|-------------|------|
| `research-planner` | atomic | v1.1 | Decompose topic into aspects with queries; locale detection | `.claude/skills/research-planner/SKILL.md` |
| `synthesis` | composite | v1.1 | Aggregate findings across aspects; dialectical convergence | `.claude/skills/synthesis/SKILL.md` |
| `quality-gate` | atomic | v1.0 | Evaluate synthesis quality (PASS/WARN/FAIL) | `.claude/skills/quality-gate/SKILL.md` |
| `phase-checkpoint` | atomic | v1.1 | Record phase completion in state.yaml | `.claude/skills/phase-checkpoint/SKILL.md` |
| `resume-checkpoint` | atomic | v1.1 | Restore pipeline state from checkpoint | `.claude/skills/resume-checkpoint/SKILL.md` |

### Infrastructure Skills (called by researchers and generators)

| Skill | Type | Version | Description | File |
|-------|------|---------|-------------|------|
| `search-safeguard` | atomic | v2.0 | Exa API wrapper: 600ms delays, retry, error handling | `.claude/skills/search-safeguard/SKILL.md` |
| `grounding-protocol` | domain | v1.0 | No-hallucination rules for source traceability | `.claude/skills/grounding-protocol/SKILL.md` |
| `anti-cringe` | domain | v1.0 | Suppress AI-typical phrases and hedging | `.claude/skills/anti-cringe/SKILL.md` |
| `io-yaml-safe` | atomic | v1.0 | Safe YAML writing with validation and repair loop | `.claude/skills/io-yaml-safe/SKILL.md` |
| `silence-protocol` | atomic | v1.0 | Suppress chat output — agents write files only | `.claude/skills/silence-protocol/SKILL.md` |
| `yaml-repair` | atomic | — | Self-correction loop for invalid YAML | `.claude/skills/yaml-repair/SKILL.md` |

### Source Integration Skills (scripts + instructions for external APIs)

| Skill | Type | Version | Description | Files |
|-------|------|---------|-------------|-------|
| `getxapi` | atomic | — | Twitter/X search via getxapi | `.claude/skills/getxapi/SKILL.md`, `scripts/client.ts` |
| `yandex-search` | atomic | — | Yandex web-search + generative-answer | `.claude/skills/yandex-search/SKILL.md`, `scripts/client.ts` |
| `telegram-search` | atomic | — | Telegram MTProto search (keyword + hashtag) | `.claude/skills/telegram-search/SKILL.md`, `scripts/client.ts` |
| `twitter-research` | atomic | — | Real-world experience from Twitter/X (getxapi wrapper) | `.claude/skills/twitter-research/SKILL.md` |

### Domain Skills

| Skill | Type | Version | Description | File |
|-------|------|---------|-------------|------|
| `infostyle` | domain | — | Russian text editing by infostyle (Ilyakhov) | `.claude/skills/infostyle/SKILL.md` |

---

## Agent Inventory

| Agent | Model | Tools | Skills | File |
|-------|-------|-------|--------|------|
| `aspect-researcher` | sonnet | exa, Bash, Read, Write | silence-protocol, io-yaml-safe, search-safeguard, yandex-search, telegram-search, tier-weights, recency-weights, slop-check | `.claude/agents/aspect-researcher.md` |
| `report-generator` | sonnet | Read, Write | silence-protocol, grounding-protocol, anti-cringe | `.claude/agents/report-generator.md` |

**Note:** `tier-weights`, `recency-weights`, and `slop-check` are referenced by the aspect-researcher agent definition but do not have corresponding SKILL.md files in `.claude/skills/`. These appear to be implicit/inline rules within the agent prompt.

---

## Pipeline Phases Reference

| Phase ID | Name | Entry Gate | Key Output | Duration |
|----------|------|-----------|------------|----------|
| 1 | Planning | — | `plan.yaml` | ~1 turn |
| 1.5 | User Confirmation | plan.yaml exists | user confirmation | 1 turn |
| 2 | Research (×N aspects) | user confirmed | `aspects/*.yaml` (N files) | ~3-7 turns |
| 2.5 | Research Summary | ≥min aspects done | user confirmation | 1 turn |
| 3 | Synthesis | ≥3 aspects | `synthesis.yaml` | ~1 turn |
| 4 | Quality Gate | synthesis.yaml exists | `quality.yaml` | ~1 turn |
| 5 | Report Generation | quality PASS/WARN | `*_REPORT.md` + `*_REPORT.html` | ~2 turns |

### Cost Structure (Russian locale, Yandex generative)

| Depth | Aspects | Yandex gen calls | Telegram calls | Approx Yandex cost |
|-------|---------|------------------|---------------|-------------------|
| quick | 3 | 3 | 3 (quota) | ~$0.13 |
| medium | 5 | 5 | 5 (quota) | ~$0.21 |
| deep | 7 | 7 | 7 (quota) | ~$0.29 |

### Query Prefix Reference

| Prefix | Routes to | Cost | Query Length |
|--------|-----------|------|-------------|
| *(no prefix)* | exa web search | ~$0.001 | standard |
| `twitter_query:` | getxapi Twitter search | ~$0.001 | **1-2 keywords max** |
| `yandex_query:` | Yandex web-search | ~$0.004 | standard |
| `yandex_gen_query:` | Yandex generative-answer | ~$0.042 (max 1/aspect) | standard |
| `telegram_query:` | Telegram search-query → hashtag fallback | quota-limited (1/aspect) | **1-2 keywords max** |

---

## File & Folder Convention

```
artifacts/{YYYY-MM-DD}_{topic_slug}/
├── plan.yaml              # Phase 1 output
├── aspects/               # Phase 2 output (N files)
│   ├── aspect_1.yaml
│   └── aspect_2.yaml
├── synthesis.yaml         # Phase 3 output
├── quality.yaml           # Phase 4 output
├── state.yaml             # Pipeline state (all phases)
├── {topic_slug}_REPORT.md    # Phase 5 output
└── {topic_slug}_REPORT.html  # Phase 5 output
```

---

## Upgrade Entry Points

### A. Adding a New Source Type

Adding a new search/source capability (e.g., Reddit, LinkedIn, a custom API):

1. **Create the integration skill:**
   ```
   .claude/skills/{source-name}/
   ├── SKILL.md              # Instructions for using the source
   └── scripts/              # Optional: API client scripts
   ```

2. **Update `research-planner/SKILL.md`:**
   - Add new prefix to Step 3 (Query Generation)
   - Add to source_type options in Step 2.5 if applicable
   - Add per-aspect query count to settings

3. **Update `manager-research/SKILL.md`:**
   - Add routing pattern in Phase 2 (Source Type Routing table)
   - Add search execution pattern (similar to Telegram/Yandex sections)
   - Add schedule of costs table

4. **Update `adhoc/SKILL.md`:**
   - Add source to locale stack (Russian or Global)
   - Add query construction rules

5. **Update `aspect-researcher.md` agent:**
   - Add tool access if needed (new MCP tools, Bash scripts)
   - Add query prefix routing in instructions

6. **Update this `/setup` file:**
   - Add to Source Routing table
   - Add to Query Prefix Reference
   - Add to Skill Inventory

### B. Creating a New Skill

1. Create directory: `.claude/skills/{skill-name}/`
2. Write `SKILL.md` with:
   - YAML front matter: name, type, version, description
   - `type` must be one of: `meta`, `manager`, `orchestration`, `atomic`, `composite`, `domain`
   - Clear Purpose section
   - Input/Output schema if applicable
   - Procedure or Instructions
   - Quality Criteria checklist
3. If the skill needs scripts, add `scripts/` directory
4. Update `CLAUDE.md` routing if this is a top-level callable skill
5. Update this `/setup` file with the new entry

### C. Modifying a Pipeline Phase

1. Load this skill for full context
2. Read the relevant phase section in `manager-research/SKILL.md`
3. Read dependent skills that execute that phase (e.g., Phase 3 → `synthesis/SKILL.md`)
4. Make changes in order:
   - Phase definition in `manager-research/SKILL.md`
   - Atomic skill that implements the phase
   - Agent definition if phase uses a sub-agent
   - `phase-checkpoint/SKILL.md` if phase tracking changes
   - Quality criteria in all affected files
5. Update `CLAUDE.md` if routing changes

### D. Adding a New Agent Type

1. Write agent file: `.claude/agents/{agent-name}.md`
2. Include YAML front matter: name, description, model, tools, skills
3. Define instructions (what the agent does when invoked)
4. Add quality criteria checklist
5. Reference the agent in relevant skills (e.g., `manager-research/SKILL.md` Phase 2, `subagent_type: {agent-name}`)
6. Update this `/setup` file

### E. Modifying Locale Detection

The locale detection logic lives in two places:

| File | Section |
|------|---------|
| `research-planner/SKILL.md` | Step 1.5: Locale Detection |
| `adhoc/SKILL.md` | Step 1: locale detection per question |

To add a new locale, update both files and the source_type assignment in `research-planner/SKILL.md` Step 2.5.

### F. Changing Report Design

The HTML report design system is embedded in `manager-research/SKILL.md` Phase 5:
- Design tokens (CSS variables)
- Document structure (8 sections)
- Interaction & motion rules
- Quality checklist (10 items)

To change the design, edit the Phase 5 report-generator prompt in `manager-research/SKILL.md`.

### G. Adding a New Agent to the Available Agents

The available agents are defined in the system messages of `Task()` calls. To add a new agent type:

1. Write agent definition file in `.claude/agents/`
2. The agent becomes available when the Task tool lists it via `subagent_type`
3. No registration needed beyond creating the file

---

## Dependency Graph

```
CLAUDE.md (routing)
    │
    ├── skill: adhoc
    │       ├── search-safeguard (delay/retry)
    │       ├── yandex-search (RU locale)
    │       ├── telegram-search (RU locale)
    │       └── twitter-research (global locale)
    │
    └── skill: manager-research
            ├── research-planner
            │       └── (locale detection + query generation)
            │
            ├── Phase 2: aspect-researcher agent
            │       ├── search-safeguard
            │       ├── io-yaml-safe
            │       ├── silence-protocol
            │       ├── yandex-search
            │       ├── telegram-search
            │       └── tier-weights / recency-weights / slop-check (implicit)
            │
            ├── Phase 2.5: phase-checkpoint
            │
            ├── Phase 3: synthesis
            │       ├── grounding-protocol
            │       └── anti-cringe
            │
            ├── Phase 4: quality-gate
            │
            ├── Phase 5: report-generator agent
            │       ├── silence-protocol
            │       ├── grounding-protocol
            │       └── anti-cringe
            │
            └── resume-checkpoint (recovery)
```

---

## Quality Criteria

- [ ] All skills listed in inventory have corresponding files that exist
- [ ] All agents listed have corresponding files that exist
- [ ] Version numbers in this file match the source SKILL.md files
- [ ] Upgrade guides reference correct file paths and sections
- [ ] Query prefix reference stays in sync with `research-planner/SKILL.md`
- [ ] Cost estimates stay in sync with `manager-research/SKILL.md`
- [ ] Twitter and telegram queries follow the **1-2 keywords max** rule

---

## Session State Management

File: `artifacts/{session}/state.yaml`

```yaml
session_id: "YYYY-MM-DD_topic_name"
topic: "Topic"
workflow: "manager-research"
version: "v4.4"
current_phase: "planning|confirm|research|synthesis|quality_gate|report"
phase_states:
  planning: pending|in_progress|completed|failed
  confirm: pending|in_progress|completed
  research: pending|in_progress|completed|failed
  synthesis: pending|in_progress|completed|failed
  quality_gate: pending|in_progress|completed|failed
  report: pending|in_progress|completed|failed
started_at: timestamp
last_updated: timestamp
user_confirmed: false
error: null
checkpoints:
  - phase: 1
    name: planning
    created_at: timestamp
    files_snapshot: {...}
```

---

## Quick Reference: Common Tasks

| Task | Load This First | Then Modify |
|------|----------------|-------------|
| "Add Reddit as a source" | `/setup` (section A) | `research-planner`, `manager-research`, `adhoc`, `aspect-researcher` |
| "Change how HTML reports look" | `/setup` (section F) | `manager-research` (Phase 5 prompt) |
| "Add counter-thesis toggle" | `/setup` (section C) | `manager-research`, `research-planner`, `synthesis` |
| "Add a new agent type" | `/setup` (section D) | `.claude/agents/`, then `manager-research` |
| "Change locale detection logic" | `/setup` (section E) | `research-planner`, `adhoc` |
| "Add a new pipeline phase" | `/setup` (section C) | `manager-research`, `phase-checkpoint` |
| "Create a new search skill" | `/setup` (section A → B) | `scripts/`, then integration into pipeline |
