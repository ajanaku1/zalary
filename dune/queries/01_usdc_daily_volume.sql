-- 01 · USDC velocity on Solana
-- Daily transfer count and volume for USDC. The thesis: Zalary's TAM is the
-- size of the USDC velocity flywheel on Solana — every transfer is a candidate
-- payroll if you squint. Bigger curve = bigger market.

SELECT
  DATE_TRUNC('day', block_time) AS day,
  COUNT(*) AS transfer_count,
  SUM(amount / 1e6) AS volume_usdc
FROM tokens_solana.transfers
WHERE token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  AND block_time >= NOW() - INTERVAL '90' DAY
  AND amount > 0
GROUP BY 1
ORDER BY 1 DESC
