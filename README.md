# The Pint Crusade - GDKP Platform

A real-time GDKP (Gold Dragon Kill Points) auction platform for World of Warcraft TBC private server communities.

## Features

- **Discord Authentication** - Login with Discord OAuth2
- **Real-time Auctions** - WebSocket-powered live bidding with anti-snipe protection
- **Gold Report System** - Users report their in-game gold, admins verify and credit platform balance
- **Pot Distribution** - Automatic fair split among raid participants with configurable leader cuts
- **Raid Management** - Create TBC raids, add items, manage participants
- **Loot Import** - Import from Gargul, RCLootCouncil, or WoWhead
- **WoWhead Integration** - Automatic item data fetching (icons, stats, quality)

## How the Gold System Works

1. **User reports gold** - User submits a gold report stating how much in-game gold they have
2. **Admin reviews** - Admin verifies the report (e.g., via screenshot or in-game trade)
3. **Balance credited** - Admin approves the report and user's platform balance is updated
4. **Bidding** - User can now bid on items in raids using their platform gold balance
5. **Pot payouts** - After raid, pot is distributed to participants' platform balances

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Zustand, TanStack Query
- **Backend**: Node.js, Fastify, Socket.io, Prisma, BullMQ
- **Database**: PostgreSQL 16, Redis 7
- **Monorepo**: Turborepo, pnpm

## Development Workflow

Development is done directly against git and production. There is no local development setup.

### Prerequisites

- Git
- Access to the production Railway environment

### Workflow

1. Clone the repository:
```bash
git clone https://github.com/Jonkebronk/GDKP-module.git
cd GDKP-module
```

2. Make changes on a feature branch
3. Push to GitHub
4. Railway auto-deploys from main branch

## Railway Deployment

### Services

The platform runs on Railway with the following services:
- **PostgreSQL** - Main database
- **Redis** - Caching, sessions, job queue
- **API** - Backend service (`apps/api`)
- **Web** - Frontend service (`apps/web`)

### Environment Variables - API

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Auto-provided by Railway PostgreSQL |
| `REDIS_URL` | Auto-provided by Railway Redis |
| `DISCORD_CLIENT_ID` | From Discord Developer Portal |
| `DISCORD_CLIENT_SECRET` | From Discord Developer Portal |
| `DISCORD_CALLBACK_URL` | `https://your-api.railway.app/api/auth/discord/callback` |
| `JWT_SECRET` | Generate: `openssl rand -base64 32` |
| `API_URL` | Your Railway API URL |
| `FRONTEND_URL` | Your Railway Web URL |
| `ADMIN_DISCORD_USERNAMES` | Comma-separated admin Discord usernames |
| `GATE_PASSPHRASE` | Optional access control passphrase |

### Environment Variables - Web

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Your Railway API URL |

### Discord OAuth Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to OAuth2 → General
4. Add redirect URL: `https://your-api-url.railway.app/api/auth/discord/callback`
5. Copy Client ID and Client Secret

## Project Structure

```
├── apps/
│   ├── api/              # Backend (Fastify + Socket.io)
│   │   └── src/
│   │       ├── routes/   # API route handlers
│   │       ├── services/ # Business logic
│   │       └── lib/      # Utilities
│   └── web/              # Frontend (React + Vite)
│       └── src/
│           ├── pages/    # Page components
│           ├── components/
│           └── stores/   # Zustand stores
├── packages/
│   ├── shared/           # Shared types and utilities
│   └── prisma-client/    # Database schema and client
├── docker-compose.yml
└── turbo.json
```

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

## API Endpoints

### Authentication
- `GET /api/auth/discord` - Initiate Discord OAuth
- `GET /api/auth/discord/callback` - OAuth callback
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Gold & Wallet
- `GET /api/wallet/balance` - Get wallet balance
- `POST /api/user/gold-report` - Submit gold report (user reports in-game gold)
- `GET /api/user/transactions` - Transaction history

### Raids
- `GET /api/raids` - List raids
- `POST /api/raids` - Create raid
- `GET /api/raids/:id` - Get raid details
- `POST /api/raids/:id/join` - Join raid
- `POST /api/raids/:id/distribute` - Distribute pot

### Items
- `POST /api/items/import/gargul` - Import from Gargul export
- `POST /api/items/import/rclootcouncil` - Import from RCLootCouncil CSV
- `POST /api/items/import/wowhead` - Import from WoWhead zone page

### Admin
- `GET /api/admin/users` - List users
- `POST /api/admin/gold/adjust` - Adjust user gold balance
- `GET /api/admin/gold-reports` - Get pending gold reports
- `POST /api/admin/gold-reports/:id/approve` - Approve gold report

### WebSocket Events

**Client → Server:**
- `join:raid` - Join a raid room
- `bid:place` - Place a bid
- `chat:send` - Send chat message

**Server → Client:**
- `auction:started` - Auction started
- `bid:new` - New bid placed
- `auction:tick` - Countdown update
- `auction:ended` - Auction ended
- `chat:message` - New chat message

## Auction Mechanics

- **Duration**: 30-300 seconds (default 60)
- **Anti-snipe**: Auction extends 15 seconds if bid placed within last 15 seconds
- **Minimum increment**: Configurable per item
- **Re-auction**: Items can be re-auctioned if unsold or by winner request

## Pot Distribution

Supports multiple split types:
- **Equal split** - Even distribution among all participants
- **Custom shares** - Manual share allocation
- **Role-based** - Leader cut (0-20%) with remainder split equally

## License

Private - All rights reserved
