# Zalary — Colosseum Frontier Hackathon Submission

**Builder:** Bambam (Lagos)
**Repo:** github.com/ajanaku1/Zalary
**Demo:** [zalary.vercel.app](https://zalary.vercel.app) · local `cd app && npm install --legacy-peer-deps && npm run dev`
**Devnet program:** org registry at `FGBieAeHERm7CJxtXsicQ7NaQ4FqsDixSwmMqKhovfpH`
**Privacy:** Solana **Token-2022 Confidential Transfers** (ElGamal amounts + ZK ElGamal Proof program)

---

## The product

Zalary is confidential payroll for remote teams. Employers hold a Token-2022 confidential balance, run payroll, and transfer amounts stay **encrypted on-chain**. Recipients remain visible (native CT property). Optional mint auditor ElGamal key enables selective disclosure for tax/compliance. Employees withdraw to public balance and cash out via MoonPay.

---

## Privacy surfaces (Token-2022 CT)

1. **Key derivation + account config** — `signMessage` → ElGamal + AES keys (owner, mint); configure confidential ATA (`ConfidentialProvider`, `lib/confidential.ts`)
2. **Create CT mint** — `ConfidentialTransferMint` with auto-approve + employer auditor key
3. **Deposit + apply** — public → pending → available confidential balance (`ShieldedTreasuryPanel`)
4. **Confidential payroll transfer** — ZK proof plan per employee (`ShieldedPayrollPanel`)
5. **Employee apply / withdraw** — pending → available → public (`ShieldedInbox`)
6. **Auditor key update** — mint-level selective disclosure (`ShieldedCompliancePanel`)

---

## Stack

- Token-2022 + `@solana-program/token-2022` + `@solana/zk-sdk` (WASM)
- React 19 + Vite + TypeScript
- Phantom wallet-adapter; Privy secondary
- MoonPay off-ramp; World ID; SNS
- Helius / public devnet RPC

---

## Honest limitations

- **CT hides amounts, not recipients** — address graphs can still leak hiring patterns
- Recipients must open Zalary once to configure their confidential token account before payroll lands
- Multi-tx ZK transfer plans depend on wallet-adapter plan bridge (`lib/send-plan.ts`); heavy on devnet
- Full auditor *viewer* UI is mint-key configuration; decrypt UX for auditors is next

---

## Side tracks

- SNS Identity, SuperteamNG x Raenest (emerging-market remote payroll ICP)
