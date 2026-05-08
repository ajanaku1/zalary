# Devnet seed script

Populates a Zalary org on Solana devnet so every screen in the app has real data to render.

## What it does

- Creates an organization (or reuses one if the authority already owns one)
- Seeds 6 employees with deterministic keypairs and per-role salary defaults
- Funds the treasury with 5,000 USDC if the authority has the balance
- Runs 3 payroll cycles across all employees

Every step is idempotent. Re-running the script picks up where it left off.

## Setup

You need a Solana keypair funded with at least 0.5 SOL on devnet, and ideally 5,000 test USDC at the configured Token-2022 mint.

```bash
# Devnet SOL (free)
solana airdrop 2 --url devnet

# Test USDC mint used by Zalary on devnet:
#   AY6ZDfcEqzRKmjk4SJ6s5WUtozYGmgBmHds8M5JhxmnD
# Mint to your authority via spl-token if you have authority over it,
# or skip — the script will warn and continue without funding.
```

## Run

```bash
KEYPAIR_PATH=~/.config/solana/id.json \
RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY \
ORG_NAME="Acme Remote" \
npm run seed-devnet
```

Defaults:
- `KEYPAIR_PATH` → `~/.config/solana/id.json`
- `RPC_URL` → `https://api.devnet.solana.com` (slow; prefer Helius)
- `ORG_NAME` → `Acme Remote`

## Output

The script prints a summary at the end with the org PDA and seeded employee pubkeys. Visit the live app's Insights tab and the cadence chart, funder count, and fees should all populate.
