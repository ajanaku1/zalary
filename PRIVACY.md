# Privacy contract

Zalary's privacy pitch: salary **amounts** live as Token-2022 confidential ciphertext on-chain, decryption keys live on the user's device, and no Zalary backend ever sees plaintext.

This document is the line in the sand. Every file that talks to a third party has to honor this table.

## What crosses the wire, what never does

| Data | Where it lives | Sent to a third-party indexer? |
|---|---|---|
| ElGamal transfer / balance ciphertext | On-chain (Token-2022 Confidential Transfer) | The chain holds it; no analytics provider proxies the read |
| Salary plaintext | Decrypted in the browser via owner AES / ElGamal keys | **Never** |
| Token account addresses, mint, org PDAs | On-chain (public) | Read from configured Solana RPC |
| Employee names, internal labels | Zalary frontend state | **Never sent in queries** |
| Tx signatures, fee payer | On-chain | Read from configured Solana RPC |
| Fiat conversions of decrypted amounts | Browser-only | **Never** |
| Auditor decryption results | Browser, with auditor keys | **Never** |
| World ID nullifier, Privy email | Identity providers | **Never sent to analytics** |

## Rules the code follows

1. **Browser-originated calls only.** No backend pools queries across orgs.
2. **No third-party analytics indexer in the read path.**
3. **No PII in RPC queries.** Wallets and program IDs only.
4. **Queries scoped to the connected wallet.**
5. **Client-side decryption, always.**
6. **Viewing / ElGamal secrets never leave the device.**
7. **Threshold disclosures for auditor UIs** when counts are shown.
8. **No server-side logging of RPC responses.**

## Residual leaks we disclose

1. **RPC metadata:** the RPC learns which wallet queried which accounts.
2. **Token-2022 CT model:** transfer **amounts** are private; **sender and recipient token accounts remain public**. Competitive hiring graphs can still leak from address patterns. Mint **auditor** ElGamal keys enable selective amount disclosure for compliance.

## On-chain primitive

Token-2022 Confidential Transfers (`app/src/lib/confidential.ts`, `@solana-program/token-2022`, `@solana/zk-sdk`). Not Umbra / Arcium.

## When to update this doc

- A new third-party API is added
- A backend touches user data
- The on-chain privacy primitive changes
- A privacy-relevant bug or near-miss is found in review
