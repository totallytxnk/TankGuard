# TankGuard

**High-performance defensive Discord security bot**

TankGuard is a lightweight, production-oriented Discord moderation bot written in pure JavaScript (ES Modules). It focuses on intercepting rapid spam, raid bursts, and token-bot activity *before* they reach heavier gateway logic, using a Redis-backed token-bucket rate limiter, native Discord timeouts, and fast regex link filtering.

---

## Features

- **Redis Token-Bucket Rate Limiter** – 3-second fixed window, atomic `INCR` + `PEXPIRE`, key format `tankguard:user:<id>:msg_count`
- **Native Discord Timeouts** – Single-roundtrip `guildMember.timeout()` with full permission & hierarchy checks
- **Link / Invite Filter** – Zero-I/O regex scanner for HTTP(S) URLs, Discord invites, and common shorteners
- **Structured Discord Logging** – Rich shield-themed embeds showing rule matched, account age, join date, and message snippet
- **Fail-open Design** – Redis or Discord API failures never crash the process
- **Graceful Shutdown** – Clean Redis disconnect and client destruction on `SIGINT` / `SIGTERM`
- **Portfolio-ready Structure** – Clean modular layout, JSDoc, environment-driven config

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Discord Gateway                       │
└─────────────────────────────┬───────────────────────────────┘
                              │ messageCreate
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  src/handlers/messageHandler.js              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Rate Limiter │→ │ Link Filter  │→ │ Quarantine + Log │  │
│  │  (Redis)     │  │  (regex)     │  │ (timeout/embed)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ioredis / Redis      pure JS match        Discord API
                                               (timeout +
                                                log channel)
```

**Directory layout**

```
TankGuard/
├── .env.example
├── package.json
├── README.md
└── src/
    ├── index.js                 # Bootstrap & client lifecycle
    ├── config/
    │   └── index.js             # Environment config + validation
    ├── handlers/
    │   ├── messageHandler.js    # Main processing pipeline
    │   └── messageCreate.js     # Backwards-compatible re-export
    ├── services/
    │   ├── redis.js             # ioredis client
    │   ├── rateLimiter.js       # Token-bucket + middleware
    │   ├── quarantineService.js # Native timeout logic
    │   └── loggerService.js     # Discord embed logging
    └── utils/
        ├── logger.js            # Console / structured logger
        └── linkFilter.js        # Regex link & invite scanner
```

---

## Tech Stack

| Component       | Technology              |
|-----------------|-------------------------|
| Runtime         | Node.js ≥ 18            |
| Discord Library | discord.js v14          |
| Rate Limiting   | Redis + ioredis         |
| Module System   | ES Modules (`"type": "module"`) |
| Config          | dotenv                  |

---

## Prerequisites

- Node.js 18 or later
- A Discord bot application with the following privileged intents enabled:
  - Message Content Intent
  - Server Members Intent (recommended)
- A running Redis instance (local or remote)
- Bot permissions in target guilds:
  - `Moderate Members` (for timeouts)
  - `Manage Messages` (for deletions)
  - `View Channels` / `Send Messages` (for the log channel)

---

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/tankguard.git
cd tankguard

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

---

## Environment Configuration

Edit `.env` with your values:

```env
# Required
DISCORD_TOKEN=your_bot_token_here
REDIS_URL=redis://localhost:6379

# Rate limiter (defaults shown)
RATE_LIMIT_MAX=5
RATE_LIMIT_WINDOW_MS=3000

# Optional – Discord channel ID for rich moderation embeds
LOG_CHANNEL_ID=123456789012345678
```

| Variable               | Description                                      | Default                  |
|------------------------|--------------------------------------------------|--------------------------|
| `DISCORD_TOKEN`        | Bot token                                        | — (required)             |
| `REDIS_URL`            | Redis connection string                          | `redis://localhost:6379` |
| `RATE_LIMIT_MAX`       | Max messages allowed inside the window           | `5`                      |
| `RATE_LIMIT_WINDOW_MS` | Window size in milliseconds                      | `3000`                   |
| `LOG_CHANNEL_ID`       | Channel for TankGuard embeds (leave empty to disable) | —                   |

---

## Running Locally

```bash
# Production-style start
npm start

# Development with auto-reload (Node 18+)
npm run dev
```

On successful boot you should see:

```
[TankGuard] INFO Connecting to Redis…
[TankGuard] INFO Redis connected
[TankGuard] INFO Redis ready
[TankGuard] INFO Logging in to Discord…
[TankGuard] INFO Logged in as TankGuard#1234
```

---

## How It Works

1. **Rate Limit Gate** – Every non-bot guild message is checked against a Redis key `tankguard:user:<id>:msg_count`. Exceeding the configured threshold within the 3-second window triggers moderation.
2. **Link Scan** – Content is scanned with a small set of regexes for URLs, Discord invites, and common shorteners.
3. **Quarantine** – When a rule is matched, TankGuard attempts a native 10-minute timeout (single API call) after verifying `MODERATE_MEMBERS` and role hierarchy.
4. **Logging** – A rich embed is fire-and-forget sent to `LOG_CHANNEL_ID` containing the rule matched, account age, join date, and a truncated message snippet.
5. **Fail-open** – Redis or Discord API errors are logged and the message is allowed through so the bot remains available.

---

## Development Notes

- All Discord API side-effects are wrapped in try/catch; unhandled rejections are logged but never crash the process.
- The rate limiter fails open on Redis errors.
- Logging is completely optional – omit `LOG_CHANNEL_ID` to disable embeds.
- The codebase is pure ESM; no CommonJS `require`.

---

## License

MIT

---

## Disclaimer

TankGuard is a defensive tool. Always test timeouts and deletions in a private server first. Ensure your bot’s role is placed high enough in the hierarchy to moderate the members you intend to protect against.
