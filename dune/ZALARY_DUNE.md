# Zalary on Dune — Frontier Data Sidetrack submission

This dashboard is Zalary's submission to the [Dune Analytics Frontier Data Sidetrack](https://superteam.fun/earn/listing/dune-analytics-x-superteam-earn-or-frontier-data-sidetrack) ($6,000 plan credit). Title:

> **Confidential Payroll on Solana — the addressable market for Zalary**

## Why this dashboard, not "Zalary's own activity"

Zalary lives on Solana **devnet** for the hackathon. Dune indexes Solana **mainnet** only. Charting Zalary's own program directly would produce empty panels.

Instead, the dashboard sizes Zalary's TAM with mainnet data:

- How big is the USDC velocity flywheel that Zalary plugs into?
- How fast is Token-2022 (the substrate for confidential balances) gaining adoption?
- How many transfers per day fall in the **contractor pay band** ($200–$50K)?
- Where does the salary-band volume concentrate?
- Is there an incumbent payday rhythm (do USDC contractors get paid on Fridays)?
- How many *new* USDC recipients land on the rail every day — the population Zalary could be a front door for?

That's six panels of real-data context, all pulled from `tokens_solana.transfers` and `solana.transactions`.

## Panels

| # | Title | Query | Visualisation |
|---|---|---|---|
| 1 | **USDC velocity** — daily transfer count + volume, 90 days | [01_usdc_daily_volume.sql](queries/01_usdc_daily_volume.sql) | Bar chart: `volume_usdc`; line: `transfer_count` |
| 2 | **Token-2022 adoption** — daily txs + unique signers, 90 days | [02_token2022_adoption.sql](queries/02_token2022_adoption.sql) | Dual-axis line chart |
| 3 | **Contractor-band transfers** — $200–$50K, 60 days | [03_contractor_band_transfers.sql](queries/03_contractor_band_transfers.sql) | Stacked bar: `unique_recipients` vs `contractor_band_transfers` |
| 4 | **New USDC recipients per day** — first-time wallets, 60 days | [04_new_recipients_per_day.sql](queries/04_new_recipients_per_day.sql) | Area chart |
| 5 | **Payroll size distribution** — bucketed contractor-band, 30 days | [05_payroll_size_distribution.sql](queries/05_payroll_size_distribution.sql) | Horizontal bar chart |
| 6 | **Payday cadence** — day-of-week pattern, 30 days | [06_payday_cadence.sql](queries/06_payday_cadence.sql) | Bar chart by `day_of_week` |

## Setup steps

1. **Sign up** at [dune.com](https://dune.com) (free tier is enough).
2. For each `queries/0X_*.sql` file:
   - Open the SQL editor (the `</>` icon → New Query)
   - Paste the file contents
   - Click **Run**, wait for results
   - Name it (e.g. "Zalary · USDC velocity"), save it
   - In the result panel click **New visualization**, pick the chart type from the table above
   - Save the visualization
3. **Create dashboard** → **New dashboard** → "Zalary · Confidential Payroll on Solana".
4. Drag each saved visualization onto the dashboard. Add a markdown text widget at the top with the framing paragraph below.
5. **Publish** the dashboard (toggle in the top-right).
6. Submit the public dashboard URL to the Frontier Data Sidetrack listing.

## Recommended dashboard intro

> **Zalary** is a confidential-payroll product built on Solana Token-2022 ConfidentialTransfer. We can't chart Zalary's own activity here yet — it lives on devnet, and Dune only indexes mainnet. Instead, this dashboard sizes the addressable market we're entering. Each panel answers a question we ask ourselves about whether confidential payroll on Solana is ready to be a real product.
>
> Repo: github.com/ajanaku1/zalary · Live demo: zalary.vercel.app

## Notes on the queries

- Every query filters to USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` — Circle's official Solana USDC.
- The "contractor band" of $200–$50K is the wedge defended in Zalary's BUSINESS.md: too small for SWIFT, too large for tipping rails.
- `tokens_solana.transfers` and `solana.transactions` are stable Dune mainnet tables; no decoded-IDL dependencies, no Spellbook spells, so the queries don't break when upstream models change.
- The Token-2022 program adoption query unnests `account_keys` to catch every tx that touches the program, regardless of which slot it appears in.
