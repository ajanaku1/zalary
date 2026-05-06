# Zalary — Colosseum Frontier Hackathon Submission

**Program ID:** `FGBieAeHERm7CJxtXsicQ7NaQ4FqsDixSwmMqKhovfpH` (Solana devnet)  
**Demo:** [localhost:5173 when running locally]  
**Builder:** Bambam

---

## What it is

Zalary is a payroll protocol on Solana. Employers deposit USDC, add employees, and run payroll. The twist: salary amounts are encrypted on-chain. A block explorer can confirm a payment happened. It can't tell you how much.

The full loop: employer funds treasury in USDC → payroll runs on-chain with encrypted amounts → employee claims their salary → employee converts to local currency via MoonPay, without leaving the app. The target user is a remote worker in Nigeria, India, or Brazil getting paid by a crypto-native company.

The salary privacy problem in crypto is real. Web3 companies that want to pay in USDC face a choice between using centralized payroll services (which defeats the point) or accepting that their entire payroll structure is public knowledge. Zalary is an attempt at a third option.

---

## Technical approach

### On-chain program (Anchor / Rust)

The program lives at `programs/zalary/src/lib.rs`. Key accounts:

**Organization PDA** — `[b"org", authority.key()]`  
Stores org name, employee count, payroll count, treasury address, authority pubkey.

**Employee PDA** — `[b"employee", org_pda, wallet]`  
Stores the employee's wallet, encrypted salary (64-byte blob), World ID verification status, and last paid timestamp.

**Treasury** — a USDC token account initialized as a PDA of the org. Employer funds it; payroll pulls from it; employees can verify the balance.

**PayrollRun** — `[b"payroll", org_pda, payroll_count_le_bytes]`  
Immutable log of each run: who initiated it, how many employees, total amount, timestamp.

### Salary privacy

The on-chain zUSDC mint (`AY6ZDfcEqzRKmjk4SJ6s5WUtozYGmgBmHds8M5JhxmnD`) is a Token-2022 mint with the `ConfidentialTransferMint` extension enabled (auto-approve mode). Treasury and employee ATAs are Token-2022 ATAs ready to participate in confidential transfers, where balances are stored as ElGamal commitments and transfer amounts are proven via ZK range proofs.

Current transfers use `TransferChecked` (Token-2022's standard transfer) — the plumbing is in place but ZK transfers are pending. `app/src/lib/salary_crypto.ts` carries an AES blob on the Employee PDA as a structural placeholder so the data model matches the production swap-in.

### Identity verification

The `verify_world_id` instruction takes a 32-byte nullifier hash from a World ID proof and stores it on the Employee PDA. The `claim_funds` instruction can gate on `world_id_verified`. The employee portal uses IDKit v4 (`@worldcoin/idkit`) with `deviceLegacy` preset.

### Frontend

React + Vite + TypeScript. Two separate flows:

**Employer** (`/employer`)
- Onboarding: 6-step flow to create org, fund treasury, and add employees. Each step fires the corresponding Anchor instruction.
- Dashboard: reads on-chain employee accounts via `program.account.employee.all([memcmp filter])`, shows live treasury balance from `connection.getTokenAccountBalance`.
- PayrollPanel: loops through employees, calls `run_payroll` per employee.
- EmployeeDetail: set and encrypt salary, calls `update_salary` on-chain.

**Employee** (`/employee`)
- Balance card reads the employee's USDC ATA via `connection.getTokenAccountBalance`.
- Claim button calls `claim_funds`, refreshes balance after.
- World ID widget opens on "Verify Identity" click, stores nullifier on-chain on success.
- MoonPay sell widget for fiat conversion.

Auth: Phantom wallet via `@solana/wallet-adapter` for on-chain signers; Privy for employees who don't have a self-custody wallet yet.

---

## Sponsor integrations

**Token-2022 ConfidentialTransfer** — zUSDC mint enabled with the extension (auto-approve). Treasury and employee ATAs are Token-2022 accounts. Migration to ZK-proven `ConfidentialTransfer::Transfer` is the next sprint; the on-chain primitive is configured.

**World ID** — `verify_world_id` instruction + IDKit v4 frontend widget. Nullifier hash stored on-chain to prevent double-verification.

**Privy** — employee auth via social login. Employees without a wallet can sign in with email/Google and connect a wallet afterward.

**MoonPay** — sell widget in the employee portal for converting USDC salary to local currency.

**Phantom** — primary wallet for both employer and employee on-chain signing.

**Solana** — the L1. Sub-cent fees per payroll transfer. ~400ms finality.

---

## What's live on devnet

- Org creation, treasury funding, employee add — all execute real Anchor instructions
- `run_payroll` transfers USDC from the org treasury to employee ATAs
- `claim_funds` wired in the employee portal (reads live USDC balance, calls instruction)
- `update_salary` fires from EmployeeDetail when salary is changed
- `verify_world_id` fires on World ID success callback
- On-chain employee accounts load into the Dashboard (memcmp filter on org PDA)
- Treasury balance reads from the token account in real time

---

## Stuff that's stubbed

**ZK-proven confidential transfers** — the mint is enabled with `ConfidentialTransferMint` and accounts are ready, but the actual transfers we send are still `TransferChecked` (amounts visible). Wiring `ConfidentialTransfer::Transfer` requires ZK proof generation in the browser via `@solana/zk-token-sdk`; that's the next migration step. The data model already matches.

**World ID claim gating** — `verify_world_id` stores the proof but the `claim_funds` instruction doesn't require `world_id_verified == true` in the demo build. Easy to add as a constraint check.

**Scheduled payroll** — the PayrollRun account logs when each run happened but there's no on-chain cron. Real scheduling would need a keeper or Clockwork-style trigger.

---

## Running it

```bash
cd app && npm install && npm run dev
```

Needs:
- Phantom wallet on devnet
- Devnet SOL (airdrop 2 SOL to start)
- Devnet USDC from spl-token-faucet.com

Go to `localhost:5173`. Hit "I'm an Employer", complete the onboarding, fund the treasury, then open a second browser tab as `/employee` and connect a different wallet to see the employee side.

---

## Repository

`/Users/mac/Vibecoding/Zalary`

Program source: `programs/zalary/src/lib.rs`  
Frontend: `app/src/`  
Anchor config: `Anchor.toml`
