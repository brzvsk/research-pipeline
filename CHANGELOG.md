# Research Pipeline Changelog

## manager-research

### v4.5

| Feature                   | v4.4                                         | v4.5                                                         |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| Synthesis execution       | `Skill(synthesis)` inline — bypassable       | **`Task(synthesizer)` subagent — context isolated**          |
| Quality gate execution    | `Skill(quality-gate)` inline — bypassable    | **Handled by synthesizer subagent (Phase 3+4 merged)**       |
| Report generation         | Two separate Task() calls (MD + HTML)        | **Single `Task(report-generator)` — agent owns both**        |
| Agent handoff             | Raw content passed in Task prompts           | **File paths only — agents read from disk**                  |
| state.yaml                | Defined but unused                           | **Written before and after each phase**                      |
| Post-synthesis validation | None                                         | **Schema assertions before proceeding to Phase 5**           |
| HTML report design        | Inline CSS tokens in manager-research prompt | **Delegated to `sreda-core:create-document` skill in agent** |
| Agent inventory           | `aspect-researcher`, `report-generator`      | **+ `synthesizer` agent (Phases 3+4)**                       |

### v4.4

| Feature             | v4.3                                 | v4.4                                                          |
| ------------------- | ------------------------------------ | ------------------------------------------------------------- |
| Post-research gate  | None — synthesis started immediately | **Phase 2.5: summary table + user checkpoint**                |
| Research visibility | Silent until synthesis               | **Aspect-by-aspect summary with findings count + key source** |
| User control        | No mid-pipeline control              | **Can re-run individual aspects before synthesis starts**     |

### v4.3

| Feature                | v4.2                    | v4.3                                                       |
| ---------------------- | ----------------------- | ---------------------------------------------------------- |
| Counter-thesis         | None                    | **Optional 2-3 counter-aspects for dialectical synthesis** |
| Planner invocation     | Topic only              | **Passes counter\_thesis flag to research-planner**        |
| Phase 1.5 presentation | Flat aspect list        | **Thesis/counter-thesis grouped separately**               |
| Synthesis              | Aggregate findings only | **Detects counter-thesis aspects, convergence analysis**   |

### v4.2

| Feature               | v4.1                                  | v4.2                                                              |
| --------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| HTML report design    | Generic prompt, frontend-design skill | **create-document standards embedded in skill**                   |
| Design system         | Referenced externally                 | **Inline CSS tokens, font stacks, color palette**                 |
| SVG paradigm diagram  | None                                  | **800×280 inline SVG: PRE-BUILT SCREENS → TOOL SURFACES**         |
| Callout boxes         | None                                  | **evidence / data / warning callout types**                       |
| Timeline pattern      | None                                  | **Year + prediction rows for analyst data**                       |
| Quality gate for HTML | None                                  | **10-item checklist before output**                               |
| External dependencies | Google Fonts CDN                      | **Zero external deps — system font stacks**                       |
| Generic AI aesthetics | Allowed                               | **Explicitly banned (no purple gradients, glassmorphism, emoji)** |

### v4.1

| Feature         | v4.0                             | v4.1                                        |
| --------------- | -------------------------------- | ------------------------------------------- |
| Phase 2 workers | `subagent_type: general-purpose` | **`subagent_type: aspect-researcher`**      |
| Phase 5 workers | `subagent_type: general-purpose` | **`subagent_type: report-generator`**       |
| Agent context   | Anonymous agent, no tool spec    | **Named agent with defined tools + skills** |

### v4.0

| Feature          | v3.0                     | v4.0                                         |
| ---------------- | ------------------------ | -------------------------------------------- |
| Locale detection | None                     | **Auto-detect russian vs global in planner** |
| Russian topics   | exa only (no RU sources) | **exa + Yandex generative-answer**           |
| Global topics    | exa + Twitter            | **exa + Twitter (unchanged)**                |
| Source types     | web / twitter / both     | **+ yandex (exa + Yandex generative)**       |
| Yandex queries   | N/A                      | **Natural-language RU questions preferred**  |
| Generative mode  | N/A                      | **Yandex generative-answer as primary call** |

### v3.0

| Feature          | v2.0                | v3.0                          |
| ---------------- | ------------------- | ----------------------------- |
| Sources          | exa web search only | **exa + Twitter/X (getxapi)** |
| Source selection | N/A                 | **source\_type per aspect**   |
| Twitter queries  | N/A                 | **twitter-research skill**    |
| Findings         | web only            | **web + tweets merged**       |

### v2.0

| Feature           | v1.0          | v2.0                         |
| ----------------- | ------------- | ---------------------------- |
| User confirmation | None          | **MANDATORY after planning** |
| Search delays     | Random jitter | **Predictable 600ms**        |
| Report output     | MD only       | **MD + HTML**                |
| HTML design       | N/A           | **Light theme, teal accent** |