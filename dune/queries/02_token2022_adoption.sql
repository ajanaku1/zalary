-- 02 · Token-2022 program adoption
-- Daily transactions touching the Token-2022 program. Token-2022 is the
-- substrate Zalary's confidential balances live on. This curve is the
-- adoption proxy for "is the chain ready for confidential payroll?"

SELECT
  DATE_TRUNC('day', block_time) AS day,
  COUNT(DISTINCT tx_id) AS tx_count,
  COUNT(DISTINCT signer) AS unique_signers
FROM solana.transactions
CROSS JOIN UNNEST(account_keys) AS t(account_key)
WHERE account_key = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
  AND block_time >= NOW() - INTERVAL '90' DAY
  AND success = true
GROUP BY 1
ORDER BY 1 DESC
