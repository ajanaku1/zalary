-- 04 · First-time USDC recipients per day on Solana
-- A proxy for "new contractors onboarded to the rail" — the population of
-- wallets that Zalary could be the front door for if it had been there at
-- their first transfer.

WITH first_seen AS (
  SELECT
    to_token_account AS wallet,
    MIN(block_time) AS first_received_at
  FROM tokens_solana.transfers
  WHERE token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    AND amount BETWEEN 50 * 1e6 AND 50000 * 1e6
  GROUP BY 1
)
SELECT
  DATE_TRUNC('day', first_received_at) AS day,
  COUNT(*) AS new_recipients
FROM first_seen
WHERE first_received_at >= NOW() - INTERVAL '60' DAY
GROUP BY 1
ORDER BY 1 DESC
