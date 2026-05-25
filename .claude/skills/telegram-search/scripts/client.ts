#!/usr/bin/env bun
/**
 * Telegram MTProto Search Client
 * Usage: bun run client.ts <operation> <args>
 *
 * Operations:
 *   search-hashtag <hashtag> [limit]         — Search public channels by hashtag (free, no quota)
 *   search-query "<query>" [limit]           — Full-text search across ALL public channels (quota-based, teleproto layer 221)
 *   search-channel <@channel> "<query>" [limit] — Search within a specific channel
 *   search-global "<query>" [limit]          — Search across all joined chats
 *   check-quota ["optional query"]           — Check remaining daily quota via channels.CheckSearchPostsFlood
 *   get-posts <@channel> <id1,id2,...>       — Fetch full content of posts by IDs
 *
 * Environment (scripts/.env):
 *   TG_API_ID    — Telegram app ID from my.telegram.org
 *   TG_API_HASH  — Telegram app hash from my.telegram.org
 *   TG_SESSION   — Session string (generate once with auth.ts)
 */

import { readFileSync } from "fs";
import { join } from "path";

// Load .env file
function loadEnv(): void {
    try {
        const envPath = join(import.meta.dir, ".env");
        const envContent = readFileSync(envPath, "utf-8");
        for (const line of envContent.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const eqIdx = trimmed.indexOf("=");
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            const value = trimmed.slice(eqIdx + 1).trim();
            if (key && !process.env[key]) {
                process.env[key] = value;
            }
        }
    } catch {
        // .env not found — rely on system env
    }
}

loadEnv();

// Validate required env vars
const TG_API_ID = Number(process.env.TG_API_ID);
const TG_API_HASH = process.env.TG_API_HASH ?? "";
const TG_SESSION = process.env.TG_SESSION ?? "";

if (!TG_API_ID || !TG_API_HASH) {
    console.log("ERROR: 401 - TG_API_ID and TG_API_HASH are required. Create scripts/.env (see .env.example)");
    process.exit(1);
}
if (!TG_SESSION) {
    console.log("ERROR: 401 - TG_SESSION is required. Run auth.ts once to generate it.");
    process.exit(1);
}

// Dynamic import of gramjs (downloaded by bun on first run)
const { TelegramClient, Api } = await import("telegram");
const { StringSession } = await import("telegram/sessions/index.js");

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

async function withFloodRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const floodMatch = errMsg.match(/FLOOD_WAIT_(\d+)/);
            if (floodMatch && attempt < maxRetries - 1) {
                const waitSec = parseInt(floodMatch[1], 10) + 5;
                process.stderr.write(`Flood wait ${waitSec}s (attempt ${attempt + 1}/${maxRetries})...\n`);
                await sleep(waitSec * 1000);
                continue;
            }
            throw err;
        }
    }
    throw new Error("Max retries exceeded");
}

function resolveChannelUsername(channel: string): string {
    return channel.startsWith("@") ? channel.slice(1) : channel;
}

function buildMessageUrl(channelUsername: string, messageId: number): string {
    return `https://t.me/${channelUsername}/${messageId}`;
}

function extractLinks(message: string, entities: unknown[]): string[] {
    const links: string[] = [];
    if (!entities) return links;
    for (const entity of entities as Record<string, unknown>[]) {
        if (entity.url) links.push(entity.url as string);
        else if (entity.className === "MessageEntityUrl") {
            const text = message.slice(entity.offset as number, (entity.offset as number) + (entity.length as number));
            links.push(text);
        }
    }
    return [...new Set(links)];
}

function getMediaType(media: unknown): string | null {
    if (!media) return null;
    const m = media as Record<string, unknown>;
    if (m.photo) return "photo";
    if (m.document) {
        const doc = m.document as Record<string, unknown>;
        const mimeType = (doc.mimeType as string) ?? "";
        if (mimeType.startsWith("video/")) return "video";
        if (mimeType.startsWith("audio/")) return "audio";
        if (mimeType === "application/x-tgsticker") return "sticker";
        return "document";
    }
    if (m.game) return "game";
    if (m.poll) return "poll";
    if (m.geo) return "location";
    if (m.contact) return "contact";
    return "unknown";
}

