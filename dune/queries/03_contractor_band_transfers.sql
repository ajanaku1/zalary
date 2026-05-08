-- 03 · "Salary-band" USDC transfers per day
-- Zalary's wedge is the $200–$50,000 contractor payment band — too small for
-- corporate banking rails, too large for a Tiplink. Charting transfers in this
-- band per day approximates the daily addressable contractor-payroll market.

WITH band_transfers AS (
  SELECT
    DATE_TRUNC('day', block_time) AS day,
    amount / 1e6 AS amount_usdc,
    to_token_account
  FROM tokens_solana.transfers
  WHERE token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    AND block_time >= NOW() - INTERVAL '60' DAY
    AND amount BETWEEN 200 * 1e6 AND 50000 * 1e6
)
SELECT
  day,
  COUNT(*) AS contractor_band_transfers,
  COUNT(DISTINCT to_token_account) AS unique_recipients,
  SUM(amount_usdc) AS volume_usdc,
  APPROX_PERCENTILE(amount_usdc, 0.5) AS median_amount
FROM band_transfers
GROUP BY 1
ORDER BY 1 DESC
