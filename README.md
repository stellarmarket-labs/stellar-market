# StellarMarket

A decentralized freelance marketplace built on **Stellar/Soroban**, enabling trustless work agreements with escrow payments, on-chain reputation, and decentralized dispute resolution.

## Overview

StellarMarket connects freelancers and clients through a transparent, blockchain-powered platform. Smart contracts handle payment escrow, milestone tracking, and dispute arbitration — eliminating the need for centralized intermediaries.

## Architecture

```
stellar-market/
├── frontend/       # Next.js marketplace UI
├── backend/        # Express.js API server
├── contracts/      # Soroban smart contracts (Rust)
│   ├── escrow/     # Job escrow & milestone payments
│   ├── reputation/ # On-chain reputation & staking
│   └── dispute/    # Dispute arbitration system
└── docs/           # Documentation
```

## Tech Stack

| Layer               | Technology                                        |
| ------------------- | ------------------------------------------------- |
| **Frontend**        | Next.js 14, TypeScript, Tailwind CSS, Stellar SDK |
| **Backend**         | Express.js, TypeScript, PostgreSQL, Prisma ORM    |
| **Smart Contracts** | Soroban SDK, Rust                                 |
| **Blockchain**      | Stellar Network (Soroban)                         |

## Features

- **Job Marketplace** — Post, browse, and apply for freelance jobs
- **Escrow Payments** — Funds locked in smart contracts, released on milestone completion
- **Milestone Tracking** — Break jobs into milestones with individual escrow releases
- **On-Chain Reputation** — Rating system backed by stake-weighted reviews
- **Dispute Resolution** — Decentralized arbitration with voter panels
- **Messaging** — In-app communication between clients and freelancers
- **Multi-Token Support** — Pay in XLM or any Stellar asset

## Getting Started

### Prerequisites

- Node.js >= 18
- Rust & Cargo
- Soroban CLI
- PostgreSQL

### Installation

```bash
# Clone the repository
git clone https://github.com/stellarmarket-labs/stellar-market.git
cd stellar-market

# Install frontend dependencies
cd frontend && npm install

# Install backend dependencies
cd ../backend && npm install

# Build smart contracts
cd ../contracts/escrow && cargo build --release --target wasm32-unknown-unknown
```

### Development

```bash
# Start backend server
cd backend && npm run dev

# Start frontend dev server
cd frontend && npm run dev
```

### Database Seeding

Populate a local or staging database with realistic demo data (users, jobs,
applications, escrows, disputes, and reviews):

```bash
cd backend

# Apply migrations first (creates the schema)
npx prisma migrate deploy

# Seed the database (idempotent — safe to run repeatedly)
npx prisma db seed
```

The seed is **idempotent**: every record uses a fixed primary key written with
`upsert`, so running it twice produces the same row counts (no duplicates).

To wipe all existing data and reseed from scratch, pass the `--reset` flag. It
truncates every data table (`TRUNCATE ... RESTART IDENTITY CASCADE`) before
seeding:

```bash
npx prisma db seed -- --reset
```

> ⚠️ `--reset` is destructive — it deletes **all** rows in the database. Use it
> only against local or staging databases, never production.

**Seeded data summary:** 5 clients, 10 freelancers, 20 jobs (across all
categories with varied statuses), 30 applications, 10 escrow records (active +
completed), 5 disputes, and reviews on completed jobs.

Fixture login credentials are documented in
[`docs/dev-accounts.md`](docs/dev-accounts.md).

### Post-Deploy Verification

After applying backend migrations, verify persisted user review aggregates with:

```bash
cd backend && npm run prisma:verify-review-aggregates
```

The query returns only mismatches between stored `User.averageRating` / `User.reviewCount`
and values recomputed from the `Review` table. The command prints `No review aggregate
mismatches found.` when everything is consistent; otherwise it prints the mismatched users
and exits non-zero.

## API Rate Limiting

The API enforces rate limits to prevent abuse and ensure fair usage:

| Endpoint | Limit | Window | Key |
|----------|-------|--------|-----|
| `/api/*` (global) | 200 requests | 15 minutes | IP address |
| `/api/auth/*` | 10 requests | 15 minutes | IP address |
| `POST /api/jobs` | 30 requests | 1 hour | User ID (fallback: IP) |
| `POST /api/reviews` | 30 requests | 1 hour | User ID (fallback: IP) |
| `POST /api/disputes` | 30 requests | 1 hour | User ID (fallback: IP) |
| `/api/auth/forgot-password` | 3 requests | 1 hour | IP address |

When a limit is exceeded, the API returns `429 Too Many Requests` with a `Retry-After` header indicating seconds until the limit resets.

## Contributing

We welcome contributions! Please see our [Contributing Guide](docs/CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
