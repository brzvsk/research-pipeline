#!/usr/bin/env bun
/**
 * Yandex Search API Client
 * Usage: bun run client.ts <operation> <args>
 *
 * Environment:
 *     YANDEX_SEARCH_API_KEY: Your Yandex API key secret (set in scripts/.env file)
 *     YANDEX_SEARCH_FOLDER_ID: Folder ID where the API key was created
 *
 * Confirmed web search REST endpoint:
 *     https://searchapi.api.cloud.yandex.net/v2/web/search
 *
 * Confirmed auth header:
 *     Authorization: Api-Key <API-key-secret>
 *
 * Note:
 *     The API key identifier shown in Yandex AI Studio is not used in the REST request header.
 *     Use the secret key value as the Api-Key credential.
 */

import { readFileSync } from "fs";
import { join } from "path";

const API_BASE_URL = "https://searchapi.api.cloud.yandex.net/v2/web/search";
const API_GEN_URL = "https://searchapi.api.cloud.yandex.net/v2/gen/search";

function loadEnv(): void {
    try {
        const envPath = join(import.meta.dir, ".env");
        const envContent = readFileSync(envPath, "utf-8");

        for (const rawLine of envContent.split("\n")) {
            const line = rawLine.trim();
            if (!line || line.startsWith("#")) {
                continue;
            }

            const [key, ...valueParts] = line.split("=");
            const value = valueParts.join("=").trim();
            if (key && value && !process.env[key.trim()]) {
                process.env[key.trim()] = value.replace(/^['\"]|['\"]$/g, "");
            }
        }
    } catch {
        // .env file not found, that is ok
    }
}

loadEnv();

const args = process.argv.slice(2);
const operation = args[0] || "help";

const apiKey = process.env.YANDEX_SEARCH_API_KEY;
const folderId = process.env.YANDEX_SEARCH_FOLDER_ID;

if (!apiKey) {
    console.log("ERROR: 401 - YANDEX_SEARCH_API_KEY not set. Create scripts/.env with YANDEX_SEARCH_API_KEY=<api-key-secret>");
    process.exit(1);
}

if (!folderId) {
    console.log("ERROR: 401 - YANDEX_SEARCH_FOLDER_ID not set. Add the folder ID where the API key was created to scripts/.env");
    process.exit(1);
}

const apiBaseUrl = API_BASE_URL;

type SearchRequest = {
    query: string;
    type: "web" | "image" | "generative";
    limit?: number;
    region?: string;
    device?: string;
    format?: string;
};

async function main() {
    try {
        switch (operation) {
            case "web-search":
                await runWebSearch(args.slice(1));
                break;
            case "image-search":
                await runImageSearch(args.slice(1));
                break;
            case "generative-answer":
                await runGenerativeAnswer(args.slice(1));
                break;
            case "help":
                console.log("SUCCESS:", JSON.stringify({
                    operations: ["web-search", "image-search", "generative-answer", "help"],
                    usage: "bun run client.ts <operation> <query> [--limit N] [--region CODE] [--device desktop|mobile] [--format html|xml]",
                    endpoint: API_BASE_URL,
                    authHeader: "Authorization: Api-Key <API-key-secret>",
                    requiredEnv: ["YANDEX_SEARCH_API_KEY", "YANDEX_SEARCH_FOLDER_ID"],
                    optionalEnv: []
                }));
                break;
            default:
                console.log(`ERROR: 400 - Unknown operation: ${operation}`);
                process.exit(1);
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes("429")) {
            console.log("ERROR: 429 - Rate limited");
        } else if (errorMsg.includes("404")) {
            console.log("ERROR: 404 - Resource not found");
        } else if (errorMsg.includes("401") || errorMsg.toLowerCase().includes("auth")) {
            console.log("ERROR: 401 - Authentication failed");
        } else if (errorMsg.toLowerCase().includes("timeout")) {
            console.log("ERROR: timeout - Network timeout");
        } else {
            console.log(`ERROR: 500 - ${errorMsg}`);
        }
        process.exit(1);
    }
}

function parseSearchArgs(rawArgs: string[], type: SearchRequest["type"]): SearchRequest {
    if (rawArgs.length === 0) {
        throw new Error("400 - Missing search query");
    }

    const positional: string[] = [];
    const options: Record<string, string> = {};

    for (let index = 0; index < rawArgs.length; index += 1) {
        const token = rawArgs[index];
        if (token.startsWith("--")) {
            const key = token.slice(2);
            const value = rawArgs[index + 1];
            if (!value || value.startsWith("--")) {
                throw new Error(`400 - Missing value for --${key}`);
            }
            options[key] = value;
            index += 1;
        } else {
            positional.push(token);
        }
    }

    const query = positional.join(" ").trim();
    if (!query) {
        throw new Error("400 - Missing search query");
    }

    const limit = options.limit ? Number.parseInt(options.limit, 10) : undefined;
    if (options.limit && Number.isNaN(limit)) {
        throw new Error("400 - Invalid --limit value");
    }

    return {
        query,
        type,
        limit,
        region: options.region,
        device: options.device,
        format: options.format
    };
}

type SearchResult = {
    title: string;
    url: string;
    snippet: string;
};

function decodeEntities(str: string): string {
    return str
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

function extractTagContent(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    if (!match) return "";
    return decodeEntities(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractAllMatches(xml: string, tag: string): string[] {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
    const results: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(xml)) !== null) {
        results.push(decodeEntities(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()));
    }

    return results;
}

function parseXmlResults(xml: string, limit: number): SearchResult[] {
    const results: SearchResult[] = [];

    // Extract all <doc ...> blocks (id attribute present)
    const docRegex = /<doc[^>]*>([\s\S]*?)<\/doc>/gi;
    let match: RegExpExecArray | null;

    while ((match = docRegex.exec(xml)) !== null && results.length < limit) {
        const doc = match[1];
        const url = extractTagContent(doc, "url");
        const title = extractTagContent(doc, "title");

        // Try passage first, then headline as snippet
        const passages = extractAllMatches(doc, "passage");
        const headline = extractTagContent(doc, "headline");
        const snippet = passages.length > 0 ? passages.join(" ") : headline;

        if (url && title) {
            results.push({ title, url, snippet });
        }
    }

    return results;
}

async function requestSearch(payload: SearchRequest) {
    const limit = payload.limit ?? 10;

    const body = {
        query: {
            searchType: "SEARCH_TYPE_RU",
            queryText: payload.query
        },
        folderId,
        responseFormat: "FORMAT_XML"
    };

    const response = await fetch(apiBaseUrl, {
        method: "POST",
        headers: {
            "Authorization": `Api-Key ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        console.log(`ERROR: ${response.status} - ${errText}`);
        process.exit(1);
    }

    const data = await response.json() as { rawData?: string };

    if (!data.rawData) {
        console.log("ERROR: 500 - Response missing rawData field");
        process.exit(1);
    }

    // Decode Base64 → XML string
    const xml = Buffer.from(data.rawData, "base64").toString("utf-8");

    // Check for error inside XML
    const errorMatch = xml.match(/<error[^>]*>([\s\S]*?)<\/error>/i);
    if (errorMatch) {
        console.log(`ERROR: 500 - Yandex error: ${errorMatch[1].trim()}`);
        process.exit(1);
    }

    const results = parseXmlResults(xml, limit);

    console.log("SUCCESS:", JSON.stringify({
        query: payload.query,
        total: results.length,
        results
    }));
}

async function runWebSearch(rawArgs: string[]) {
    const payload = parseSearchArgs(rawArgs, "web");
    await requestSearch(payload);
}

async function runImageSearch(rawArgs: string[]) {
    const payload = parseSearchArgs(rawArgs, "image");
    await requestSearch(payload);
}

async function runGenerativeAnswer(rawArgs: string[]) {
    const payload = parseSearchArgs(rawArgs, "generative");

    const body = {
        messages: [
            { content: payload.query, role: "ROLE_USER" }
        ],
        folderId,
        searchType: "SEARCH_TYPE_RU"
    };

    const response = await fetch(API_GEN_URL, {
        method: "POST",
        headers: {
            "Authorization": `Api-Key ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        console.log(`ERROR: ${response.status} - ${errText}`);
        process.exit(1);
    }

    type GenResponse = {
        message?: { content?: string; role?: string };
        sources?: Array<{ url?: string; title?: string; used?: boolean }>;
        isAnswerRejected?: boolean;
        isBulletAnswer?: boolean;
        searchQueries?: Array<{ text?: string }>;
    };

    // API returns an array of result chunks
    const raw = await response.json() as GenResponse | GenResponse[];
    const data: GenResponse = Array.isArray(raw) ? (raw[raw.length - 1] ?? {}) : raw;

    if (data.isAnswerRejected) {
        console.log("ERROR: 400 - Yandex rejected the answer (content policy)");
        process.exit(1);
    }

    const answer = data.message?.content ?? "";
    const sources = (data.sources ?? [])
        .filter(s => s.used === true)
        .map(s => ({ title: s.title ?? "", url: s.url ?? "" }));

    console.log("SUCCESS:", JSON.stringify({
        query: payload.query,
        answer,
        sources
    }));
}

main();
