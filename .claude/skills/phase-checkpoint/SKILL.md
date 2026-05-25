---
name: phase-checkpoint
type: atomic
version: v1.1
description: "Record phase completion in workflow state"
---

# Phase Checkpoint

## Purpose

Record that a pipeline phase completed and append checkpoint metadata to `state.yaml`. This provides lightweight progress tracking without Git history.

## When to Invoke

Invoke after any phase completes successfully:

* After planning
* After research
* After synthesis
* After quality
* After report

## Input

```yaml
session_id: "2026-01-30_topic_name"
phase_id: 2
phase_name: "research"
artifacts_path: "artifacts/{session_id}"
```

## Procedure

### Step 1: Verify Session State

Read `artifacts/{session_id}/state.yaml`.

If the state file does not exist, create it first with the current session metadata.

### Step 2: Count Current Artifacts

Inspect the session directory and count relevant files produced so far.

Example summary:

```yaml
files_snapshot:
  total_files: 5
  key_files:
    - plan.yaml
    - aspects/architecture.yaml
    - aspects/patterns.yaml
    - state.yaml
```

### Step 3: Append Checkpoint Metadata

Add checkpoint info to `state.yaml`:

```yaml
checkpoints:
  - phase: 2
    name: "research"
    created_at: "2026-01-30T10:30:00Z"
    files_snapshot:
      total_files: 5
      key_files:
        - plan.yaml
        - aspects/architecture.yaml
        - aspects/patterns.yaml
        - state.yaml
```

## Output

```yaml
status: "recorded" | "skipped" | "failed"
checkpoint:
  phase: 2
  phase_name: "research"
  files_snapshot:
    total_files: 5
message: "Checkpoint recorded successfully"
```

## Idempotency

Running checkpoint twice for the same phase:

1. First run: appends a checkpoint record
2. Second run: detects existing record for the same phase and skips

```yaml
status: "skipped"
reason: "Checkpoint already recorded for this phase"
```

## Error Handling

| Scenario | Action |
|----------|--------|
| Missing state file | Create or repair state first |
| Invalid state YAML | Repair before recording |
| Missing artifacts directory | Report error and halt checkpoint |

## Integration with manager-research

After each phase in `manager-research`:

```
Phase N completes → write artifacts → invoke phase-checkpoint
```

Example in Phase 2:

```
# After all researchers complete
Skill(skill: "phase-checkpoint", args: |
  session_id: {session}
  phase_id: 2
  phase_name: research
)
```

## Recovery Use Case

If a later phase fails, use the recorded checkpoints in `state.yaml` to determine the last completed phase and resume from the next incomplete one.

See: `resume-checkpoint` skill for artifact-based recovery.
