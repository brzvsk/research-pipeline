---
name: search-safeguard
type: atomic
version: v2.0
description: "Exa API wrapper with predictable intervals, retry, error handling. Use this skill whenever executing web searches for research. Applies consistent 600ms delay between requests to prevent rate limiting."
---

# Search Safeguard

## Purpose

Wrap search API calls with reliability patterns: predictable delays between requests, automatic retry on failure, graceful error handling.

**Key change in v2.0:** Uses PREDICTABLE 600ms intervals instead of random jitter. This ensures consistent, reliable timing across all research workers.

## Configuration

```yaml
defaults:
  max_retries: 3
  delay_ms: 600          # PREDICTABLE interval - always 600ms
  timeout_ms: 30000
  results_per_query: 8
```

## Procedure

### Step 1: Pre-Request Delay (Predictable)

Before each search request, ALWAYS wait exactly 600ms using bash sleep:

```bash
sleep 0.6
```

This prevents rate limiting when running parallel requests. The 600ms value is:

* Long enough to prevent rate limiting
* Short enough for efficient research
* Consistent across all workers for predictable timing

### Step 2: Execute Search

```bash
sleep 0.6 && mcp__exa__web_search_exa(
  query: query,
  numResults: results_per_query
)
```

### Step 3: Retry on Failure

On failure (timeout, rate limit, server error), use exponential backoff with PREDICTABLE delays:

```bash
# Retry attempt 1: wait 1.2s (2 x 600ms)
sleep 1.2 && retry_search()

# Retry attempt 2: wait 2.4s (4 x 600ms)
sleep 2.4 && retry_search()

# Retry attempt 3: wait 4.8s (8 x 600ms)
sleep 4.8 && retry_search()
```

### Step 4: Error Classification

| Error Type         | Retry | Action                                 |
| ------------------ | ----- | -------------------------------------- |
| Rate limit (429)   | Yes   | Exponential backoff (1.2s, 2.4s, 4.8s) |
| Server error (5xx) | Yes   | Standard retry (1.2s, 2.4s, 4.8s)      |
| Client error (4xx) | No    | Log and skip                           |
| Timeout            | Yes   | Retry with same delay                  |
| Network error      | Yes   | Standard retry                         |

### Step 5: Result Validation

After successful response:

* Check results array exists
* Filter out null/invalid results
* Return validated results

## Output

```yaml
status: success|partial|failed
queries_attempted: 3
queries_succeeded: 3
total_results: 24
errors: []
results:
  - query: "search query 1"
    count: 8
    items: [...]
```

## Error Output

```yaml
status: failed
queries_attempted: 3
queries_succeeded: 0
errors:
  - query: "search query 1"
    error: "Rate limit exceeded"
    attempts: 3
  - query: "search query 2"
    error: "Timeout after 30s"
    attempts: 3
```

## Integration with Research Pipeline

### Required Delay Pattern

When calling search APIs in research workers, ALWAYS use this exact pattern:

```bash
# For each query in parallel research
for query in queries:
  sleep 0.6
  result = mcp__exa__web_search_exa(query, numResults: 8)
  process_result(result)
```

### Batch Execution

When executing multiple queries:

1. Apply `sleep 0.6` between each query
2. For parallel workers, each worker independently uses `sleep 0.6`
3. Aggregate errors at the end
4. Continue with successful results

## Best Practices

* ALWAYS use `sleep 0.6` before each search (never skip delays)
* Don't retry client errors (bad query)
* Log all errors for debugging
* Continue pipeline even if some queries fail
* Set reasonable timeouts (30s default)
* Use exponential backoff ONLY for retries, not initial requests