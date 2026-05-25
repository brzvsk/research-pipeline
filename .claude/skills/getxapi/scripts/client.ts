#!/usr/bin/env bun
/**
 * GetXAPI Client — Search and fetch Twitter/X data
 * Usage: bun run client.ts <operation> [args...]
 *
 * Environment:
 *     GETXAPI_API_KEY: Your GetXAPI token (set in scripts/.env file)
 *
 * Get a free API key: https://www.getxapi.com
 * Docs: https://docs.getxapi.com
 */

import { readFileSync } from "fs";
import { join } from "path";

// Load .env file if exists
function loadEnv(): void {
    try {
        const envPath = join(import.meta.dir, ".env");
        const envContent = readFileSync(envPath, "utf-8");
        for (const line of envContent.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const [key, ...valueParts] = trimmed.split("=");
            const value = valueParts.join("=").trim();
            if (key && value && !process.env[key]) {
                process.env[key.trim()] = value;
            }
        }
    } catch {
        // .env file not found, that's ok
    }
}

loadEnv();

const args = process.argv.slice(2);
const operation = args[0] || "help";

// Environment-based secrets (from .env or system)
const apiKey = process.env.GETXAPI_API_KEY;
if (!apiKey && operation !== "help") {
    console.log("ERROR: 401 - GETXAPI_API_KEY not set. Create scripts/.env with GETXAPI_API_KEY=your-key");
    process.exit(1);
}

const BASE_URL = "https://api.getxapi.com";

interface Tweet {
    id: string;
    url: string;
    text: string;
    author: {
        userName: string;
        name: string;
        followers: number;
        isBlueVerified: boolean;
    };
    likeCount: number;
    retweetCount: number;
    replyCount: number;
    viewCount: number;
    createdAt: string;
    lang: string;
    media: unknown[];
}

interface UserProfile {
    id: string;
    name: string;
    userName: string;
    description: string;
    followers: number;
    following: number;
    statusesCount: number;
    isBlueVerified: boolean;
    createdAt: string;
    profilePicture: string;
}

interface AccountInfo {
    email: string;
    name: string;
    credits_remaining: number;
    credits_used: number;
    total_requests: number;
    created_at: string;
}

async function main() {
    switch (operation) {
        case "search":
            await searchTweets(args.slice(1));
            break;
        case "tweet":
            await getTweet(args.slice(1));
            break;
        case "user":
            await getUser(args.slice(1));
            break;
        case "account":
            await getAccount();
            break;
        case "help":
            printHelp();
            break;
        default:
            console.log(`ERROR: 400 - Unknown operation: ${operation}`);
            console.log("Run 'bun run client.ts help' for available operations.");
            process.exit(1);
    }
}

function formatTweets(tweets: Tweet[]): string {
    return tweets.map(t => {
        const media = t.media && (t.media as unknown[]).length > 0 ? " [media]" : "";
        return [
            `  @${t.author.userName} (${t.author.followers.toLocaleString()} followers)`,
            `  ${t.text.slice(0, 200)}${t.text.length > 200 ? "..." : ""}${media}`,
            `  ${t.likeCount.toLocaleString()} likes · ${t.retweetCount.toLocaleString()} RT · ${t.replyCount.toLocaleString()} replies · ${t.viewCount.toLocaleString()} views`,
            `  ${t.createdAt} · ${t.lang}`,
            `  ${t.url}`,
            "",
        ].join("\n");
    }).join("\n");
}

