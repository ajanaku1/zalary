-- 06 · Payday cadence — does Solana already pay on Fridays?
-- Bins contractor-band USDC transfers by day-of-week to surface the "payday"
-- pattern. The clearer the spike, the more Zalary can pre-schedule confidential
-- runs around it. The flat-line case means there's no incumbent rhythm to
-- displace — even better.

WITH band AS (
  SELECT block_time, amount / 1e6 AS amount_usdc
  FROM tokens_solana.transfers
  WHERE token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    AND block_time >= NOW() - INTERVAL '30' DAY
    AND amount BETWEEN 200 * 1e6 AND 50000 * 1e6
)
SELECT
  CASE EXTRACT(DOW FROM block_time)
    WHEN 0 THEN '7 · Sun'
    WHEN 1 THEN '1 · Mon'
    WHEN 2 THEN '2 · Tue'
    WHEN 3 THEN '3 · Wed'
    WHEN 4 THEN '4 · Thu'
    WHEN 5 THEN '5 · Fri'
    WHEN 6 THEN '6 · Sat'
  END AS day_of_week,
  COUNT(*) AS transfer_count,
  SUM(amount_usdc) AS volume_usdc
FROM band
GROUP BY 1
ORDER BY 1
