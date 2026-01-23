# GDKP Platform

A real-time GDKP (Gold Dragon Kill Points) auction platform for World of Warcraft TBC private server communities.

## Overview

GDKP Platform provides a complete solution for running GDKP raids with real-time auctions, gold management, and automated pot distribution. Users authenticate via Discord and bid on raid loot using platform gold that represents their in-game currency.

## Features

### Real-Time Auctions
- WebSocket-powered live bidding with instant updates
- Anti-snipe protection (extends timer on late bids)
- Configurable auction duration (30-300 seconds)
- Minimum bid increments per item

### Multi-Instance Raids
- Create raids spanning multiple instances (e.g., Karazhan + Gruul's Lair)
- Single raid session for combined lockout runs
- Flexible instance selection from all TBC raids

### User Roles
- **Admin**: Full access to dashboard, raid management, gold administration
- **User**: Restricted access to raid selection and participation only
- **Waiting Room**: New users wait for admin approval before joining raids

### Gold System
1. User submits a gold report stating their in-game gold amount
2. Admin reviews and verifies the report (via screenshot or in-game trade)
3. Upon approval, user's platform balance is credited
4. User can bid on items using their platform gold balance
5. After raid completion, pot is distributed to participants

### Anonymous Aliases
- Users set display aliases for privacy
- Admins can view real Discord usernames
- All bids and chat show aliases to other users

### Loot Import
- Import from Gargul addon export
- Import from RCLootCouncil CSV
- Import from WoWhead zone loot tables
- Automatic WoWhead integration for item icons and quality

### Pot Distribution
- Equal split among all participants
- Custom share allocation
- Leader cut (0-20%) with remainder split equally

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Tailwind CSS, Zustand, TanStack Query |
| Backend | Node.js, Fastify, Socket.io, Prisma, BullMQ |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 |
| Monorepo | Turborepo, pnpm |

## Project Structure

```
├── apps/
│   ├── api/                 # Backend (Fastify + Socket.io)
│   │   └── src/
│   │       ├── routes/      # API route handlers
│   │       ├── services/    # Business logic
│   │       └── lib/         # Utilities
│   └── web/                 # Frontend (React + Vite)
│       └── src/
│           ├── pages/       # Page components
│           ├── components/  # Reusable UI components
│           └── stores/      # Zustand state stores
├── packages/
│   ├── shared/              # Shared types and utilities
│   └── prisma-client/       # Database schema and client
├── turbo.json               # Turborepo configuration
└── package.json             # Root monorepo config
```

## Deployment

### Railway Services

The platform runs on Railway with the following services:

| Service | Description |
|---------|-------------|
| PostgreSQL | Main database |
| Redis | Sessions, caching, job queue |
| API | Backend service (`apps/api`) |
| Web | Frontend service (`apps/web`) |

### Environment Variables

#### API Service

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (auto-provided by Railway) |
| `REDIS_URL` | Redis connection string (auto-provided by Railway) |
| `DISCORD_CLIENT_ID` | From Discord Developer Portal |
| `DISCORD_CLIENT_SECRET` | From Discord Developer Portal |
| `DISCORD_CALLBACK_URL` | `https://your-api.railway.app/api/auth/discord/callback` |
| `JWT_SECRET` | Secret key for JWT tokens (`openssl rand -base64 32`) |
| `API_URL` | Your Railway API URL |
| `FRONTEND_URL` | Your Railway Web URL |
| `ADMIN_DISCORD_IDS` | Comma-separated admin Discord user IDs |
| `GATE_PASSPHRASE` | Optional access control passphrase |

#### Web Service

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Your Railway API URL |

### Discord OAuth Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Navigate to OAuth2 → General
4. Add redirect URL: `https://your-api-url.railway.app/api/auth/discord/callback`
5. Copy Client ID and Client Secret to environment variables

## API Reference

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/discord` | GET | Initiate Discord OAuth flow |
| `/api/auth/discord/callback` | GET | OAuth callback handler |
| `/api/auth/me` | GET | Get current authenticated user |
| `/api/auth/logout` | POST | End user session |

### Gold & Wallet

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/wallet/balance` | GET | Get current gold balance |
| `/api/user/gold-report` | POST | Submit gold report for verification |
| `/api/user/transactions` | GET | Get transaction history |

### Raids

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/raids` | GET | List all raids |
| `/api/raids` | POST | Create new raid |
| `/api/raids/:id` | GET | Get raid details |
| `/api/raids/:id/join` | POST | Join a raid as participant |
| `/api/raids/:id/distribute` | POST | Distribute pot to participants |

### Items

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/items/import/gargul` | POST | Import items from Gargul export |
| `/api/items/import/rclootcouncil` | POST | Import from RCLootCouncil CSV |
| `/api/items/import/wowhead` | POST | Import from WoWhead zone page |

### Admin

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/users` | GET | List all users |
| `/api/admin/gold/adjust` | POST | Adjust user gold balance |
| `/api/admin/gold-reports` | GET | Get pending gold reports |
| `/api/admin/gold-reports/:id/approve` | POST | Approve gold report |
| `/api/admin/gold-reports/:id/reject` | POST | Reject gold report |

## WebSocket Events

### Client to Server

| Event | Description |
|-------|-------------|
| `join:raid` | Join a raid room for real-time updates |
| `bid:place` | Place a bid on active auction |
| `chat:send` | Send chat message to raid |

### Server to Client

| Event | Description |
|-------|-------------|
| `auction:started` | Auction has started for an item |
| `bid:new` | New bid placed on current auction |
| `auction:tick` | Countdown timer update |
| `auction:ended` | Auction completed |
| `chat:message` | New chat message received |

## Supported Raids (TBC)

- Karazhan
- Gruul's Lair
- Magtheridon's Lair
- Serpentshrine Cavern
- Tempest Keep: The Eye
- Mount Hyjal
- Black Temple
- Sunwell Plateau
- Zul'Aman

## Development Workflow

Development is done directly against the production Railway environment via git.

```bash
# Clone the repository
git clone https://github.com/Jonkebronk/GDKP-module.git
cd GDKP-module

# Make changes on a feature branch
git checkout -b feature/my-feature

# Push to GitHub - Railway auto-deploys from main
git push origin feature/my-feature

# Create PR and merge to main for deployment
```

## License

Private - All rights reserved