function formatMessage(msg: Record<string, unknown>, channelUsername?: string): Record<string, unknown> {
    const peerId = msg.peerId as Record<string, unknown> | null;
    const channelId = peerId?.channelId ? Number(peerId.channelId) : null;
    const resolvedUsername = channelUsername ?? "";

    const entities = (msg.entities as unknown[]) ?? [];
    const text = (msg.message as string) ?? "";

    return {
        id: msg.id,
        channel: resolvedUsername || String(channelId ?? ""),
        channelId: channelId ? -1000000000000 - channelId : null,
        date: msg.date ? new Date((msg.date as number) * 1000).toISOString() : null,
        text,
        views: msg.views ?? null,
        forwards: msg.forwards ?? null,
        url: resolvedUsername && msg.id ? buildMessageUrl(resolvedUsername, msg.id as number) : null,
        hasMedia: !!msg.media,
        mediaType: getMediaType(msg.media),
        links: extractLinks(text, entities),
        editDate: msg.editDate ? new Date((msg.editDate as number) * 1000).toISOString() : null,
        pinned: !!(msg.pinned),
    };
}

// ─────────────────────────────────────────────
// Operations
// ─────────────────────────────────────────────

/**
 * Extract the most distinctive keyword from a multi-word query.
 * channels.SearchPosts only accepts a single token (no spaces).
 * Strategy: take the longest word (most specific), skip common stopwords.
 */
function extractPrimaryKeyword(query: string): { primary: string; all: string[] } {
    const STOPWORDS = new Set(["как", "что", "это", "для", "или", "при", "по", "на", "в", "с", "и", "к", "о", "от", "до", "из", "не", "the", "and", "for", "how", "what", "with"]);
    const words = query.toLowerCase().replace(/[^\wа-яёa-z0-9_]/gi, " ").split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS.has(w));
    if (words.length === 0) return { primary: query.split(/\s+/)[0], all: [query] };

    // Scoring: prefer Cyrillic words (domain terms) over Latin brand names in RU context.
    // Within same script, prefer longer words (more specific).
    const isCyrillic = (w: string) => /[а-яё]/i.test(w);
    const score = (w: string) => (isCyrillic(w) ? 1000 : 0) + w.length;
    const sorted = [...words].sort((a, b) => score(b) - score(a));
    return { primary: sorted[0], all: words };
}

async function opCheckQuota(client: InstanceType<typeof TelegramClient>, query?: string) {
    // teleproto layer 221: channels.CheckSearchPostsFlood is available.
    // Returns SearchPostsFlood: { queryIsFree, totalDaily, remains, waitTill, starsAmount }
    try {
        const flood = await client.invoke(new Api.channels.CheckSearchPostsFlood({
            query: query ?? undefined,
        })) as Record<string, unknown>;
        console.log("SUCCESS:", JSON.stringify({
            remains: flood.remains ?? null,
            totalDaily: flood.totalDaily ?? null,
            waitTill: flood.waitTill ?? null,
            starsAmount: flood.starsAmount ?? null,
            queryIsFree: flood.queryIsFree ?? true,
            note: "channels.CheckSearchPostsFlood",
        }));
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("FLOOD_PREMIUM") || msg.includes("PREMIUM_ACCOUNT_REQUIRED")) {
            console.log("SUCCESS:", JSON.stringify({
                remains: 0, totalDaily: null, waitTill: null, starsAmount: null,
                queryIsFree: false, note: `Quota exhausted: ${msg}`,
            }));
        } else {
            console.log("SUCCESS:", JSON.stringify({
                remains: "unknown", totalDaily: null, waitTill: null, starsAmount: null,
                queryIsFree: true, note: `CheckSearchPostsFlood error: ${msg}`,
            }));
        }
    }
}

