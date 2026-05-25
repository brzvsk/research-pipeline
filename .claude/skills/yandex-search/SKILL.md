---
name: yandex-search
description: |
    This skill should be used when the user asks to "search the web with Yandex",
    "run a Yandex search", "find Yandex search results", "search Yandex images",
    "get a Yandex generative answer", or mentions Yandex Search API integration.
    Also used automatically by the research pipeline for Russian/CIS topics as part of
    the exa + Yandex source stack (source_type: yandex).
allowed-tools: Bash(npx -y bun run {baseDir}/scripts/client.ts:*)
---

# Yandex Search Skill

**When to use:**

* User wants to search the web with Yandex
* User asks to "run a Yandex search"
* User wants to find Yandex search results for a query
* User wants to search Yandex images
* User wants to get a Yandex generative answer
* User mentions Yandex Search API integration

**Setup (first time only):**

1. Create a Yandex Search API key in Yandex AI Studio
2. Copy `scripts/.env.example` to `scripts/.env`
3. Paste the API key secret and folder ID into the `.env` file
4. Use the confirmed web search REST endpoint: [`https://searchapi.api.cloud.yandex.net/v2/web/search`](https://searchapi.api.cloud.yandex.net/v2/web/search)
5. Use the auth header format: `Authorization: Api-Key <API-key-secret>`
6. Do not use the API key identifier in requests unless Yandex documents a separate requirement for another interface

**Operations:**

| Operation           | Description                                                         | When to use                                                        |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `web-search`        | Yandex web search — returns a list of results to evaluate and crawl | **Default for research** — cheap (\~$0.004/req)                    |
| `generative-answer` | Synthesized answer + cited sources                                  | **Selective only** — 1 per aspect max; $0.042/req (10× web-search) |
| `image-search`      | Yandex image search                                                 | Image-specific tasks only                                          |
| `help`              | Show available operations and expected setup                        | —                                                                  |

**Cost-aware usage for the research pipeline:**

| Operation           | Price              | Rate limit        | Usage rule                                                                      |
| ------------------- | ------------------ | ----------------- | ------------------------------------------------------------------------------- |
| `web-search`        | \~$0.004/req       | generous          | Use freely — default for all `yandex_query:` prefixed queries                   |
| `generative-answer` | \~$0.042/req (10×) | 1 req/s, 1,000/hr | Use sparingly — only for `yandex_gen_query:` prefixed queries, max 1 per aspect |

**When generative-answer is worth the cost:**

* The core synthesis question for an aspect (e.g. "What is the market size of X in Russia 2026?")
* Questions where a direct answer is more valuable than a list of links to crawl
* Complex comparison questions that benefit from synthesis (e.g. "Wildberries vs Ozon commission comparison")

**When to stick with web-search:**

* Factual lookups where crawling the top result is sufficient
* Exploratory queries to find relevant sources
* Any query where you'd crawl the page anyway

**Process:**

1. **Extract Parameters**
   * Parse user input for the intended operation and query
   * Optional parameters may include market, region, device, result limit, or response format
   * If the request is ambiguous: ask for clarification
2. **Execute Script**
   ```bash
   npx -y bun run {baseDir}/scripts/client.ts <operation> [args...]
   ```
3. **Interpret Results**
   * `SUCCESS: <json>` → Report formatted results to the user
   * `ERROR: 401` → Invalid or missing credentials
   * `ERROR: 404` → Resource or endpoint not found
   * `ERROR: 429` → Rate limited — wait before retry
   * `ERROR: timeout` → Network issue — retry

**Notes:**

* The Yandex documentation shows both REST and gRPC interfaces
* Search output format and exact request fields can differ by interface and search type
* This scaffold defaults to a configurable REST endpoint via environment variables
* Update the script payload mapping after confirming the exact API method your account exposes

**Error Handling:**

| Error Code | Meaning                                    |
| ---------- | ------------------------------------------ |
| 400        | Invalid arguments or unsupported operation |
| 401        | Invalid or missing API credentials         |
| 404        | Endpoint or resource not found             |
| 429        | Rate limited — wait before retry           |
| 500        | Server or integration error                |
| timeout    | Network timeout — retry                    |