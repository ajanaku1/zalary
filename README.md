# Zalary

![Zalary landing page](docs/images/landing.png)

Confidential payroll for remote teams paying contractors across borders. USDC on Solana, salary amounts hidden on-chain, fiat off-ramp to local currency built into the same app.

Built for the [Colosseum Frontier Hackathon 2026](https://www.colosseum.org/frontier).

---

## The problem I'm actually solving

I live in Lagos. Every founder I know who pays remote contractors does it through some combination of Binance P2P, Wise, and a Telegram DM with a wallet address. The Wise version eats 1.5% per leg and doesn't even support most of the corridors that matter. The crypto version works, but every payment is public on Solscan — anyone with the treasury address can read off the entire payroll, including who got a raise and when.

Stablecoin payroll in emerging markets is already a normal thing. It's just done badly. Zalary is the version where the privacy is built into the rail, the off-ramp is one tap, and the founder doesn't have to teach their contractor what an ATA is.

Why now: Solana shipped Token-2022 confidential transfers in 2024, and the auditor-key model fits the regulatory direction (selective disclosure, not anonymity). The primitive landed and nobody has shipped a payroll product on top of it yet.

---

## How it works

1. Employer creates an org on-chain. `create_organization` initializes a PDA and a USDC treasury account.
2. Employer adds employees. Each employee gets a PDA (`[b"employee", org_pda, wallet]`) with their wallet and an encrypted salary blob.
3. Payroll runs. `run_payroll` pulls from the treasury and sends USDC to the employee's ATA, logs a `PayrollRun` account.
4. Employee claims. They connect a wallet, see their balance, and call `claim_funds`.
5. Identity check. World ID gates payroll claims to verified humans. The nullifier hash is stored on the employee PDA so a person can't double-claim across wallets.
6. Off-ramp. After claiming, employees convert USDC to local currency through the MoonPay sell widget. NGN, INR, BRL, KES, ARS, USD, EUR. No separate exchange account.

The current build encrypts the salary blob client-side with AES-256-GCM as a structural placeholder. The Token-2022 ConfidentialTransfer migration (mint already configured for it) is the production privacy path.

---

## Tech stack

| Layer | What |
|---|---|
| Blockchain | Solana (devnet, mainnet planned post-hackathon) |
| Smart contracts | Anchor (Rust) |
| Privacy | Token-2022 with ConfidentialTransfer extension (mint live, ZK transfer path WIP) |
| Frontend | React, TypeScript, Vite |
| Wallet | Phantom via `@solana/wallet-adapter` |
| Onboarding | Privy (social login for non-crypto employees) |
| Identity | World ID (proof of personhood) |
| Off-ramp | MoonPay sell widget |
| Token | USDC devnet (`AY6ZDfcEqzRKmjk4SJ6s5WUtozYGmgBmHds8M5JhxmnD`) |

---

## Program

Deployed on Solana devnet:

```
FGBieAeHERm7CJxtXsicQ7NaQ4FqsDixSwmMqKhovfpH
```

Instructions:
- `create_organization(name)` — create org and treasury
- `add_employee(wallet, encrypted_salary)` — register employee PDA
- `fund_treasury(amount)` — deposit USDC
- `run_payroll(amount)` — transfer from treasury to employee ATA, log a PayrollRun
- `claim_funds(amount)` — employee claims their allocation
- `update_salary(new_encrypted_salary)` — update salary on-chain
- `verify_world_id(nullifier_hash)` — store proof, mark employee verified
- `withdraw_treasury(amount)` — employer pulls from vault
- `pause_organization` / `resume_organization` — on-chain payroll kill switch via `OrgPause` PDA
- `close_organization` — close org and treasury, refund rent (treasury must be empty)

---

## Running locally

```bash
cd app
cp .env.example .env   # fill in your keys
npm install
npm run dev
```

You'll need:
- Phantom wallet on devnet
- Some devnet SOL: `solana airdrop 2 <your-address> --url devnet`
- Devnet USDC from the faucet at spl-token-faucet.com

App runs at `localhost:5173`. Employer flow at `/employer`, employee at `/employee`.

---

## Project structure

```
Zalary/
├── programs/zalary/    # Anchor program (Rust)
│   └── src/lib.rs
├── app/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.tsx
│   │   │   ├── employer/   # Dashboard, Onboarding, PayrollPanel, EmployeeDetail
│   │   │   └── employee/   # Portal (balance, claim, World ID, MoonPay)
│   │   ├── lib/
│   │   │   ├── program.ts  # Anchor instruction helpers + PDA finders
│   │   │   ├── salary_crypto.ts  # Salary blob encryption (placeholder, replaced by Token-2022 ConfidentialTransfer)
│   │   │   └── worldid.ts  # World ID config
│   │   └── hooks/
│   │       └── useProgram.ts
│   └── .env.example
├── BUSINESS.md         # ICP, pricing, channels, 12-month roadmap
└── Anchor.toml
```

---

## What's working on devnet

- Org creation and treasury funding
- Employee registration with encrypted salary
- Payroll execution (USDC transfers from treasury to employee ATAs)
- Employee portal with live USDC balance read from the token account
- World ID verification wired to the `verify_world_id` instruction
- MoonPay sell widget for fiat off-ramp
- Privy social login for non-crypto employees

---

## Honest status (as of submission window)

- The on-chain program is built on `anchor_spl::token_interface`, so it accepts both classic SPL Token mints and Token-2022 mints transparently. zUSDC (`AY6ZDfcEqzRKmjk4SJ6s5WUtozYGmgBmHds8M5JhxmnD`) is a Token-2022 mint with the `ConfidentialTransferMint` extension enabled (auto-approve mode). All treasury and employee ATAs are Token-2022 ATAs.
- Current transfers use `TransferChecked` against the Token-2022 program. The actual ZK-proven `ConfidentialTransfer::Transfer` instruction (ElGamal-encrypted amounts, range proofs in the browser) is the next migration phase. Mint and accounts are already configured to support it; only the client-side proof generation and the program-side instruction switch are pending.
- The AES-256-GCM client-side blob on the Employee PDA is a structural placeholder, not a security boundary.
- World ID verification stores proofs on the employee PDA via `verify_world_id`. Demo flow gates `claim_funds` client-side; the program-side hard gate ships with mainnet.
- Pause / resume payroll is live on-chain via a separate `OrgPause` PDA. `run_payroll` rejects with `OrganizationPaused` (6009) while paused.
- Building locally requires the full Solana toolchain (`solana-cli` + `cargo-build-sbf`).

---

## Business plan

See [BUSINESS.md](./BUSINESS.md) for the ICP, pricing, channels, unit economics, and 12-month plan.

---

## License

MIT
