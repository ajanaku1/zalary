# Zalary — Colosseum Frontier Hackathon Submission

**Builder:** Bambam (Lagos)
**Repo:** github.com/ajanaku1/Zalary
**Demo:** runs at `localhost:5173` after `cd app && npm install && npm run dev`. Vercel build available at zalary.vercel.app.
**Devnet program:** org registry at `FGBieAeHERm7CJxtXsicQ7NaQ4FqsDixSwmMqKhovfpH`; the privacy layer is Umbra's Arcium MXE program at `DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ`.

---

## The product

Zalary is confidential payroll for remote teams. An employer holds a shielded balance of dUSDC, runs payroll once a month, and each employee receives a sealed envelope that only they can open. Solana sees that an envelope was created. It cannot see the amount, the sender, or which employees received what.

Why this matters: I live in Lagos. I have paid contractors in USDC because Wise eats 4% and Deel doesn't cover Nigeria. The thing every founder doing this hates is that every payment is public on a block explorer. Your competitors can read your hiring strategy off the chain. Your employee's neighbour can see how much they got paid this month. Token-2022 confidential transfers shipped in 2024 and made the on-chain piece solvable in principle; Umbra's Arcium-backed mixer made it solvable in practice without rolling your own MPC. Zalary is what you build on top.

---

## Six shielded surfaces

I committed to "deep integration = 3+ surfaces" as a Frontier judging floor. Six surfaces shipped against the Umbra SDK on devnet:

1. **Shielded user registration** (`UmbraProvider.tsx`, `lib/umbra.ts`)
   On first connect, the user signs one fixed message with their main wallet. SHA-256 of that signature seeds a deterministic Ed25519 keypair which becomes their *shielded session*. The session pubkey is intentionally distinct from the main wallet, so the encrypted balance lives under an address nobody can link back to the public identity without the user revealing it. Confidential-mode registration writes the X25519 key on-chain via two Umbra instructions. The seed is cached in `sessionStorage` so refresh doesn't re-prompt, and wiped when the tab closes.

2. **Public to encrypted treasury deposit** (`ShieldedTreasuryPanel.tsx`)
   Employer claims 1,000 dUSDC from Umbra's faucet (one click, proxied through the Vite dev server because the faucet doesn't set CORS), then deposits it into their encrypted balance via `getPublicBalanceToEncryptedBalanceDirectDepositorFunction`. The deposit fires a queue tx, an Arcium MPC computation runs off-chain, and a callback tx finalizes the encrypted balance. The panel shows elapsed seconds and explains the wait, because devnet MPC takes 30 to 90 seconds.

3. **Receiver-claimable UTXO disbursement** (`ShieldedPayrollPanel.tsx`)
   For each employee, the panel creates one receiver-claimable UTXO from the employer's encrypted balance. The UTXO is addressed to the recipient's session pubkey and uses Umbra's anonymous-mode unlocker, so the on-chain link between employer and employee is broken. Before submitting, the panel validates that the recipient is X25519-registered, with an 8-second retry to handle the gap between the recipient's account-init tx and their key-registration tx. Per-row status: Queued → Checking Umbra registration → Generating ZK proof → Submitting + Arcium MPC → Disbursed.

4. **Employee inbox scan** (`ShieldedInbox.tsx`)
   The recipient's browser calls `getClaimableUtxoScannerFunction` against tree 0 from insertion 0, walks the Umbra mixer tree, and decrypts any UTXOs addressed to their session keypair. The amount is shown in plaintext to the recipient (because only they hold the master viewing key for these UTXOs); the same tx on a block explorer shows nothing. Scan results are cached in `sessionStorage` keyed by session pubkey, so re-login doesn't require re-scanning.

5. **Encrypted to public unshield** (same component)
   The recipient calls `getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction` to move dUSDC out of their encrypted balance into a public ATA. From there the existing MoonPay off-ramp converts to NGN, INR, BRL.

6. **Hierarchical compliance grant** (`ShieldedCompliancePanel.tsx`)
   The employer can issue a selective viewing grant to an auditor pubkey (tax authority, internal compliance officer, regulator). The grant is created by `getComplianceGrantIssuerFunction`, scoped to one specific auditor, revocable at any time via `getComplianceGrantRevokerFunction`. Both calls require the auditor to be Umbra-registered first, which the panel checks explicitly. The grants list persists to localStorage so the employer keeps an audit trail of who they've granted what.

---

## What works end-to-end on devnet

- Surface 1, 2, 6 fire real txs every time and finalize cleanly.
- Surface 3 issues real receiver-claimable UTXOs and the txs land on devnet. Recipient sees them in their inbox scan.
- Surface 4's scan returns the correct decrypted amount.
- Surface 5 unshields end-to-end.
- **Self-service contractor onboarding via invite link.** The employer never asks for a wallet address. After creating their org, they share `/employee/join?org=<employer-wallet>&name=<org>`. The contractor opens it, finishes their own Umbra session registration, then signs a single tx that pings the employer's wallet with a memo carrying `{org, name, sessionPubkey}`. The dashboard polls `getSignaturesForAddress` on the employer wallet every 30 seconds, decodes any join memos, and the roster fills in. No backend. No address sharing. The chain provides the channel. See `lib/payroll-invites.ts`, `pages/employee/JoinOrg.tsx`, and the dashboard polling effect.

## What's stubbed

