# Devnet seed script

Populates a Zalary org on Solana devnet so every screen in the app has real data to render.

## What it does

- Creates an organization (or reuses one if the authority already owns one)
- Seeds 6 employees with deterministic keypairs and per-role salary defaults
- Funds the treasury with 5,000 USDC if the authority has the balance
- Runs 3 payroll cycles across all employees

Every step is idempotent. Re-running the script picks up where it left off.

## Configuration

The script reads from `app/.env.local` (gitignored) on startup. Two env vars matter:

```bash
# Authority secret key — 64-byte JSON array. Required.
DEMO_AUTHORITY_KEYPAIR=[199,239,226,...]

# RPC URL. Falls back to VITE_HELIUS_RPC_URL, then public devnet.
RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
```

If you don't have `DEMO_AUTHORITY_KEYPAIR` set, the script also accepts `KEYPAIR_PATH` pointing at a Solana CLI-style JSON keypair file.

## Setup

You need a Solana keypair funded with at least 0.5 SOL on devnet, and ideally 5,000 test USDC at the configured Token-2022 mint.

```bash
# Devnet SOL (free)
solana airdrop 2 <pubkey> --url devnet

# Test USDC mint used by Zalary on devnet:
#   AY6ZDfcEqzRKmjk4SJ6s5WUtozYGmgBmHds8M5JhxmnD
# Mint to your authority via spl-token if you have authority over it.
# Without USDC, the script will warn and skip the payroll runs but still
# create the org and seed employees — enough activity for Insights cadence.
```

## Run

```bash
npm run seed-devnet
```

## Output

The script prints a summary at the end with the org PDA and seeded employee pubkeys. Visit the live app's Insights tab and the cadence chart, funder count, and fees should all populate.

## Security

`DEMO_AUTHORITY_KEYPAIR` is the secret key. Keep it in `.env.local` only. Never prefix with `VITE_` — that would bundle it into the browser. Never push it to a deploy environment.
