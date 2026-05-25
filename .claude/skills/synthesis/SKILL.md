---
name: synthesis
type: composite
version: v1.1
description: "Aggregate findings across aspects, identify patterns and insights. When counter-thesis aspects are present, performs dialectical convergence analysis — resolving thesis/antithesis into higher-level truth."
depends:
  - grounding-protocol
  - anti-cringe
input:
  required:
    - aspects_path
  optional:
    - plan_path
output:
  type: data
  schema: synthesis.yaml
---

# Synthesis

## Purpose

Aggregate findings from multiple aspect research files. Identify cross-aspect patterns, generate insights, calculate quality metrics.

## Components

| Skill              | Role                                    |
| ------------------ | --------------------------------------- |
| grounding-protocol | Ensure no hallucination in synthesis    |
| anti-cringe        | Quality filter for insight descriptions |

## Input

| Parameter      | Type   | Description                  |
| -------------- | ------ | ---------------------------- |
| `aspects_path` | string | Path to aspects/ directory   |
| `plan_path`    | string | Path to plan.yaml (optional) |

## Procedure

### Step 1: Load All Aspect Files

```
aspects = Glob("artifacts/{session}/aspects/*.yaml")
for each file:
  aspect_data = Read(file)
  collect all findings
  detect aspect_type from plan.yaml (thesis|counter_thesis)
```

**Counter-thesis detection:** Check each aspect's `aspect_type` field. If any aspect has `aspect_type: counter_thesis`, the synthesis enters dialectical mode — thesis and antithesis aspects will be resolved in Step 3.5 (Dialectical Convergence).

### Step 2: Deduplicate Findings

Across aspects, findings may overlap. Deduplicate by:

1. Exact URL match → keep higher tier version
2. Semantic similarity → merge, cite both sources

### Step 3: Identify Cross-Aspect Patterns

Look for:

* **Recurring themes:** Same concept in 2+ aspects
* **Contradictions:** Conflicting claims → note both
* **Thesis-antithesis convergence:** Thesis claims vs counter-thesis evidence — not just contradictions, but resolvable into higher-level truth (see Step 3.5)
* **Causal chains:** A (aspect 1) enables B (aspect 2)
* **Gaps:** Expected topics not covered

For each pattern:

```yaml
pattern: "Description of pattern"
type: recurring|contradiction|thesis_antithesis_convergence|causal|gap
aspects: ["aspect_1", "aspect_3"]
evidence:
  - finding_id: "f001"
    aspect: "aspect_1"
  - finding_id: "f012"
    aspect: "aspect_3"
strength: 3  # Number of supporting findings
```

### Step 3.5: Dialectical Convergence (Only When Counter-Thesis Aspects Are Present)

When the session contains counter-thesis aspects (`aspect_type: counter_thesis`), resolve each thesis/counter-thesis pair into a converged insight. This is not a pros/cons listing — it finds truth at the intersection.

**Process:**

1. For each counter-thesis aspect, identify the thesis aspect(s) it challenges (via the `challenges` field)
2. For each thesis/counter-thesis pair:
   * Extract the core claim from the thesis findings
   * Extract the falsifying or limiting evidence from the counter-thesis findings
   * Determine: is the counter-thesis evidence strong enough to reject the claim, refine it, or only qualify it?
3. Write a converged insight that resolves the tension at a higher level of abstraction

**Resolution patterns** (apply the most appropriate):

| Thesis/Counter-Thesis Relationship     | Resolution Pattern                                                                   | Converged Statement Structure                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Both partially right, different layers | **Layer separation** — thesis and antithesis operate at different levels of analysis | "Thesis is correct at \[layer A]; counter-thesis is correct at \[layer B]. Both are true simultaneously."                              |
| Different time horizons                | **Horizon separation** — thesis is true at T+N, counter-thesis at T+0                | "In the current state \[counter-evidence]. The direction of travel is \[thesis evidence]. The transition will take \[timeframe]."      |
| Thesis overstated, counter adds nuance | **Refinement** — counter-thesis doesn't reject the thesis, it qualifies it           | "The thesis holds, but with qualifications: \[counter-evidence]. A more accurate statement is \[refined claim]."                       |
| Genuine disagreement in evidence       | **Weight-of-evidence** — one side has substantially more or higher-quality evidence  | "Evidence primarily supports \[side]. The opposing evidence from \[source] is \[assessment]. The converged view is \[position]."       |
| Both capture different market segments | **Bifurcation** — both dynamics operate simultaneously on different segments         | "The market is bifurcating. \[Thesis dynamic] in \[segment A]; \[counter-thesis dynamic] in \[segment B]."                             |
| Same conclusion, different framing     | **Independent agreement** — both lines of inquiry converge on the same truth         | "Both the thesis and counter-thesis research independently converge on: \[shared conclusion]. This is the highest-confidence finding." |

**Output per convergence:**

```yaml
convergence:
  - id: "cv001"
    thesis_aspects: ["aspect_1", "aspect_2"]        # thesis aspect ids
    counter_thesis_aspects: ["counter_1"]             # counter-thesis aspect ids
    thesis_claim: "The central thesis claim"
    counter_evidence: "The strongest counter-evidence"
    resolution_pattern: layer_separation|horizon_separation|refinement|weight_of_evidence|bifurcation|independent_agreement
    converged_insight: "The higher-level truth that resolves the tension"
    confidence: high|medium|low
    evidence:
      - finding_id: "f001"
        aspect_id: "aspect_1"
        weight: 0.9
      - finding_id: "f005"
        aspect_id: "counter_1"
        weight: 0.85
```

