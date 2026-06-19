# Development Seed Accounts

These accounts are created by the database seeding script
(`backend/prisma/seed.ts`, run via `npx prisma db seed`). They exist **only for
local development and staging** — never seed them into a production database.

All accounts have `emailVerified: true` and `completedOnboarding: true`, and each
has a deterministic demo Stellar wallet address.

## Client accounts

Password (all clients): **`Client123!`**

| Username  | Email                       |
| --------- | --------------------------- |
| client1   | client1@stellarmarket.dev   |
| client2   | client2@stellarmarket.dev   |
| client3   | client3@stellarmarket.dev   |
| client4   | client4@stellarmarket.dev   |
| client5   | client5@stellarmarket.dev   |

## Freelancer accounts

Password (all freelancers): **`Freelancer123!`**

| Username      | Email                           |
| ------------- | ------------------------------- |
| freelancer1   | freelancer1@stellarmarket.dev   |
| freelancer2   | freelancer2@stellarmarket.dev   |
| freelancer3   | freelancer3@stellarmarket.dev   |
| freelancer4   | freelancer4@stellarmarket.dev   |
| freelancer5   | freelancer5@stellarmarket.dev   |
| freelancer6   | freelancer6@stellarmarket.dev   |
| freelancer7   | freelancer7@stellarmarket.dev   |
| freelancer8   | freelancer8@stellarmarket.dev   |
| freelancer9   | freelancer9@stellarmarket.dev   |
| freelancer10  | freelancer10@stellarmarket.dev  |

> Passwords satisfy the registration policy (≥8 chars, with an uppercase letter,
> a lowercase letter, and a digit) and are stored bcrypt-hashed, exactly like
> real registrations.

## What else gets seeded

| Data                | Count | Notes                                                        |
| ------------------- | ----- | ------------------------------------------------------------ |
| Users               | 15    | 5 clients + 10 freelancers (above)                           |
| Jobs                | 20    | Spread across all 7 categories, mixed statuses               |
| Applications        | 30    | Mix of PENDING / ACCEPTED / REJECTED                         |
| Escrow records      | 10    | 5 completed + 5 active (funded), backed by Transaction rows  |
| Disputes            | 5     | Mix of OPEN / IN_PROGRESS / RESOLVED                         |
| Reviews             | 10    | Two per completed job (client↔freelancer)                    |

Escrow state is represented by `Job.escrowStatus` plus `Transaction` records
(`DEPOSIT` / `RELEASE`); there is no standalone escrow table in the schema.

See the **Database Seeding** section of the [main README](../README.md) for how
to run and reset the seed.
