# Zalary

![Zalary landing page](docs/images/landing.png)

Pay your team in USDC on Solana. Salary amounts stay private on-chain. Employees cash out to local currency via MoonPay without leaving the app.

Built for the [Colosseum Frontier Hackathon 2026](https://www.colosseum.org/frontier).

---

## The problem

Paying people in crypto is public by default. Anyone with a block explorer can see exactly what you paid, when, and to whom. That's fine for a lot of things. It's not fine for salary.

Zalary runs payroll on Solana with encrypted amounts. The chain records that a transfer happened. The number inside stays between the employer and the employee.

Once an employee receives their USDC, they can cash out to local currency directly from the app via MoonPay, no exchange account required. The whole loop is: employer funds treasury in USDC, payroll runs on-chain, employee claims their salary and converts to NGN, INR, BRL, or wherever they are.

---

## How it works

1. **Employer creates an org on-chain** — calls `create_organization`, which initializes a PDA and a USDC treasury account.
2. **Employer adds employees** — each employee gets a PDA (`[b"employee", org_pda, wallet]`) with their wallet and an encrypted salary blob stored on-chain.
3. **Payroll runs** — `run_payroll` pulls from the treasury, sends USDC to the employee's ATA, and logs a `PayrollRun` account. Salary amounts are encrypted via Arcium MPC before they're written anywhere.
4. **Employee claims** — employees connect their wallet to the employee portal, check their balance, and call `claim_funds`.
5. **Identity check** — World ID verification gates payroll claims to verified humans. The nullifier hash is stored on the employee PDA to prevent double-claims.
6. **Fiat off-ramp** — after claiming, employees can convert their USDC to local currency via the MoonPay sell widget. Pick a currency (USD, EUR, NGN, INR, BRL), open MoonPay, done. No separate exchange account needed.

The salary encryption uses AES-256-GCM client-side (via `lib/arcium.ts`) and the ciphertext is what goes on-chain. The plaintext never touches the blockchain.

---

## Tech stack

| Layer | What |
|---|---|
| Blockchain | Solana (devnet) |
| Smart contracts | Anchor framework (Rust) |
| Privacy | Arcium MPC for salary encryption |
| Frontend | React + TypeScript + Vite |
| Wallet | Phantom via `@solana/wallet-adapter` |
| Auth/onboarding | Privy (social login for non-crypto employees) |
| Identity | World ID (proof of personhood) |
| Fiat off-ramp | MoonPay sell widget |
| Tokens | USDC devnet (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) |

---

## Program

Deployed on Solana devnet at:

```
FGBieAeHERm7CJxtXsicQ7NaQ4FqsDixSwmMqKhovfpH
```

Instructions:
- `create_organization(name)` — create org + treasury token account
- `add_employee(wallet, encrypted_salary)` — register employee PDA
- `fund_treasury(amount)` — deposit USDC to org vault
- `run_payroll(amount)` — transfer from treasury to employee ATA, log PayrollRun
- `claim_funds(amount)` — employee claims their allocation
- `update_salary(new_encrypted_salary)` — update salary on-chain
- `verify_world_id(nullifier_hash)` — store World ID proof, mark employee as verified
- `withdraw_treasury(amount)` — employer pulls from vault

---

## Running locally

```bash
cd app
cp .env.example .env   # fill in your keys
npm install
npm run dev
```

You'll need:
- A Phantom wallet set to devnet
- Some devnet SOL (airdrop from `solana airdrop 2 <your-address> --url devnet`)
- Devnet USDC from the faucet at spl-token-faucet.com

The app runs at `localhost:5173`. Employer flow at `/employer`, employee at `/employee`.

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
│   │   │   ├── arcium.ts   # Salary encryption (AES-256-GCM)
│   │   │   └── worldid.ts  # World ID config
│   │   └── hooks/
│   │       └── useProgram.ts
│   └── .env.example
└── Anchor.toml
```

---

## What's working on devnet

- Org creation and treasury funding
- Employee registration with encrypted salary
- Payroll execution (USDC transfers from treasury to employee ATAs)
- Employee portal with live USDC balance (reads from token account)
- World ID verification wired to the `verify_world_id` instruction
- MoonPay sell widget for fiat off-ramp
- Privy social login for non-crypto employees

---

## Known limitations

- Arcium MPC integration is currently a client-side AES-256-GCM placeholder. Full Arcium CSPL confidential token integration would require their MPC cluster on mainnet.
- World ID gating on claims is implemented in the contract but not enforced in the demo flow (so you can test without a World App).
- The `anchor build` command fails locally due to a `proc_macro2`/`anchor-syn` version conflict. The deployed binary on devnet was built in a clean environment.

---

## License

MIT