**Counter-thesis quality check:**

* If counter-thesis aspects found no meaningful opposing evidence → flag as weak antithesis in `quality_metrics.notes`
* If thesis and counter-thesis aspects agree on multiple points → document these as highest-confidence "independent agreement" convergences
* If counter-thesis evidence is stronger than thesis evidence → the converged truth should lean toward or fully favor the counter-thesis position

### Step 4: Generate Insights

From patterns and strong findings, generate insights:

**Insight criteria:**

* Supported by 2+ sources
* Non-obvious (not just restating a finding)
* Actionable or informative

```yaml
insight:
  id: "i001"
  title: "Short title"
  description: "Clear statement of the insight"
  evidence:
    - finding_id: "f001"
      weight: 0.8
    - finding_id: "f012"
      weight: 0.6
  confidence: high|medium|low
  type: observation|recommendation|warning
```

**Confidence levels:**

| Level  | Criteria                              |
| ------ | ------------------------------------- |
| high   | 3+ S/A sources, no contradictions     |
| medium | 2+ sources OR B-tier majority         |
| low    | Single source OR contradictions exist |

### Step 5: Calculate Quality Metrics

```yaml
saturation: # Information completeness (0-100)
  formula: (unique_topics_covered / expected_topics) * 100
  threshold: 50

diversity: # Source variety (0-1)
  formula: unique_domains / total_sources
  threshold: 0.5

tier_quality: # Weighted average of source tiers
  formula: sum(tier_weight * source_count) / total_sources
  threshold: 0.6

evidence_depth: # Average findings per insight
  formula: total_findings / total_insights
  threshold: 3
```

### Step 6: Organize by Themes

Group insights into themes for report structure:

```yaml
themes:
  - name: "Theme Name"
    description: "What this theme covers"
    insights: ["i001", "i003", "i007"]
    primary_aspects: ["aspect_1", "aspect_2"]
```

## Output Schema

```yaml
metadata:
  session_id: string
  created_at: timestamp
  aspects_processed: number
  total_findings: number
  total_sources: number
  unique_domains: number

insights:
  - id: "i001"
    title: string
    description: string
    evidence:
      - finding_id: string
        aspect_id: string
        source_url: string
        weight: number
    confidence: high|medium|low
    type: observation|recommendation|warning

convergences:  # NEW — only present when counter-thesis aspects exist
  - id: string
    thesis_aspects: string[]
    counter_thesis_aspects: string[]
    thesis_claim: string
    counter_evidence: string
    resolution_pattern: layer_separation|horizon_separation|refinement|weight_of_evidence|bifurcation|independent_agreement
    converged_insight: string
    confidence: high|medium|low
    evidence: object[]

cross_aspect_patterns:
  - pattern: string
    type: recurring|contradiction|thesis_antithesis_convergence|causal|gap
    aspects: string[]
    strength: number
    evidence: object[]

themes:
  - name: string
    description: string
    insights: string[]

quality_metrics:
  saturation: number
  diversity: number
  tier_quality: number
  evidence_depth: number

source_summary:
  total: number
  by_tier: {S: n, A: n, B: n, C: n, D: n}
  top_domains: string[]
```

## Example Output

```yaml
metadata:
  session_id: "2026-01-30_ai_agents_orchestration_patterns"
  created_at: "2026-01-30T10:30:00Z"
  aspects_processed: 5
  total_findings: 48
  total_sources: 32
  unique_domains: 24

insights:
  - id: "i001"
    title: "Hierarchical orchestration dominates production systems"
    description: "Most production multi-agent systems use hierarchical patterns with a central coordinator, despite theoretical benefits of mesh/swarm approaches."
    evidence:
      - finding_id: "arch_f003"
        aspect_id: "architecture"
        source_url: "https://..."
        weight: 0.9
      - finding_id: "tools_f007"
        aspect_id: "tools"
        source_url: "https://..."
        weight: 0.7
    confidence: high
    type: observation

cross_aspect_patterns:
  - pattern: "State management is the primary challenge across all orchestration approaches"
    type: recurring
    aspects: ["architecture", "challenges", "tools"]
    strength: 5

themes:
  - name: "Orchestration Approaches"
    description: "Different architectural patterns and their trade-offs"
    insights: ["i001", "i002", "i005"]

quality_metrics:
  saturation: 72
  diversity: 0.75
  tier_quality: 0.68
  evidence_depth: 4.2

source_summary:
  total: 32
  by_tier: {S: 3, A: 12, B: 10, C: 5, D: 2}
  top_domains: ["github.com", "arxiv.org", "langchain.com"]
```

## Quality Criteria

* [ ] All findings traced to aspects
* [ ] No hallucinated insights
* [ ] Patterns have evidence
* [ ] Themes cover all major insights
* [ ] Metrics calculated
* [ ] When counter-thesis aspects exist: convergences section populated
* [ ] Each thesis/counter-thesis pair has a resolution pattern applied (not just listed side by side)
* [ ] Weak antithesis flagged in quality\_metrics.notes if counter-evidence is sparse
* [ ] Independent agreements between thesis and counter-thesis highlighted as highest-confidence