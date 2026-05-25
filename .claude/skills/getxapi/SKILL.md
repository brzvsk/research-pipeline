---
name: getxapi
description: |
    This skill should be used when the user asks to "search tweets",
    "find twitter posts", "get tweet", "get user profile", "check twitter",
    "search x.com", "twitter/x search", "get tweet replies", or mentions
    GetXAPI integration.
allowed-tools: Bash(npx -y bun run {baseDir}/scripts/client.ts:*)
---

# GetXAPI Skill

**When to use:**

* User wants to search Twitter/X posts by keyword, user, or hashtag
* User asks to get a specific tweet by URL or ID
* User wants to look up a Twitter profile
* User wants to fetch replies to a tweet
* User mentions "GetXAPI" or Twitter API integration

**Setup (first time only):**

1. Get API key from [https://www.getxapi.com](https://www.getxapi.com) (free $0.10 credits, no card required)
2. Copy `scripts/.env.example` to `scripts/.env`
3. Paste your key in the `.env` file

**Operations:**

| Operation | Description                           | Cost        |
| --------- | ------------------------------------- | ----------- |
| `search`  | Search tweets by query, user, hashtag | $0.001/call |
| `tweet`   | Get a single tweet by ID or URL       | $0.001/call |
| `user`    | Get a Twitter profile by @handle      | $0.001/call |
| `account` | Check your GetXAPI balance & usage    | FREE        |
| `help`    | Show available operations             | FREE        |

**Process:**

1. **Extract Parameters**
   * Parse user input for the operation and required arguments
   * For `search`: extract the query string (e.g., "AI news", "from:elonmusk")
   * For `tweet`: extract the tweet ID or full URL
   * For `user`: extract the @username
   * If ambiguous: ask for clarification
2. **Execute Script**
   ```bash
   npx -y bun run {baseDir}/scripts/client.ts <operation> [args...]
   ```
3. **Interpret Results**
   * `SUCCESS: <json>` → Report formatted results to user
   * `ERROR: 401` → Invalid or missing API key
   * `ERROR: 404` → Tweet or user not found
   * `ERROR: 429` → Rate limited — wait before retry
   * `ERROR: timeout` → Network issue — retry

**Search Query Examples:**

* `AI` — tweets containing "AI"
* `from:elonmusk` — tweets from elonmusk
* `#crypto` — tweets with #crypto hashtag
* `AI from:elonmusk since:2024-01-01` — elonmusk tweets about AI since 2024
* `"product launch" min_faves:100` — popular tweets with "product launch"
* `to:OpenAI` — replies to OpenAI

**Error Handling:**

| Error Code | Meaning                                        |
| ---------- | ---------------------------------------------- |
| 401        | Invalid or missing API key                     |
| 404        | Tweet or user not found                        |
| 429        | Rate limited (30 req/min on account endpoints) |
| 500        | Server error — retry                           |
| timeout    | Network timeout — retry                        |