async function opSearchHashtag(client: InstanceType<typeof TelegramClient>, hashtag: string, limit: number) {
    const username = hashtag.startsWith("#") ? hashtag.slice(1) : hashtag;
    const messages: Record<string, unknown>[] = [];

    let offsetRate = 0;
    let offsetPeer = new Api.InputPeerEmpty();
    let offsetId = 0;

    const channelUsernameMap = new Map<bigint | string, string>();

    while (messages.length < limit) {
        const batchLimit = Math.min(100, limit - messages.length);

        const result = await withFloodRetry(() =>
            client.invoke(new Api.channels.SearchPosts({
                hashtag: username,
                offsetRate,
                offsetPeer,
                offsetId,
                limit: batchLimit,
            }))
        ) as Record<string, unknown>;

        const chats = (result.chats as Record<string, unknown>[]) ?? [];
        for (const chat of chats) {
            if (chat.username) {
                channelUsernameMap.set(String(chat.id), chat.username as string);
            }
        }

        const batch = (result.messages as Record<string, unknown>[]) ?? [];
        if (batch.length === 0) break;

        for (const msg of batch) {
            const peerId = msg.peerId as Record<string, unknown> | null;
            const channelId = peerId?.channelId ? String(peerId.channelId) : null;
            const resolvedUsername = channelId ? (channelUsernameMap.get(channelId) ?? channelId) : "";
            messages.push(formatMessage(msg, resolvedUsername as string));
        }

        const lastMsg = batch[batch.length - 1] as Record<string, unknown>;
        const slice = result as Record<string, unknown>;

        if (typeof slice.nextRate === "number" && slice.nextRate > 0) {
            offsetRate = slice.nextRate;
        } else {
            offsetRate = (lastMsg.date as number) ?? 0;
        }
        offsetId = (lastMsg.id as number) ?? 0;

        // Check if more pages exist
        if (batch.length < batchLimit) break;

        await sleep(1000); // polite delay between pages
    }

    console.log("SUCCESS:", JSON.stringify({
        count: messages.length,
        hashtag: `#${username}`,
        method: "searchPosts/hashtag",
        messages,
    }));
}

async function opSearchQuery(client: InstanceType<typeof TelegramClient>, query: string, limit: number) {
    // channels.SearchPosts/query — full-text search across ALL public Telegram channels.
    // Requires Telegram Premium subscription (10 free searches/day, then Stars).
    const messages: Record<string, unknown>[] = [];
    let offsetRate = 0;
    let offsetPeer = new Api.InputPeerEmpty() as Api.TypeEntityLike;
    let offsetId = 0;
    const channelUsernameMap = new Map<string, string>();
    let lastSearchFlood: Record<string, unknown> | null = null;

    while (messages.length < limit) {
        const batchLimit = Math.min(100, limit - messages.length);

        let result: Record<string, unknown>;
        try {
            result = await withFloodRetry(() =>
                client.invoke(new Api.channels.SearchPosts({
                    query,
                    offsetRate,
                    offsetPeer,
                    offsetId,
                    limit: batchLimit,
                    // allowPaidStars: add BigInt(starsAmount) to pay Stars after free quota exhausted
                }))
            ) as Record<string, unknown>;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("FLOOD_PREMIUM") || msg.includes("PREMIUM_ACCOUNT_REQUIRED")) {
                console.log(`ERROR: 403 - Premium required: ${msg}`);
                process.exit(1);
            }
            if (msg.includes("FLOOD_WAIT") || msg.includes("429")) {
                console.log(`ERROR: 429 - Rate limited. ${msg}`);
                process.exit(1);
            }
            if (msg.includes("SEARCH_QUERY_EMPTY")) {
                console.log(`ERROR: 400 - Empty query`);
                process.exit(1);
            }
            throw err;
        }

        if (result.searchFlood) {
            lastSearchFlood = result.searchFlood as Record<string, unknown>;
        }

        const chats = (result.chats as Record<string, unknown>[]) ?? [];
        for (const chat of chats) {
            if (chat.username) {
                channelUsernameMap.set(String(chat.id), chat.username as string);
            }
        }

        const batch = (result.messages as Record<string, unknown>[]) ?? [];
        if (batch.length === 0) break;

        for (const msg of batch) {
            if (messages.length >= limit) break;

            const peerId = msg.peerId as Record<string, unknown> | null;
            const channelId = peerId?.channelId ? String(peerId.channelId) : null;
            const resolvedUsername = channelId ? (channelUsernameMap.get(channelId) ?? channelId) : "";
            messages.push(formatMessage(msg, resolvedUsername as string));
        }

        const lastMsg = batch[batch.length - 1] as Record<string, unknown>;
        const slice = result as Record<string, unknown>;

        if (typeof slice.nextRate === "number" && slice.nextRate > 0) {
            offsetRate = slice.nextRate;
        } else {
            offsetRate = (lastMsg.date as number) ?? 0;
        }
        offsetId = (lastMsg.id as number) ?? 0;

        if (batch.length < batchLimit) break;
        await sleep(600);
    }

    console.log("SUCCESS:", JSON.stringify({
        count: messages.length,
        query,
        method: "channels.SearchPosts/query",
        scope: "all public channels",
        quota: lastSearchFlood,
        messages,
    }));
}

