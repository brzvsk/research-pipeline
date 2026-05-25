# Research Pipeline

Claude Code research workspace — autonomous multi-phase pipeline for structured research.

Based on [claude-pipe](https://github.com/bluzir/claude-pipe) by bluzir.

## Setup

### Prerequisites

1. **Claude Code** — works as a Claude Code project
2. **MCP servers** — see `.mcp.json.example` for Exa configuration
3. **API keys** (see `.env.example` files in each skill's `scripts/` directory):

| Service                                     | File                                          | Required For             |
| ------------------------------------------- | --------------------------------------------- | ------------------------ |
| [Exa](https://exa.ai)                       | `.mcp.json`                                   | Web search (all queries) |
| [GetXAPI](https://getxapi.com)              | `.claude/skills/getxapi/scripts/.env`         | Twitter/X search         |
| [Yandex Search](https://yandex.cloud)       | `.claude/skills/yandex-search/scripts/.env`   | Russian locale search    |
| [Telegram MTProto](https://my.telegram.org) | `.claude/skills/telegram-search/scripts/.env` | Telegram channel search  |

### Quick Start

```bash
# Copy MCP config and fill in your Exa API key
cp .mcp.json.example .mcp.json

# Copy and configure per-skill .env files
cp .claude/skills/getxapi/scripts/.env.example .claude/skills/getxapi/scripts/.env
cp .claude/skills/yandex-search/scripts/.env.example .claude/skills/yandex-search/scripts/.env
cp .claude/skills/telegram-search/scripts/.env.example .claude/skills/telegram-search/scripts/.env

# Telegram: authenticate once
cd .claude/skills/telegram-search/scripts && bun run auth.ts
```

## Usage

| Command     | Description                                          |
| ----------- | ---------------------------------------------------- |
| `/adhoc`    | Quick fact-check research, no pipeline               |
| `/research` | Full pipeline (plan → research → synthesis → report) |
| `/setup`    | Pipeline overview and modification guides            |

## Architecture

See `.claude/skills/setup/SKILL.md` for full pipeline architecture, skill inventory, upgrade guides, and dependency graph.