async function searchTweets(args: string[]): Promise<void> {
    if (args.length === 0) {
        console.log("ERROR: 400 - Missing query. Usage: client.ts search <query>");
        console.log("Examples:");
        console.log("  client.ts search AI");
        console.log("  client.ts search from:elonmusk");
        console.log("  client.ts search \"product launch\" min_faves:100");
        process.exit(1);
    }

    const query = args.join(" ");
    const product = args.includes("--top") ? "Top" : "Latest";

    try {
        const url = `${BASE_URL}/twitter/tweet/advanced_search?q=${encodeURIComponent(query)}&product=${product}`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (response.status === 429) {
            console.log("ERROR: 429 - Rate limited. Wait a minute before retrying.");
            process.exit(1);
        }
        if (response.status === 401) {
            console.log("ERROR: 401 - Invalid API key");
            process.exit(1);
        }
        if (!response.ok) {
            const text = await response.text();
            console.log(`ERROR: ${response.status} - ${text}`);
            process.exit(1);
        }

        const data = await response.json() as {
            query: string;
            tweet_count: number;
            has_more: boolean;
            next_cursor: string;
            tweets: Tweet[];
        };

        const output = {
            query: data.query,
            results: data.tweet_count,
            has_more: data.has_more,
            next_cursor: data.next_cursor ?? null,
            tweets: data.tweets.map(t => ({
                id: t.id,
                url: t.url,
                text: t.text,
                author: {
                    username: t.author.userName,
                    name: t.author.name,
                    followers: t.author.followers,
                    blue_verified: t.author.isBlueVerified,
                },
                likes: t.likeCount,
                retweets: t.retweetCount,
                replies: t.replyCount,
                views: t.viewCount,
                created_at: t.createdAt,
                lang: t.lang,
            })),
        };

        console.log("SUCCESS:", JSON.stringify(output));

        // Also print a human-readable summary
        console.log(`\n[GetXAPI] Found ${data.tweet_count} tweets for "${data.query}" (${product}):\n`);
        console.log(formatTweets(data.tweets));
        if (data.has_more) {
            console.log(`[GetXAPI] More results available. Cursor: ${data.next_cursor}`);
            console.log(`[GetXAPI] To get next page: client.ts search-next ${data.next_cursor} "${query}"`);
        }
    } catch (err) {
        if (err instanceof Error && err.message.includes("fetch")) {
            console.log("ERROR: timeout - Network timeout. Check your connection and retry.");
        } else {
            console.log(`ERROR: 500 - ${err instanceof Error ? err.message : String(err)}`);
        }
        process.exit(1);
    }
}