async function opSearchChannel(
    client: InstanceType<typeof TelegramClient>,
    channel: string,
    query: string,
    limit: number
) {
    const username = resolveChannelUsername(channel);
    const messages: Record<string, unknown>[] = [];

    try {
        for await (const msg of client.iterMessages(username, {
            search: query,
            limit,
        })) {
            const raw = msg as unknown as Record<string, unknown>;
            messages.push(formatMessage(raw, username));
        }
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes("USERNAME_NOT_OCCUPIED") || errMsg.includes("USERNAME_INVALID")) {
            console.log(`ERROR: 404 - Channel @${username} not found`);
            process.exit(1);
        }
        if (errMsg.includes("CHANNEL_PRIVATE") || errMsg.includes("CHAT_FORBIDDEN")) {
            console.log(`ERROR: 403 - Access denied to @${username} (private channel)`);
            process.exit(1);
        }
        throw err;
    }

    console.log("SUCCESS:", JSON.stringify({
        count: messages.length,
        channel: `@${username}`,
        query,
        method: "messages.search",
        messages,
    }));
}

async function opSearchGlobal(client: InstanceType<typeof TelegramClient>, query: string, limit: number) {
    const messages: Record<string, unknown>[] = [];

    for await (const msg of client.iterMessages(undefined, {
        search: query,
        limit,
    })) {
        const raw = msg as unknown as Record<string, unknown>;
        messages.push(formatMessage(raw));
    }

    console.log("SUCCESS:", JSON.stringify({
        count: messages.length,
        query,
        method: "messages.searchGlobal",
        messages,
    }));
}

async function opGetPosts(
    client: InstanceType<typeof TelegramClient>,
    channel: string,
    ids: number[]
) {
    const username = resolveChannelUsername(channel);
    const CHUNK_SIZE = 100;
    const messages: Record<string, unknown>[] = [];

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);

        let entity: unknown;
        try {
            entity = await client.getInputEntity(username);
        } catch {
            console.log(`ERROR: 404 - Channel @${username} not found`);
            process.exit(1);
        }

        const result = await withFloodRetry(() =>
            client.invoke(new Api.channels.GetMessages({
                channel: entity as Api.TypeInputChannel,
                id: chunk.map(id => new Api.InputMessageID({ id })),
            }))
        ) as Record<string, unknown>;

        const batch = (result.messages as Record<string, unknown>[]) ?? [];
        for (const msg of batch) {
            if ((msg as Record<string, unknown>)._ === "messageEmpty") continue;
            messages.push(formatMessage(msg as Record<string, unknown>, username));
        }

        if (i + CHUNK_SIZE < ids.length) await sleep(500);
    }

    console.log("SUCCESS:", JSON.stringify({
        count: messages.length,
        channel: `@${username}`,
        requestedIds: ids,
        messages,
    }));
}

