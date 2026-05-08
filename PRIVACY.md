# Privacy contract

Zalary's privacy pitch is simple: salary amounts live as ciphertext on-chain, viewing keys live on the user's device, and no third party in the loop ever sees plaintext.

This document is the line in the sand. Every file in the codebase that talks to a third party has to honor this table.

## What crosses the wire, what never does

| Data | Where it lives | Sent to a third-party indexer? |
|---|---|---|
| ElGamal salary ciphertext | On-chain (`ConfidentialTransfer` post-migration) | The chain holds it; no analytics provider proxies the read |
| Salary plaintext | Decrypted in the user's browser via viewing key | **Never** |
| Employee PDA, org PDA, wallet pubkeys | On-chain | Read directly from the configured Solana RPC |
| Employee names, internal labels, salary tiers | Zalary frontend state | **Never sent in queries** |
| Tx timestamps, signatures, fee payer | On-chain | Read directly from the configured Solana RPC |
| Fiat conversions of decrypted amounts | Browser-only | **Never** (held in memory, rendered to DOM) |
| Auditor decryption results | Browser, post viewing-key | **Never** |
| World ID nullifier, Privy email | Identity providers | **Never sent to any analytics provider** |

If you are about to write code that violates a "Never" row, stop.

## Rules the code follows

1. **Browser-originated calls only.** Every chain read fires from the user's browser, scoped to wallets they already control. No backend pools queries across orgs — that would build the honeypot we are trying to avoid.

2. **No third-party analytics indexer in the read path.** The Insights and Activity-log views call the configured Solana RPC directly. We do not route through any service whose business model is logging which wallet asks about which PDA at what moment.

3. **No PII in queries.** RPC calls use wallet addresses and program IDs. They do not carry employee names, email addresses, internal IDs, or salary band labels. Anything that isn't already public on-chain stays out.

4. **Queries scoped to the connected wallet.** The frontend only issues calls for PDAs derivable from the wallet currently connected in the browser session — the employee's own wallet, or the org PDA owned by that wallet's authority. Cross-wallet queries are impossible without reconnecting.

5. **Client-side decryption, always.** Encrypted amounts are decrypted in the browser using a key the user controls. The plaintext never round-trips through any network call. Tax-year totals, fiat conversions, CSV exports are all built in-memory and rendered to the DOM.

6. **Viewing keys never leave the device.** Not in a header. Not in a body. Not in a query string. The viewing key reaches the browser, decrypts, and is forgotten.

7. **Threshold disclosures for the auditor view.** When an auditor is shown counts of employees or txs, anything below a threshold is collapsed to a range ("5+ employees") rather than an exact figure.

8. **No server-side logging of RPC responses.** If we ever proxy a call through our backend, the response is not persisted. The backend is a transport, not a cache.

## The one residual leak we disclose

Any RPC the user's browser talks to learns "this wallet asked about this PDA at this time." We treat that as a property of the chain, not of Zalary, and recommend running against an RPC the user trusts. Self-hosted nodes, paid RPC tiers with no logging, or local validators are all valid choices. The default is Helius's public devnet endpoint for development; mainnet deployment will document the production RPC choice.

## What this contract is not

It is not a substitute for the on-chain privacy primitive. The contract above governs what we send over the network. The contract that governs what's readable on-chain is the Token-2022 ConfidentialTransfer migration, tracked in `app/src/lib/salary_crypto.ts` and the program. Both have to hold.

## When to update this doc

- A new third-party API gets added to the frontend.
- A backend service gets introduced that touches user data.
- The on-chain primitive changes shape (e.g., when ConfidentialTransfer ships).
- A privacy-relevant bug or near-miss is found in review.