- **Live claim in Surface 4 is disabled in the build.** Umbra's `BatchMerkleVerifier_73` template asserts deterministically on devnet for every claim attempt — single-leaf, multi-leaf, and retried. The decryption itself works; the proof-witness pipeline is the broken piece. Mainnet may not hit the same issue.
- **Auditor re-encryption viewer** is not built. Surface 6 issues and revokes grants but the `/auditor` route that would re-encrypt and decrypt granted ciphertexts is the obvious next step.
- **Privy embedded wallets** can't drive the shielded session yet. The `IUmbraSigner` bridge expects a wallet-standard adapter; Privy needs a custom signer. Phantom and Backpack work fine.

---

## Architecture decisions I had to make

**Shielded session keypair instead of signing directly with Phantom.** Umbra's `createSignerFromWalletAccount` bridge to Phantom is broken in SDK v4. It produces transactions Phantom signs but the RPC rejects with "signature did not pass verification" — a Solana Kit vs. wallet-standard mismatch in the SDK itself. Rather than fork the SDK, I derive a deterministic shielded sub-wallet from the user's main wallet via one signMessage prompt. This turned out to be the right model anyway: holding the shielded balance under an address that can't be pattern-matched to the public identity is the whole point of a privacy product.

**Funding the session is a one-click 0.05 SOL transfer from the user's main wallet.** Production would subsidize this from a Zalary treasury so users never see it. For the demo, one extra Phantom approval is acceptable.

**Token-2022 ConfidentialTransfer was scrapped in favour of Umbra.** The original plan was to use Token-2022's built-in confidential transfer extension. Umbra's Arcium MPC primitive turned out to be a better fit: it ships shielded UTXOs with selective disclosure (the compliance grant model) without requiring me to wire up ZK range proofs from scratch. The Token-2022 mint config is still in the program source as commented-out reference for the production path.

**Privacy contract held.** Per `PRIVACY.md`: no third-party indexer in the read path; every chain read fires from the user's browser scoped to wallets they control. Umbra's indexer (`utxo-indexer.api-devnet.umbraprivacy.com`) is queried, but only for the user's own merkle proofs — it can't see plaintext amounts. The previous Covalent integration was scrapped in commit `1d774b7` because routing analytics queries through a centralised indexer contradicted the rest of the privacy thesis.

---

## Stack

- **Privacy layer:** Umbra SDK v4 + Arcium MXE on Solana devnet
- **Frontend:** React 19 + Vite + TypeScript. UI primitives are deliberately small (`components/shielded/primitives.tsx`) with no new dependencies beyond what shipped with the SDK
- **Wallet:** Phantom via `@solana/wallet-adapter-react`; Privy as a secondary login (not yet wired into the shielded layer)
- **Off-ramp:** MoonPay sell widget for NGN, INR, BRL, EUR, USD
- **Identity:** World ID via `@worldcoin/idkit` (devnet uses a mock proof, on-chain instruction stores nullifier)
- **RPC:** Helius devnet for reads; Umbra's relayer (`relayer.api-devnet.umbraprivacy.com`) for claim submissions

---

## Running it locally

```bash
cd app
npm install --legacy-peer-deps  # SDK v4 has a peer-dep collision with web-zk-prover v2; legacy mode picks the right tree
npm run dev
```

Then in the browser:

1. Visit `localhost:5173`, click "I'm an employer", connect Phantom on devnet
2. Approve the signMessage prompt (derives your shielded session)
3. Pill in the top-right: click "Fund session (0.05 SOL)" → approve in Phantom
4. Wait for "Shielded layer: ready"
5. Treasury tab → Claim 1,000 dUSDC → Shield 500 dUSDC. Watch the encrypted balance fill in.
6. Compliance tab → enter any auditor wallet that has gone through the same setup → Issue grant
7. For shielded payroll: open `localhost:5173/employee` in an incognito window, connect a different Phantom, get a green pill, copy the session pubkey. Back in the employer window, add that as an employee with a salary. Run shielded payroll.

The shielded session keypair is recoverable from your main wallet's signature, so disconnecting and reconnecting later still gives you access to the same encrypted balance.

---

## Side tracks I'm submitting to

- **Umbra ($10K).** Six-surface deep integration on Umbra's SDK; primary track.
- **SNS Identity ($5K).** Three SNS surfaces shipped (forward resolution, favorite-domain reverse via `WalletName.tsx`, SNS Records v2 picture/twitter/email).
- **SuperteamNG x Raenest ($10K USDG).** Regional, Lagos contractor ICP. Same product, framed for emerging-market remote payroll.

---

## What I'd build next

Three weeks to mainnet. The order of operations:

1. Fix the BatchMerkleVerifier assertion so live claim ships. Either by waiting for Umbra mainnet (devnet may not be representative) or by getting access to the SDK source to debug the leaf-hash / Merkle-path mismatch directly.
2. Build the auditor re-encryption viewer at `/auditor`. The SDK has `getSharedCiphertextReencryptorForUserGrantFunction` ready; it just needs the UI.
3. Bridge Privy embedded wallets into the shielded session so email-only employees can receive shielded payroll without installing Phantom.
4. Wire ConfidentialTransfer auditor keys for the off-ramp partner who needs a fiat-amount audit trail. This is the "tax authority sees totals, nobody sees individual payments" pattern.
5. First five paid pilots from Superteam Nigeria and India. Real payroll, mainnet, real money.
