# Research Workspace — Instructions

## Request Routing

Every request must be classified as **one of three types**. Evaluate in order — first match wins.

### 1. Adhoc Research (check first)

Route via `adhoc` skill when the request is about **specific, concrete, validation-oriented questions** where the user already knows the shape of the expected answer (a price, a policy clause, a product name, a config).

Triggers — any of:

* Keywords: `adhoc`, `/adhoc`, `quick`, `just look up`, `validate`, `check`, `find specific`
* Structure: a numbered list of specific factual questions
* Explicit scope limit: "no full pipeline", "don't need deep research", "just need the data"

```markdown
Use: `skill: adhoc`
```

### 2. Research (default for knowledge questions)

Route via `manager-research` skill when the request is about **exploration, synthesis, or broad coverage** — not a known set of specific data points.

* Topic exploration, landscape analysis, competitive research
* Synthesis across multiple sources or aspects
* "What's out there on X?" type questions
* Any open-ended external knowledge request

```markdown
Use: `skill: manager-research`
```

### 3. Setup / Pipeline Overview

Route via `setup` skill when the request is about **understanding, modifying, or upgrading the research pipeline itself**.

Triggers — any of:

* Keywords: `setup`, `/setup`, `pipeline overview`, `skill inventory`, `upgrade pipeline`
* Intent: understanding how the pipeline works, adding new sources, creating skills, changing phases
* The request is about the research infrastructure, not about doing research

```markdown
Use: `skill: setup`
```

**After any pipeline change** (skill modified, agent created/renamed, phase logic updated):

1. Bump `version` in the modified skill's frontmatter
2. Add a changelog entry to `CHANGELOG.md` at repo root under `## {skill-name}` → `### v{new-version}`
3. Update the `See CHANGELOG.md` reference in the skill file if it doesn't exist yet

### Implicit Routing

| User says...                                                       | Means...       | Action                    |
| ------------------------------------------------------------------ | -------------- | ------------------------- |
| "adhoc", "/adhoc", "quick", "validate", "check", "find specific"   | Adhoc Research | `skill: adhoc`            |
| Numbered list of specific factual questions (prices, terms, specs) | Adhoc Research | `skill: adhoc`            |
| "find", "search", "research", "look up", "compare" (open-ended)    | Research       | `skill: manager-research` |
| "how do I", "what is", "explain", "tell me about"                  | Research       | `skill: manager-research` |
| "setup", "/setup", "pipeline overview", "upgrade pipeline"         | Setup          | `skill: setup`            |
| "create", "write", "edit", "modify", "add", "remove", "fix"        | Edit           | Direct file tools         |
| Specific file path + change request                                | Edit           | Direct file tools         |

**Routing tie-breaker:** When the request is clearly a bounded set of factual lookups (even without explicit adhoc keywords), prefer `adhoc` over `manager-research`. The full pipeline is reserved for genuinely open-ended exploration.

***

## Skill Reference

* **adhoc**: `.claude/skills/adhoc`
* **manager-research**: `.claude/skills/manager-research`
* **setup**: `.claude/skills/setup`