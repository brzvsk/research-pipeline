---
name: twitter-research
type: atomic
version: v1.0
description: "Get real-world experience, opinions, and discussions from Twitter/X. Use getxapi wrapper with predictable delays, retry logic, and structured output. Apply this skill when research needs personal experiences, live discussions, or real user feedback."
---

# Twitter Research

## Purpose

Fetch real-world perspectives from Twitter/X when research needs:
- Personal experiences and testimonials
- Live discussions and debates
- Real user feedback and opinions
- Industry sentiment and reactions

**Complementary to web search:** Web search finds articles; Twitter finds human experiences.

## Configuration

```yaml
defaults:
  max_retries: 3
  delay_ms: 600          # Predictable interval (same as search-safeguard)
  timeout_ms: 30000
  results_per_query: 10
```

## Procedure

### Step 1: Pre-Request Delay (Predictable)

Before each Twitter API call, ALWAYS wait exactly 600ms:

```bash
sleep 0.6
```

### Step 2: Execute Search

Use getxapi via the Bash tool:

```bash
sleep 0.6 && npx -y bun run {baseDir}/scripts/client.ts search "{query}"
```

Or for specific operations:

```bash
# Get tweet by URL
sleep 0.6 && npx -y bun run {baseDir}/scripts/client.ts tweet "{tweet_url}"

# Get user profile
sleep 0.6 && npx -y bun run {baseDir}/scripts/client.ts user "@{handle}"

# Check balance
npx -y bun run {baseDir}/scripts/client.ts account
```

### Step 3: Parse Results

Extract structured data from JSON output:

```json
{
  "data": [
    {
      "id": "1234567890",
      "text": "Tweet content...",
      "author": {
        "username": "username",
        "name": "Display Name",
        "followers": 1234
      },
      "created_at": "2026-04-28T10:00:00Z",
      "public_metrics": {
        "retweet_count": 42,
        "like_count": 128,
        "reply_count": 15
      }
    }
  ]
}
```

### Step 4: Retry on Failure

On failure (rate limit, server error), use exponential backoff:

```bash
# Retry attempt 1: wait 1.2s
sleep 1.2 && retry()

# Retry attempt 2: wait 2.4s
sleep 2.4 && retry()

# Retry attempt 3: wait 4.8s
sleep 4.8 && retry()
```

### Step 5: Error Handling

| Error Code | Meaning                              | Action                        |
| ---------- | ------------------------------------ | ----------------------------- |
| 401        | Invalid or missing API key           | Check .env setup              |
| 404        | Tweet or user not found              | Skip, log                     |
| 429        | Rate limited (30 req/min)            | Exponential backoff           |
| 500        | Server error                         | Retry with backoff            |
| timeout    | Network timeout                      | Retry with backoff            |

## Output Schema

```yaml
status: success|partial|failed
queries_attempted: 3
queries_succeeded: 3
total_tweets: 24
errors: []

tweets:
  - id: "1234567890"
    text: "Tweet content..."
    author: "username"
    author_name: "Display Name"
    author_followers: 1234
    created_at: "2026-04-28T10:00:00Z"
    likes: 128
    retweets: 42
    replies: 15
    url: "https://twitter.com/username/status/1234567890"

sentiment_summary:
  positive: 15
  negative: 3
  neutral: 6
```

## Integration with Research Pipeline

### When to Use

Add Twitter research to an aspect when:
- The topic involves personal experiences or reviews
- You need real user opinions, not just articles
- The topic has active Twitter discussions
- Looking for industry sentiment or reactions

### How to Specify

In `plan.yaml`, add `source_type` to aspects:

```yaml
aspects:
  - id: "user_experience"
    name: "User Experience"
    description: "Real user reviews and experiences"
    priority: 1
    source_type: twitter          # twitter-only
    queries:
      - "ProductName review"
      - "ProductName experience"
      - "ProductName feedback"

  - id: "technical_analysis"
    name: "Technical Analysis"
    description: "Technical deep-dive"
    priority: 1
    source_type: both             # web + twitter
    queries:
      - web:
        - "ProductName architecture"
        - "ProductName performance"
      - twitter:
        - "ProductName developer experience"
        - "#ProductName"
```

### Research Worker Pattern

```bash
# For twitter source_type
for query in twitter_queries:
  sleep 0.6
  result = Bash("npx -y bun run .../client.ts search '{query}'")
  process_tweet_result(result)

# For both source_type
for query in web_queries:
  sleep 0.6
  result = mcp__exa__web_search_exa(query)
  process_web_result(result)

for query in twitter_queries:
  sleep 0.6
  result = Bash("npx -y bun run .../client.ts search '{query}'")
  process_tweet_result(result)
```

## Query Best Practices

### Effective Twitter Queries

Keep queries **short — 1-2 keywords max**. Twitter/X search is restrictive with complex queries. Boolean operators (`OR`, `AND`), filters (`min_faves:`, `from:`, `since:`), and long phrases return very few or zero results.

| Type          | Example                                | Use Case                     |
| ------------- | -------------------------------------- | ---------------------------- |
| Direct        | `ProductName review`                   | General opinions             |
| Direct        | `ProductName feedback`                 | User experiences             |
| Direct        | `ProductName`                          | Broad topic (single word)    |

### Query Formatting

- 1-2 keywords only — no boolean operators, no filters, no date ranges
- Shorter queries return more results
- Avoid: `OR`, `AND`, `min_faves:`, `since:`, `from:`, quotes for exact phrases

## Quality Criteria

- [ ] Queries are 1-2 keywords max (no boolean operators, no `min_faves:`, no `since:`)
- [ ] Each query waited 600ms before execution
- [ ] Failed queries logged with error codes
- [ ] Results parsed into structured format
- [ ] Author info and engagement metrics captured
