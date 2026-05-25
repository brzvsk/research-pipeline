---
name: telegram-search
description: |
    This skill should be used when the user asks to "search telegram posts",
    "find telegram channel posts", "search by hashtag in telegram",
    "get telegram post content", "search telegram channels", "find posts in telegram",
    or mentions Telegram MTProto search integration.
    Also used automatically by the research pipeline for Russian/CIS topics as part of
    the exa + Yandex + Telegram source stack (source_type: yandex).
allowed-tools: Bash(npx -y bun run {baseDir}/scripts/client.ts:*)
---

# Telegram Search Skill

Uses the Telegram MTProto API (teleproto layer 221) to search public channel posts and retrieve full post content.

**Library:** `teleproto@1.221.0` — drop-in gramJS fork, Layer 221, npm alias `telegram`.
**Script:** `/Users/brzvsk/Documents/research/.claude/skills/telegram-search/scripts/client.ts`

**When to use:**
- Search Telegram posts by keyword or hashtag
- Find posts in a specific Telegram channel
- Deep-dive into relevant channels found by a search
- Fetch full content of specific posts by ID
- Load comment threads for a post

## Setup (first time only)

1. Register an app at https://my.telegram.org → **API development tools** — get `api_id` and `api_hash`
2. Copy `scripts/.env.example` to `scripts/.env` and fill in `TG_API_ID` and `TG_API_HASH`
3. Generate session string (interactive, once):
   ```bash
   npx -y bun run {baseDir}/scripts/auth.ts
   ```
4. Paste the printed session string into `TG_SESSION` in `.env`

## Rate Limits

| Operation        | Limit                        | Flood wait threshold              |
|------------------|------------------------------|-----------------------------------|
| `search-query`   | **10/day** (Telegram Premium) | n/a — hard daily quota           |
| `search-hashtag` | Unlimited (free)             | Safe at any rate with 600ms delay |
| `search-channel` | No daily limit               | ~3 calls/s safe; 1s delay = never |
| `search-global`  | No daily limit               | Same as search-channel            |
| `get-posts`      | No daily limit               | Max 100 IDs per call              |
| `get-comments`   | No daily limit               | 1s delay between threads = safe   |

**Flood wait guidance (from Telethon/gramJS source + empirical testing):**
- `messages.search` (used by `search-channel`): 3 rapid calls of 100 posts → FLOOD_WAIT ~30s. With **1s between operations** → never floods.
- `messages.getReplies` (used by `get-comments`): same profile. 1s delay = safe.
- `channels.SearchPosts` (used by `search-query`): hard quota counter, not a flood wait.
- Telegram Layer 221 introduced `FLOOD_PEER_WAIT_X` — peer-specific throttle, doesn't block the whole account.

**`search-query` quota:**
- **10 free searches/day** with Telegram Premium. Resets daily.
- `queryIsFree: true` in response = server returned a cached result, **did not consume a slot**.
- Slots consumed: run `check-quota` before and after to track.
- After quota: each search costs `starsAmount` Telegram Stars (currently 10 Stars). Pass `allowPaidStars` to authorise.

**If quota is exhausted (ERROR: 403):**
- Check `waitTill` from `check-quota` for reset time
- Fall back to `search-hashtag` for single-word topics
- Use `search-channel` on known relevant channels (free)

## Operations

### 1. search-query — Full-text search across ALL public channels
```bash
npx -y bun run {baseDir}/scripts/client.ts search-query "<query>" [limit]
```
- Uses `channels.SearchPosts/query` (Layer 221) — **all public Telegram channels**, not just joined ones
- Full multi-word text query, Telegram handles matching server-side
- **Requires Telegram Premium**. Returns `quota` field in response with `remains`/`totalDaily`/`queryIsFree`
- Default limit 50 (recommended for expanded search strategy); max 100 per call, paginated automatically
- Examples: `search-query "репрайсер" 50` · `search-query "wildberries аналитика" 50`

### 2. search-hashtag — Search public channels by hashtag (free, no quota)
```bash
npx -y bun run {baseDir}/scripts/client.ts search-hashtag <hashtag> [limit]
```
- Uses `channels.SearchPosts/hashtag` — single-word token, all public channels, no quota
- `hashtag` — with or without `#`. Multi-word: only primary keyword used.
- Default limit 50, max 500
- Examples: `search-hashtag репрайсер 50` · `search-hashtag "#wildberries" 100`