async function getTweet(args: string[]): Promise<void> {
    if (args.length === 0) {
        console.log("ERROR: 400 - Missing tweet ID or URL. Usage: client.ts tweet <id-or-url>");
        process.exit(1);
    }

    let tweetId = args[0];
    // Extract ID from URL if full URL is provided
    const urlMatch = tweetId.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
    if (urlMatch) {
        tweetId = urlMatch[1];
    }

    try {
        const response = await fetch(`${BASE_URL}/twitter/tweet/detail?id=${tweetId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (response.status === 429) {
            console.log("ERROR: 429 - Rate limited. Wait a minute before retrying.");
            process.exit(1);
        }
        if (response.status === 401) {
            console.log("ERROR: 401 - Invalid API key");
            process.exit(1);
        }
        if (response.status === 404) {
            console.log("ERROR: 404 - Tweet not found");
            process.exit(1);
        }
        if (!response.ok) {
            const text = await response.text();
            console.log(`ERROR: ${response.status} - ${text}`);
            process.exit(1);
        }

        const data = await response.json() as { status: string; data: Tweet };

        const output = {
            id: data.data.id,
            url: data.data.url,
            text: data.data.text,
            author: {
                username: data.data.author.userName,
                name: data.data.author.name,
                followers: data.data.author.followers,
                blue_verified: data.data.author.isBlueVerified,
            },
            likes: data.data.likeCount,
            retweets: data.data.retweetCount,
            replies: data.data.replyCount,
            views: data.data.viewCount,
            created_at: data.data.createdAt,
            lang: data.data.lang,
        };

        console.log("SUCCESS:", JSON.stringify(output));

        const t = data.data;
        console.log(`\n[GetXAPI] Tweet by @${t.author.userName}:\n`);
        console.log(formatTweets([t]));
    } catch (err) {
        if (err instanceof Error && err.message.includes("fetch")) {
            console.log("ERROR: timeout - Network timeout. Check your connection and retry.");
        } else {
            console.log(`ERROR: 500 - ${err instanceof Error ? err.message : String(err)}`);
        }
        process.exit(1);
    }
}

async function getUser(args: string[]): Promise<void> {
    if (args.length === 0) {
        console.log("ERROR: 400 - Missing username. Usage: client.ts user <@username>");
        process.exit(1);
    }

    let username = args[0].replace(/^@/, "");
    const userIdMatch = username.match(/^\d+$/);
    const isNumeric = userIdMatch !== null;

    try {
        const url = isNumeric
            ? `${BASE_URL}/twitter/user/info/id?id=${username}`
            : `${BASE_URL}/twitter/user/info?userName=${username}`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (response.status === 429) {
            console.log("ERROR: 429 - Rate limited. Wait a minute before retrying.");
            process.exit(1);
        }
        if (response.status === 401) {
            console.log("ERROR: 401 - Invalid API key");
            process.exit(1);
        }
        if (response.status === 404) {
            console.log(`ERROR: 404 - User @${username} not found`);
            process.exit(1);
        }
        if (!response.ok) {
            const text = await response.text();
            console.log(`ERROR: ${response.status} - ${text}`);
            process.exit(1);
        }

        const data = await response.json() as { status: string; data: UserProfile };

        const u = data.data;
        const output = {
            id: u.id,
            name: u.name,
            username: u.userName,
            bio: u.description,
            followers: u.followers,
            following: u.following,
            tweets: u.statusesCount,
            blue_verified: u.isBlueVerified,
            created_at: u.createdAt,
            avatar: u.profilePicture,
        };

        console.log("SUCCESS:", JSON.stringify(output));

        const badge = u.isBlueVerified ? " [Blue]" : "";
        console.log(`\n[GetXAPI] @${u.userName}${badge}:\n`);
        console.log(`  Name: ${u.name}`);
        console.log(`  Bio: ${u.description || "(none)"}`);
        console.log(`  Followers: ${u.followers.toLocaleString()} · Following: ${u.following.toLocaleString()} · Tweets: ${u.statusesCount.toLocaleString()}`);
        console.log(`  Account created: ${u.createdAt}`);
        console.log(`  https://x.com/${u.userName}`);
    } catch (err) {
        if (err instanceof Error && err.message.includes("fetch")) {
            console.log("ERROR: timeout - Network timeout. Check your connection and retry.");
        } else {
            console.log(`ERROR: 500 - ${err instanceof Error ? err.message : String(err)}`);
        }
        process.exit(1);
    }
}

async function getAccount(): Promise<void> {
    try {
        const response = await fetch(`${BASE_URL}/account/me`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (response.status === 429) {
            console.log("ERROR: 429 - Rate limited. Wait a minute before retrying.");
            process.exit(1);
        }
        if (response.status === 401) {
            console.log("ERROR: 401 - Invalid API key");
            process.exit(1);
        }
        if (!response.ok) {
            const text = await response.text();
            console.log(`ERROR: ${response.status} - ${text}`);
            process.exit(1);
        }

        const data = await response.json() as AccountInfo;

        console.log("SUCCESS:", JSON.stringify(data));

        console.log(`\n[GetXAPI] Account:`);
        console.log(`  Email: ${data.email}`);
        console.log(`  Credits remaining: $${data.credits_remaining.toFixed(3)}`);
        console.log(`  Total spent: $${data.credits_used.toFixed(3)}`);
        console.log(`  Total requests: ${data.total_requests.toLocaleString()}`);
        console.log(`  Created: ${data.created_at}`);
    } catch (err) {
        if (err instanceof Error && err.message.includes("fetch")) {
            console.log("ERROR: timeout - Network timeout. Check your connection and retry.");
        } else {
            console.log(`ERROR: 500 - ${err instanceof Error ? err.message : String(err)}`);
        }
        process.exit(1);
    }
}

function printHelp(): void {
    console.log("SUCCESS:", JSON.stringify({
        operations: ["search", "tweet", "user", "account", "help"],
        usage: "bun run client.ts <operation> [args...]",
        examples: {
            search: [
                'bun run client.ts search AI',
                'bun run client.ts search "product launch"',
                'bun run client.ts search from:elonmusk',
                'bun run client.ts search "#crypto min_faves:100',
                'bun run client.ts search "AI from:elonmusk since:2024-01-01"',
            ],
            tweet: [
                'bun run client.ts tweet 2019264360682778716',
                'bun run client.ts tweet https://x.com/elonmusk/status/2019264360682778716',
            ],
            user: [
                'bun run client.ts user elonmusk',
                'bun run client.ts user @OpenAI',
            ],
            account: ["bun run client.ts account"],
        },
        pricing: {
            search: "$0.001 per call (~20 tweets)",
            tweet: "$0.001 per call",
            user: "$0.001 per call",
            account: "FREE",
        },
    }));
}

main();
