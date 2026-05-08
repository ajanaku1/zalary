-- 05 · USDC transfer-size distribution on Solana
-- Histograms the contractor-band transfers into salary buckets. Used to size
-- which segment Zalary should monetise first — the volume distribution
-- usually concentrates in $1K–$5K, which maps to global remote-contractor pay.

WITH band AS (
  SELECT amount / 1e6 AS amount_usdc
  FROM tokens_solana.transfers
  WHERE token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    AND block_time >= NOW() - INTERVAL '30' DAY
    AND amount BETWEEN 200 * 1e6 AND 50000 * 1e6
), bucketed AS (
  SELECT
    CASE
      WHEN amount_usdc < 500   THEN '1 · $200–$500'
      WHEN amount_usdc < 1000  THEN '2 · $500–$1K'
      WHEN amount_usdc < 2500  THEN '3 · $1K–$2.5K'
      WHEN amount_usdc < 5000  THEN '4 · $2.5K–$5K'
      WHEN amount_usdc < 10000 THEN '5 · $5K–$10K'
      WHEN amount_usdc < 25000 THEN '6 · $10K–$25K'
      ELSE                          '7 · $25K–$50K'
    END AS bucket,
    amount_usdc
  FROM band
)
SELECT
  bucket,
  COUNT(*) AS transfer_count,
  SUM(amount_usdc) AS total_volume_usdc
FROM bucketed
GROUP BY 1
ORDER BY 1
