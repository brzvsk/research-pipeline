#!/usr/bin/env bun
/**
 * Telegram MTProto Auth Setup
 *
 * Run once interactively to authenticate and generate a session string.
 * The session string is then stored in scripts/.env as TG_SESSION.
 *
 * Usage:
 *   bun run auth.ts
 *
 * Environment (set in .env or shell before running):
 *   TG_API_ID   — from my.telegram.org
 *   TG_API_HASH — from my.telegram.org
 */

import { readFileSync } from "fs";
import { join } from "path";
import * as readline from "readline";

// Load .env
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
        // ignore
    }
}

loadEnv();

const TG_API_ID = Number(process.env.TG_API_ID);
const TG_API_HASH = process.env.TG_API_HASH ?? "";

if (!TG_API_ID || !TG_API_HASH) {
    console.error("Error: TG_API_ID and TG_API_HASH must be set in scripts/.env");
    console.error("Get them from https://my.telegram.org → API development tools");
    process.exit(1);
}

const { TelegramClient } = await import("telegram");
const { StringSession } = await import("telegram/sessions/index.js");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question: string): Promise<string> =>
    new Promise(resolve => rl.question(question, resolve));

console.log("\n=== Telegram MTProto Auth Setup ===\n");
console.log("This will authenticate your Telegram account and generate a session string.");
console.log("The session string allows scripts to act on behalf of your account.\n");

const client = new TelegramClient(
    new StringSession(""),
    TG_API_ID,
    TG_API_HASH,
    { connectionRetries: 5 }
);

await client.start({
    phoneNumber: async () => {
        return await ask("Phone number (international format, e.g. +79001234567): ");
    },
    phoneCode: async () => {
        return await ask("Verification code (sent to Telegram): ");
    },
    password: async () => {
        return await ask("Two-factor password (leave empty if none): ");
    },
    onError: (err: Error) => {
        console.error("Auth error:", err.message);
    },
});

const sessionString = client.session.save() as unknown as string;

console.log("\n✓ Authentication successful!\n");
console.log("─".repeat(60));
console.log("Add this to your scripts/.env file:\n");
console.log(`TG_SESSION=${sessionString}`);
console.log("─".repeat(60));
console.log("\nKeep this session string secret — it grants full access to your Telegram account.");

rl.close();
await client.disconnect();
