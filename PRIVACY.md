# Privacy contract

Zalary's privacy pitch is simple: salary amounts live as ciphertext on-chain, viewing keys live on the user's device, and no third party in the loop ever sees plaintext. Any indexer or analytics provider we add — Covalent, Helius, anyone else — has to live inside that boundary.

This document is the line in the sand. Every file in the codebase that talks to a third party has to honor this table.

## What crosses the wire, what never does

| Data | Where it lives | Sent to Covalent? |
|---|---|---|
| ElGamal salary ciphertext | On-chain (`ConfidentialTransfer` post-migration) | Yes — it's already public ciphertext |
| Salary plaintext | Decrypted in the user's browser via viewing key | **Never** |
| Employee PDA, org PDA, wallet pubkeys | On-chain | Yes |
| Employee names, internal labels, salary tiers | Zalary frontend state | **Never sent in queries** |
| Tx timestamps, signatures, fee payer | On-chain | Yes |
| Fiat conversions of decrypted amounts | Browser-only | **Never** (held in memory, rendered to DOM) |
| Auditor decryption results | Browser, post viewing-key | **Never** |
| World ID nullifier, Privy email | Identity providers | **Never sent to Covalent** |

If you are about to write code that violates a "Never" row, stop.

## Rules the code follows

1. **Browser-originated calls only.** Covalent queries fire from the user's browser, scoped to wallets they already control. No backend pools queries across orgs — that would build the honeypot we are trying to avoid.

2. **No PII in queries.** Covalent gets wallet addresses and program IDs. It does not get employee names, email addresses, internal IDs, or salary band labels. Anything that isn't already public on-chain stays out.

3. **Queries scoped to the connected wallet.** The frontend only issues Covalent calls for PDAs derivable from the wallet currently connected in the browser session — the employee's own wallet, or the org PDA owned by that wallet's authority. Cross-wallet queries are impossible without reconnecting. (Wallet-signed query authorization is on the roadmap once we ship a backend proxy that needs to enforce this server-side; today the frontend-only architecture makes the signature redundant.)

4. **Client-side decryption, always.** Encrypted amounts are decrypted in the browser using a key the user controls. The plaintext never round-trips through any network call. Tax-year totals, fiat conversions, CSV exports are all built in-memory and rendered to the DOM.

5. **Covalent never sees the viewing key.** Not in a header. Not in a body. Not in a query string. The viewing key reaches the browser, decrypts, and is forgotten.

6. **Threshold disclosures for the auditor view.** When an auditor is shown counts of employees or txs, anything below a threshold is collapsed to a range ("5+ employees") rather than an exact figure.

7. **Opt-out path.** A user who wants zero third-party data dependency can switch to direct RPC mode in settings. Slower, more requests, same privacy floor.

8. **No server-side logging of Covalent responses.** If we ever proxy a call through our backend, the response is not persisted. The backend is a transport, not a cache.

## The one residual leak we disclose

Querying Covalent for a PDA tells Covalent's logs "someone using Zalary cares about this PDA." That metadata is captured by any third-party RPC the same way, but worth naming: a shared frontend API key reduces it to "the Zalary app asked," and the opt-out path above eliminates it entirely.

## What this contract is not

It is not a substitute for the on-chain privacy primitive. The contract above governs what we send over the network. The contract that governs what's readable on-chain is the Token-2022 ConfidentialTransfer migration, tracked in `app/src/lib/salary_crypto.ts` and the program. Both have to hold.

## When to update this doc

- A new third-party API gets added to the frontend.
- A backend service gets introduced that touches user data.
- The on-chain primitive changes shape (e.g., when ConfidentialTransfer ships).
- A privacy-relevant bug or near-miss is found in review.