### 3. search-channel — Search within a specific channel (free, no daily limit)
```bash
npx -y bun run {baseDir}/scripts/client.ts search-channel <@channel> "<query>" [limit]
```
- Uses `messages.search` — full-text, within one channel, searches all history
- Works on any public channel · `@` optional · default limit 20, max 1000
- **Core workhorse of the expanded search strategy** — free, no quota, finds older deep content
- Examples: `search-channel @sellerman "аналитика" 20` · `search-channel durov "fragment" 50`

### 4. check-quota — Check remaining daily search quota
```bash
npx -y bun run {baseDir}/scripts/client.ts check-quota ["optional query"]
```
- Uses `channels.CheckSearchPostsFlood` (Layer 221 — real API call, not a probe)
- Returns `remains`, `totalDaily`, `waitTill` (unix reset time), `starsAmount`, `queryIsFree`

### 5. get-posts — Fetch full content of specific posts by IDs
```bash
npx -y bun run {baseDir}/scripts/client.ts get-posts <@channel> <id1,id2,...>
```
- Comma-separated message IDs, max 100 per call · deleted posts return as empty (not errors)
- Example: `get-posts @aitools4daily 1721,1720,1719`

### 6. get-comments — Fetch comment thread for a channel post
```bash
npx -y bun run {baseDir}/scripts/client.ts get-comments <@channel> <msg_id> [limit]
```
- Returns comments with sender names, reply threading, media types, links
- Channel must have a linked discussion group (comments enabled by admin)
- Returns `ERROR: 404` if the post has no comment thread — handle gracefully, do not retry
- Example: `get-comments @btsarttt 24318 100`

### 7. search-global — Search across all joined chats (no daily limit)
```bash
npx -y bun run {baseDir}/scripts/client.ts search-global "<query>" [limit]
```
- Searches only chats/groups/channels the authenticated account has joined
- Example: `search-global "product roadmap" 30`

## Expanded Search Strategy

**Goal:** squeeze maximum content from 1 `search-query` quota slot.
**Tested result:** 180 posts from 13 channels, 1 slot, 34.7 seconds, zero flood waits.

```
Phase 1 — Discovery (1 quota slot)
  search-query "query" 50
      ↓
  deduplicate channels from results
  filter: keep channels where max_views >= 50   ← drops spam/bot channels
  sort by max_views desc

Phase 2 — Depth expansion (FREE, 1s pause between channels)
  for each real channel (top 8):
      sleep(1s)
      search-channel @ch "query" 20
      deduplicate against already-seen posts

Phase 3 — Comments (FREE, selective, 1s pause between threads)
  for each post with forwards >= 2 (cap at 6 threads):
      sleep(1s)
      get-comments @ch msg_id 30
      on ERROR 404 → skip silently (no discussion group)
```

**Thresholds (calibrated from test run):**

| Parameter | Value | Rationale |
|---|---|---|
| Discovery limit | 50 | ~15–25 unique channels, good coverage |
| `min_views` filter | 50 | Drops spam bots (views=1–3) reliably |
| `max_channels` | 8 | 8 × 20 posts = 160 + 50 discovery = 210 max |
| `channel_limit` | 20 | Enough depth, single API call each |
| `comment_min_forwards` | 2 | Only posts with real engagement have threads |
| `comment_cap` | 6 | Most channels are broadcast-only (no threads) |
| `inter_op_sleep` | 1s | Zero flood waits observed in testing |

**Important observations from testing:**
- `queryIsFree: true` — server caches popular queries; these don't consume a quota slot. Check `quota.queryIsFree` in `search-query` response.
- `search-channel` finds **deeper historical content** than discovery: @chinaprofessionals showed 312 max views in discovery, but channel search found posts with 3500+ views.
- Most large broadcast channels have no discussion groups → `get-comments` returns 404 → skip and move on.

## Process

1. **Determine entry point:**
   - Research topic with multi-word query → **Expanded Search Strategy** (starts with `search-query`)
   - Known specific channel → `search-channel` directly
   - Single-word hashtag topic → `search-hashtag` (free, no Premium needed)
   - Have specific post IDs → `get-posts`

2. **Execute script:**
   ```bash
   npx -y bun run {baseDir}/scripts/client.ts <operation> <args>
   ```

