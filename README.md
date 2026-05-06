# Zalary

![Zalary landing page](docs/images/landing.png)

Confidential payroll for remote teams paying contractors across borders. USDC on Solana, salary amounts hidden on-chain, fiat off-ramp to local currency in the same app.

**Live demo**: [zalary.vercel.app](https://zalary.vercel.app)
**Business plan**: [BUSINESS.md](./BUSINESS.md) (ICP, pricing, channels, 12-month roadmap)
**Hackathon**: [Colosseum Frontier 2026](https://www.colosseum.org/frontier)

---

## What this is, in plain terms

Every founder I know in Lagos pays remote contractors through some mix of Binance P2P, Wise, and a Telegram DM with a wallet address. Wise eats 1.5% per leg and skips most of the corridors that matter. The crypto version works, but every payment is public on Solscan. Anyone with the treasury address can read off the full payroll, including who got a raise and when.

Stablecoin payroll in emerging markets is already happening at scale. It's just done badly. Zalary is the version where privacy is built into the rail, the off-ramp is one tap, and the founder doesn't have to teach their contractor what an ATA is.

Why now: Solana shipped Token-2022 confidential transfers in 2024. The mint-level auditor key fits the regulatory direction the industry is moving in (selective disclosure, not anonymity). The primitive landed and nobody has shipped a payroll product on top of it yet.

## Why a VC should pay attention

| | Why it matters |
|---|---|
| Real founder-market fit | I send USDC payroll to friends in Lagos every month. The pain is something I live |
| Defensible primitive | Built on Token-2022 ConfidentialTransfer. Centralized incumbents (Deel, Toku, Settlr) can't ship this without rebuilding on Solana |
| Compliance is in the design | On-chain auditor / viewing key from day one. Not retrofitted after a Tornado-style incident |
| Channel I can own | Superteam regional chapters in Nigeria, India, Brazil, Vietnam, Turkey. US-based competitors can't fake those relationships |
| Shipping speed | Anchor program upgraded twice this week. Token-2022 mint with ConfidentialTransfer extension live. Pause + auditor + close primitives all on-chain |

For pricing, take rate, unit economics and the 12-month plan to $50K MRR, see [BUSINESS.md](./BUSINESS.md).

---

## How it works

1. Employer creates an org on-chain. `create_organization` initializes the org PDA and a Token-2022 USDC treasury account
2. Employer adds employees. Each employee gets a PDA at `[b"employee", org_pda, wallet]` with their wallet and an encrypted salary blob
3. Treasury funded. Employer drops USDC into the org's treasury via `fund_treasury`. The faucet button on the onboarding screen mints test zUSDC straight to the employer's wallet
4. Payroll runs. `run_payroll` transfers from treasury to each employee's ATA and writes a `PayrollRun` log
5. Employees claim. They connect a wallet, see their balance, and call `claim_funds`
6. World ID gates claims to verified humans. The nullifier hash is stored on the employee PDA so a person can't double-claim across wallets
7. Off-ramp. After claiming, employees convert USDC to NGN, INR, BRL, KES, ARS, USD, or EUR through MoonPay. No separate exchange account

---

## On-chain primitives

| Instruction | What it does |
|---|---|
| `create_organization(name)` | Creates org PDA and Token-2022 treasury |
| `add_employee(wallet, encrypted_salary)` | Registers an employee under the org |
| `fund_treasury(amount)` | Deposits USDC into the treasury (auto-creates the funder's ATA if missing) |
| `run_payroll(amount)` | Transfers from treasury to one employee, logs a PayrollRun |
| `claim_funds(amount)` | Employee claims their allocation |
| `update_salary(new_encrypted_salary)` | Updates an employee's salary blob |
| `verify_world_id(nullifier_hash)` | Stores a World ID proof on the employee PDA |
| `withdraw_treasury(amount)` | Authority withdraws from the vault |
| `pause_organization` / `resume_organization` | On-chain kill switch. `run_payroll` rejects with `OrganizationPaused` (6009) while paused |
| `set_auditor(pubkey)` / `clear_auditor` | Designate a third-party wallet for selective-disclosure access. Stored on `OrgAuditor` PDA at `["auditor", org_pda]` |
| `close_organization` | Closes the org and treasury and returns rent to authority. Treasury must be empty first |

Deployed on Solana devnet at `FGBieAeHERm7CJxtXsicQ7NaQ4FqsDixSwmMqKhovfpH`.

---

## Tech

| Layer | What |
|---|---|
| Blockchain | Solana devnet (mainnet planned post-hackathon) |
| Smart contracts | Anchor 0.30.1 (Rust), built on `anchor_spl::token_interface` so the program transparently accepts classic SPL and Token-2022 mints |
| Privacy | Token-2022 with ConfidentialTransfer extension enabled on the mint (ZK transfer path lands next sprint) |
| Frontend | React, TypeScript, Vite |
| Wallet | Phantom via `@solana/wallet-adapter` |
| Employee onboarding | Privy social login |
| Identity | World ID (proof of personhood) |
| Off-ramp | MoonPay sell widget |
| Test token | zUSDC, Token-2022, decimals 6, mint `AY6ZDfcEqzRKmjk4SJ6s5WUtozYGmgBmHds8M5JhxmnD` |

---

## Running locally

```bash
cd app
cp .env.example .env   # fill in your keys
npm install
npm run dev
```

You need:
- Phantom on devnet
- ~2 SOL on your address: `solana airdrop 2 <your-address> --url devnet`
- App-side faucet button on the Fund Treasury onboarding step gives you 1000 test zUSDC per click

App runs at `localhost:5173`. Employer flow at `/employer`, employee at `/employee`.

Building the Anchor program locally requires the Solana toolchain (`solana-cli` + `cargo-build-sbf`).

---

## Project structure

```
Zalary/
├── programs/zalary/         Anchor program (Rust)
│   └── src/lib.rs
├── app/
│   ├── api/
│   │   └── faucet.ts        Vercel function that mints test zUSDC
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.tsx
│   │   │   ├── employer/    Dashboard, Onboarding, PayrollPanel, EmployeeDetail
│   │   │   └── employee/    Portal (balance, claim, World ID, MoonPay)
│   │   ├── lib/
│   │   │   ├── program.ts          Anchor helpers + PDA finders
│   │   │   ├── salary_crypto.ts    Salary blob encryption (placeholder)
│   │   │   └── worldid.ts          World ID config
│   │   └── hooks/useProgram.ts
│   └── .env.example
├── BUSINESS.md              ICP, pricing, unit economics, 12-month plan
├── SUBMISSION.md            Hackathon submission notes
└── Anchor.toml
```

---

## What's actually live on devnet

- Org creation, employee registration, treasury funding, payroll runs, claims, withdrawals, all execute real Anchor instructions and land on-chain
- Employee portal reads live USDC balance from the token account
- World ID verification fires `verify_world_id` and stores the proof on the employee PDA
- MoonPay sell widget on the employee portal
- Privy social login for employees who don't have a wallet yet
- Pause / resume kills payroll runs at the protocol level
- Auditor / viewing-key designation lives in its own PDA, gated to the org authority
- Close-organization auto-drains the treasury back to the authority's ATA in the same tx before closing

---

## Honest status (submission window)

- The on-chain program runs on `anchor_spl::token_interface`. zUSDC (`AY6ZDfcEqzRKmjk4SJ6s5WUtozYGmgBmHds8M5JhxmnD`) is a Token-2022 mint with `ConfidentialTransferMint` enabled in auto-approve mode. Treasury and employee ATAs are Token-2022 ATAs ready to participate in confidential balances
- Transfers themselves still use `TransferChecked`. The ZK-proven `ConfidentialTransfer::Transfer` (ElGamal-encrypted amounts, range proofs generated in the browser via `@solana/zk-token-sdk`) is the next migration step. The mint and accounts are already configured for it
- `salary_crypto.ts` is a structural placeholder, not a security boundary. The Employee PDA carries a 64-byte AES blob in the slot the production confidential balance will replace
- World ID is gated client-side in the demo flow so reviewers can test without a World App. The program-side `require!` ships with mainnet
- Auditor / viewing-key field is on-chain. The wiring to the mint's actual auditor key happens together with the ConfidentialTransfer migration

---

## License

MIT
