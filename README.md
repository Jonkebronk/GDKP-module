# GDKP Platform

A real-time GDKP (Gold Dragon Kill Points) auction platform for World of Warcraft private server communities.

## Features

- **Discord Authentication** - Login with Discord OAuth2
- **Real-time Auctions** - WebSocket-powered live bidding with anti-snipe protection
- **Wallet System** - Deposit/withdraw via PayPal, virtual gold balance
- **Pot Distribution** - Automatic fair split among raid participants
- **Raid Management** - Create raids, add items, manage participants

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Zustand, TanStack Query
- **Backend**: Node.js, Fastify, Socket.io, Prisma
- **Database**: PostgreSQL, Redis
- **Payments**: PayPal REST API

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose

### Setup

1. Clone the repository:
```bash
git clone https://github.com/Jonkebronk/GDKP-module.git
cd GDKP-module
```

2. Install dependencies:
```bash
pnpm install
```

3. Start database services:
```bash
docker-compose up -d
```

4. Copy environment file and configure:
```bash
cp .env.example .env
# Edit .env with your Discord and PayPal credentials
```

5. Run database migrations:
```bash
pnpm --filter @gdkp/prisma-client generate
pnpm --filter @gdkp/prisma-client db:push
```

6. Start development servers:
```bash
pnpm dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

## Railway Deployment

### Quick Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template)

### Manual Setup

1. Create a new Railway project

2. Add services:
   - **PostgreSQL** (Railway plugin)
   - **Redis** (Railway plugin)
   - **API** (from GitHub repo, root directory: `apps/api`)
   - **Web** (from GitHub repo, root directory: `apps/web`)

3. Configure environment variables for API service:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Auto-provided by Railway PostgreSQL |
| `REDIS_URL` | Auto-provided by Railway Redis |
| `DISCORD_CLIENT_ID` | From Discord Developer Portal |
| `DISCORD_CLIENT_SECRET` | From Discord Developer Portal |
| `DISCORD_REDIRECT_URI` | `https://your-api.railway.app/api/auth/discord/callback` |
| `PAYPAL_CLIENT_ID` | From PayPal Developer Dashboard |
| `PAYPAL_CLIENT_SECRET` | From PayPal Developer Dashboard |
| `PAYPAL_MODE` | `sandbox` or `live` |
| `PAYPAL_WEBHOOK_ID` | From PayPal Webhook settings |
| `JWT_SECRET` | Generate: `openssl rand -base64 32` |
| `API_URL` | Your Railway API URL |
| `FRONTEND_URL` | Your Railway Web URL |

4. Configure environment variables for Web service:

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Your Railway API URL |

5. Deploy both services

### Discord OAuth Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to OAuth2 → General
4. Add redirect URL: `https://your-api-url.railway.app/api/auth/discord/callback`
5. Copy Client ID and Client Secret

### PayPal Setup

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications)
2. Create a new REST API app
3. Copy Client ID and Secret
4. Set up webhooks for:
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`
   - `PAYMENT.PAYOUTS-ITEM.FAILED`

## Project Structure

```
├── apps/
│   ├── api/          # Backend (Fastify + Socket.io)
│   └── web/          # Frontend (React + Vite)
├── packages/
│   ├── shared/       # Shared types and utilities
│   └── prisma-client/# Database schema and client
├── docker-compose.yml
└── turbo.json
```

## API Endpoints

### Authentication
- `GET /api/auth/discord` - Initiate Discord OAuth
- `GET /api/auth/discord/callback` - OAuth callback
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Wallet
- `GET /api/wallet/balance` - Get wallet balance
- `POST /api/wallet/deposit` - Create PayPal deposit
- `POST /api/wallet/withdraw` - Request withdrawal

### Raids
- `GET /api/raids` - List raids
- `POST /api/raids` - Create raid
- `GET /api/raids/:id` - Get raid details
- `POST /api/raids/:id/join` - Join raid
- `POST /api/raids/:id/distribute` - Distribute pot

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

## License

Private - All rights reserved