3. **Interpret output:**
   - `SUCCESS: <json>` → parse and use results
   - `ERROR: 401` → session expired; re-run `auth.ts`, update `TG_SESSION`
   - `ERROR: 403` → Premium required (search-query) or private channel
   - `ERROR: 404` → channel not found, or post has no comment thread
   - `ERROR: 429` → flood wait; auto-retried up to 3×; reduce call rate if persists
   - `ERROR: 500` → unexpected error

## Result Format

All operations return `SUCCESS: <json>` or `ERROR: <code> - <message>`.

**Post item fields:**
```json
{
  "id": 1721,
  "channel": "aitools4daily",
  "channelId": -1003822519093,
  "date": "2026-05-10T18:00:10.000Z",
  "text": "Full post text...",
  "views": 1500,
  "forwards": 42,
  "url": "https://t.me/aitools4daily/1721",
  "hasMedia": true,
  "mediaType": "photo",
  "links": ["https://example.com"],
  "editDate": null,
  "pinned": false
}
```

**search-query response envelope:**
```json
{
  "count": 50,
  "query": "маркетплейс аналитика",
  "method": "channels.SearchPosts/query",
  "scope": "all public channels",
  "quota": {
    "queryIsFree": true,
    "totalDaily": 10,
    "remains": 9,
    "waitTill": null,
    "starsAmount": "10"
  },
  "messages": [...]
}
```

**Comment item fields:**
```json
{
  "id": 173804,
  "date": "2026-05-10T17:34:47.000Z",
  "text": "Comment text...",
  "senderId": 6319143130,
  "senderName": "Taehyung",
  "replyToMsgId": 173803,
  "hasMedia": false,
  "mediaType": null,
  "links": [],
  "editDate": null
}
```

**Media types:** `photo` · `video` · `audio` · `document` · `sticker` · `poll` · `location` · `contact` · `game` · `unknown`

## Error Codes

| Code          | Meaning                        | Fix                                                    |
|---------------|--------------------------------|--------------------------------------------------------|
| `401`         | Session expired or invalid     | Re-run `auth.ts`, update `TG_SESSION`                 |
| `403`         | Premium required / private ch. | Buy Premium for search-query; join channel for search-channel |
| `404`         | Channel/post not found         | Check username; no comment thread = skip silently     |
| `429`         | Flood wait triggered           | Auto-retried 3×; add sleep between calls if persists  |
| `500`         | Unexpected error               | Show error message to user                             |

## Research Pipeline Usage (Russian/CIS topics)

When invoked by the research pipeline (`source_type: yandex`, `telegram_query:` prefix):

**Standard flow — Expanded Search Strategy (1 slot per aspect):**

```python
# 1. Discovery
result = search-query(stripped_query, limit=50)
# Check quota.queryIsFree — if true, slot was NOT consumed

# 2. Score and filter channels
channels = deduplicate(result.messages)
real_channels = [ch for ch in channels if ch.max_views >= 50]
real_channels = sort_by_max_views(real_channels)[:8]

# 3. Depth expansion (free)
for ch in real_channels:
    sleep(1)
    more = search-channel(ch, stripped_query, limit=20)

# 4. Comments on engaged posts (free, best-effort)
top_posts = [p for p in all_posts if p.forwards >= 2][:6]
for post in top_posts:
    sleep(1)
    comments = get-comments(post.channel, post.id, limit=30)
    # on ERROR 404 → skip, channel has no discussion group
```

**Fallback if Premium quota exhausted:**
```python
# Use hashtag mode (free) — single primary keyword only
result = search-hashtag(primary_keyword_from_query, limit=50)
# Then same depth expansion with search-channel
```

**Operation cost summary:**

| Operation | Quota cost | Daily budget |
|---|---|---|
| `search-query` | 1 slot (unless `queryIsFree`) | 10/day |
| `search-hashtag` | Free | Unlimited |
| `search-channel` | Free | Unlimited |
| `get-comments` | Free | Unlimited |

## Files

```
telegram-search/
├── SKILL.md          # This file — routing logic + full reference
└── scripts/
    ├── client.ts     # Main MTProto client (all operations)
    ├── auth.ts       # One-time interactive auth → session string
    ├── package.json  # teleproto@1.221.0 (layer 221) aliased as "telegram"
    ├── .env.example  # Credentials template
    ├── .env          # Your credentials (gitignored)
    └── .gitignore
```

**Requirements:** Bun (`/Users/brzvsk/.bun/bin/bun`) · Telegram Premium account · API credentials from my.telegram.org
