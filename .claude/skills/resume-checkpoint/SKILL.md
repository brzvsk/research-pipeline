---
name: resume-checkpoint
type: atomic
version: v1.1
description: "Restore pipeline state from recorded phase checkpoint"
---

# Resume Checkpoint

## Purpose

Restore pipeline state to a previously recorded phase checkpoint using artifact snapshots and `state.yaml`. Enables recovery from failures without Git.

## When to Invoke

* Pipeline failed mid-phase and needs rollback
* User wants to re-run from specific phase
* Debugging requires comparing different runs
* Experimenting with alternative approaches

## Input

```yaml
session_id: "2026-01-30_topic_name"
target_phase: 2  # Resume AFTER this phase (start phase 3)
```

## Procedure

### Step 1: Validate Target

Read `artifacts/{session_id}/state.yaml` and inspect recorded checkpoints.

Output example:

```
phase 1 → planning
phase 2 → research
phase 3 → synthesis
```

If `target_phase` is not present in `checkpoints`, return an error listing available phases.

### Step 2: Check Current State

Read the current `state.yaml` and note the current phase and any existing error state.

### Step 3: Restore Artifacts

Restore the session directory from the latest available artifact snapshot for the requested phase.

If no dedicated snapshot exists, restore logically by:

1. Keeping files produced up to the target phase
2. Removing files produced only by later phases
3. Resetting phase statuses after the target phase to `pending`

### Step 4: Update state.yaml

Update state file to reflect restored position:

```yaml
session_id: "2026-01-30_topic_name"
current_phase: "{next_phase_name}"
phase_states:
  planning: completed
  research: completed
  synthesis: pending
  quality_gate: pending
  report: pending
last_updated: "{now}"
restored_from:
  phase: 2
  restored_at: "{now}"
  reason: "manual_resume"
```

### Step 5: Report Restoration

```yaml
status: "restored"
restored_to:
  phase: 2
  phase_name: "research"
artifacts_restored:
  - plan.yaml
  - aspects/architecture.yaml
  - aspects/patterns.yaml
  - state.yaml
next_phase: 3
next_phase_name: "synthesis"
message: "Restored to phase 2. Ready to resume from phase 3 (synthesis)."
```

## Output

```yaml
status: "restored" | "failed"
restored_to:
  phase: number
  phase_name: string
artifacts_restored: string[]
next_phase: number
next_phase_name: string
previous_state:
  current_phase: string
  had_error: boolean
```

## Usage Scenarios

### Scenario 1: Retry Failed Phase

Phase 4 (quality) failed due to threshold issue:

```
1. resume-checkpoint with target_phase: 3
2. Artifacts restored to post-synthesis state
3. Modify thresholds or synthesis
4. Re-run from phase 4
```

### Scenario 2: Re-research Single Aspect

Want to re-do research for one aspect:

```
1. resume-checkpoint with target_phase: 1
2. Edit plan.yaml to modify aspect queries
3. Re-run phase 2 with updated queries
```

### Scenario 3: Compare Approaches

Testing different synthesis strategies:

```
1. Run full pipeline → record checkpoint at each phase
2. resume-checkpoint to phase 2
3. Modify synthesis parameters
4. Run phases 3-5
5. Compare results with original
```

## Integration

Called by manager-research for recovery:

```
On phase failure:
  1. Log error
  2. Ask user: "Resume from phase N-1?"
  3. If yes → invoke resume-checkpoint
  4. Continue pipeline from restored state
```

Manual invocation:

```
Skill(skill: "resume-checkpoint", args: |
  session_id: 2026-01-30_topic_name
  target_phase: 2
)
```

## Safety

### Artifact Overwrite Warning

If restoration will overwrite newer artifacts:

```yaml
warning: "Newer artifacts will be overwritten"
affected_files:
  - artifacts/session/synthesis.yaml
  - artifacts/session/aspects/new_aspect.yaml
action: "Confirm restoration first"
```

### No Destructive Repository Operations

* Does not require a Git repository
* Only modifies workflow artifacts
* Recovery relies on recorded checkpoints and saved snapshots

## Error Cases

| Error              | Handling                               |
| ------------------ | -------------------------------------- |
| Phase not found    | List available recorded phases         |
| No checkpoint data | Error, cannot resume                   |
| Missing snapshot   | Attempt logical restore from artifacts |
| Invalid session    | Error with available sessions list     |

## Phase Name Mapping

| Phase ID | Name          | Description              |
| -------- | ------------- | ------------------------ |
| 1        | planning      | Topic decomposition      |
| 2        | research      | Parallel aspect research |
| 3        | synthesis     | Cross-aspect synthesis   |
| 4        | quality\_gate | Quality evaluation       |
| 5        | report        | Final report generation  |