async function opGetComments(
    client: InstanceType<typeof TelegramClient>,
    channel: string,
    msgId: number,
    limit: number
) {
    const username = resolveChannelUsername(channel);

    // Step 1: resolve channel entity
    let channelEntity: Api.TypeInputPeer;
    try {
        channelEntity = await client.getInputEntity(username) as Api.TypeInputPeer;
    } catch {
        console.log(`ERROR: 404 - Channel @${username} not found`);
        process.exit(1);
        return;
    }

    // Step 2: getDiscussionMessage to find the linked discussion group
    // Comments on Telegram channel posts live in a separate linked group.
    // getDiscussionMessage returns the group + the mirrored root message ID in that group.
    let groupPeer: Api.TypeInputPeer;
    let groupRootMsgId: number;
    let discussionGroupUsername: string | null = null;
    let totalComments: number | null = null;

    try {
        const disc = await withFloodRetry(() =>
            client.invoke(new Api.messages.GetDiscussionMessage({
                peer: channelEntity,
                msgId,
            }))
        ) as Record<string, unknown>;

        const discChats = (disc.chats as Record<string, unknown>[]) ?? [];
        const discMessages = (disc.messages as Record<string, unknown>[]) ?? [];

        if (discMessages.length === 0 || discChats.length === 0) {
            console.log(`ERROR: 404 - Post ${msgId} in @${username} has no linked discussion group`);
            process.exit(1);
            return;
        }

        // The root message in the GROUP (not the channel) — its id is used for getReplies
        const rootGroupMsg = discMessages[0] as Record<string, unknown>;
        groupRootMsgId = rootGroupMsg.id as number;

        // Find the linked group: the chat that is NOT the original channel
        const channelId = (channelEntity as Record<string, unknown>).channelId?.toString();
        const linkedGroup = discChats.find(c => String(c.id) !== channelId) ?? discChats[0];

        const groupId = linkedGroup.id as bigint;
        const groupAccessHash = linkedGroup.accessHash as bigint;
        groupPeer = new Api.InputPeerChannel({ channelId: groupId, accessHash: groupAccessHash });

        if (linkedGroup.username) {
            discussionGroupUsername = linkedGroup.username as string;
        }

        // Total comment count from the channel post's replies metadata
        if (rootGroupMsg.replies) {
            totalComments = ((rootGroupMsg.replies as Record<string, unknown>).replies as number) ?? null;
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("MSG_ID_INVALID") || msg.includes("DISCUSSION_MISSING")) {
            console.log(`ERROR: 404 - Post ${msgId} in @${username} has no comment thread (comments disabled or post not found)`);
            process.exit(1);
        }
        throw err;
    }

    // Step 3: paginate comments via getReplies on the DISCUSSION GROUP peer
    const comments: Record<string, unknown>[] = [];
    let offsetId = 0;
    let offsetDate = 0;

    while (comments.length < limit) {
        const batchLimit = Math.min(100, limit - comments.length);

        const result = await withFloodRetry(() =>
            client.invoke(new Api.messages.GetReplies({
                peer: groupPeer,
                msgId: groupRootMsgId,
                offsetId,
                offsetDate,
                addOffset: 0,
                limit: batchLimit,
                maxId: 0,
                minId: 0,
                hash: BigInt(0),
            }))
        ) as Record<string, unknown>;

        // Build sender display name map from embedded users + chats
        const users = (result.users as Record<string, unknown>[]) ?? [];
        const chats = (result.chats as Record<string, unknown>[]) ?? [];
        const senderMap = new Map<string, string>();
        for (const u of users) {
            const name = [u.firstName, u.lastName].filter(Boolean).join(" ")
                || (u.username as string)
                || String(u.id);
            senderMap.set(String(u.id), name);
        }
        for (const c of chats) {
            if (c.title) senderMap.set(String(c.id), c.title as string);
        }

        const batch = (result.messages as Record<string, unknown>[]) ?? [];
        if (batch.length === 0) break;

        for (const msg of batch) {
            const raw = msg as Record<string, unknown>;
            if (raw.className === "MessageEmpty") continue;

            const fromId = raw.fromId as Record<string, unknown> | null;
            const senderId = fromId?.userId ?? fromId?.channelId ?? null;
            const senderName = senderId ? (senderMap.get(String(senderId)) ?? null) : null;
            const replyTo = raw.replyTo as Record<string, unknown> | null;
            const entities = (raw.entities as unknown[]) ?? [];
            const text = (raw.message as string) ?? "";

            comments.push({
                id: raw.id,
                date: raw.date ? new Date((raw.date as number) * 1000).toISOString() : null,
                text,
                senderId: senderId ? Number(senderId) : null,
                senderName,
                replyToMsgId: replyTo?.replyToMsgId ?? null,
                hasMedia: !!(raw.media),
                mediaType: getMediaType(raw.media),
                links: extractLinks(text, entities),
                editDate: raw.editDate ? new Date((raw.editDate as number) * 1000).toISOString() : null,
            });
        }

        if (batch.length < batchLimit) break;

        const last = batch[batch.length - 1] as Record<string, unknown>;
        offsetId = (last.id as number) ?? 0;
        offsetDate = (last.date as number) ?? 0;
        await sleep(800);
    }

    console.log("SUCCESS:", JSON.stringify({
        count: comments.length,
        totalComments,
        channel: `@${username}`,
        postId: msgId,
        postUrl: `https://t.me/${username}/${msgId}`,
        discussionGroup: discussionGroupUsername ? `@${discussionGroupUsername}` : null,
        comments,
    }));
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

const args = process.argv.slice(2);
const operation = args[0] ?? "help";

if (operation === "help") {
    console.log("SUCCESS:", JSON.stringify({
        operations: [
            "search-hashtag <hashtag> [limit=50]",
            "search-query <query> [limit=50]",
            "search-channel <@channel> <query> [limit=50]",
            "search-global <query> [limit=50]",
            "check-quota [query]",
            "get-posts <@channel> <id1,id2,...>",
            "get-comments <@channel> <msg_id> [limit=50]",
        ],
        note: "Use search-hashtag for broad public discovery and search-query for full-text search across already joined chats/channels",
    }));
    process.exit(0);
}

// Connect to Telegram
const client = new TelegramClient(
    new StringSession(TG_SESSION),
    TG_API_ID,
    TG_API_HASH,
    {
        connectionRetries: 5,
        useWSS: false,
    }
);

try {
    await client.connect();

    switch (operation) {
        case "check-quota": {
            const query = args[1];
            await opCheckQuota(client, query);
            break;
        }

        case "search-hashtag": {
            const hashtag = args[1];
            if (!hashtag) {
                console.log("ERROR: 400 - Usage: search-hashtag <hashtag> [limit]");
                process.exit(1);
            }
            const limit = args[2] ? Math.min(parseInt(args[2], 10), 500) : 50;
            await opSearchHashtag(client, hashtag, limit);
            break;
        }

        case "search-query": {
            const query = args[1];
            if (!query) {
                console.log("ERROR: 400 - Usage: search-query <query> [limit]");
                process.exit(1);
            }
            const limit = args[2] ? Math.min(parseInt(args[2], 10), 500) : 50;
            await opSearchQuery(client, query, limit);
            break;
        }

        case "search-channel": {
            const channel = args[1];
            const query = args[2];
            if (!channel || !query) {
                console.log("ERROR: 400 - Usage: search-channel <@channel> <query> [limit]");
                process.exit(1);
            }
            const limit = args[3] ? Math.min(parseInt(args[3], 10), 1000) : 50;
            await opSearchChannel(client, channel, query, limit);
            break;
        }

        case "search-global": {
            const query = args[1];
            if (!query) {
                console.log("ERROR: 400 - Usage: search-global <query> [limit]");
                process.exit(1);
            }
            const limit = args[2] ? Math.min(parseInt(args[2], 10), 500) : 50;
            await opSearchGlobal(client, query, limit);
            break;
        }

        case "get-posts": {
            const channel = args[1];
            const idsRaw = args[2];
            if (!channel || !idsRaw) {
                console.log("ERROR: 400 - Usage: get-posts <@channel> <id1,id2,...>");
                process.exit(1);
            }
            const ids = idsRaw.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
            if (ids.length === 0) {
                console.log("ERROR: 400 - No valid message IDs provided");
                process.exit(1);
            }
            await opGetPosts(client, channel, ids);
            break;
        }

        case "get-comments": {
            const channel = args[1];
            const msgIdRaw = args[2];
            if (!channel || !msgIdRaw) {
                console.log("ERROR: 400 - Usage: get-comments <@channel> <msg_id> [limit]");
                process.exit(1);
            }
            const msgId = parseInt(msgIdRaw, 10);
            if (isNaN(msgId)) {
                console.log("ERROR: 400 - msg_id must be a number");
                process.exit(1);
            }
            const limit = args[3] ? Math.min(parseInt(args[3], 10), 1000) : 50;
            await opGetComments(client, channel, msgId, limit);
            break;
        }

        default:
            console.log(`ERROR: 400 - Unknown operation: ${operation}. Run with 'help' to see available operations.`);
            process.exit(1);
    }
} catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);

    if (errMsg.includes("AUTH_KEY_UNREGISTERED") || errMsg.includes("SESSION_REVOKED") || errMsg.includes("USER_DEACTIVATED")) {
        console.log("ERROR: 401 - Session expired or revoked. Re-run auth.ts to get a new session string.");
    } else if (errMsg.includes("FLOOD_WAIT")) {
        const match = errMsg.match(/FLOOD_WAIT_(\d+)/);
        const sec = match ? match[1] : "unknown";
        console.log(`ERROR: flood ${sec} - Flood wait. Retry after ${sec} seconds.`);
    } else if (errMsg.includes("USERNAME_NOT_OCCUPIED") || errMsg.includes("USERNAME_INVALID")) {
        console.log("ERROR: 404 - Channel not found");
    } else if (errMsg.includes("CHANNEL_PRIVATE")) {
        console.log("ERROR: 403 - Private channel, access denied");
    } else {
        console.log(`ERROR: 500 - ${errMsg}`);
    }
    process.exit(1);
} finally {
    await client.disconnect();
}
