# Zalary — Business Plan

## What we're building

Confidential payroll for remote teams that pay across borders. Employers send USDC on Solana with the amount hidden on-chain via Token-2022 confidential transfers. Employees cash out to their local currency (NGN, KES, BRL, ARS, INR) inside the same app.

The whole reason this exists is that paying contractors in stablecoins has been a normal practice in emerging markets for years now, just done badly. Most of it runs through Binance P2P chats, Wise loops, or a founder DMing a wallet address on Telegram. Salary is public on every block explorer. Wise eats 1.5% per leg. Deel doesn't support half these corridors. The pieces to fix it shipped quietly on Solana over the last 18 months and nobody has put them together for this audience yet.

## Why this is the moment

Token-2022 confidential transfers went live on Solana in mid-2024 and got real auditor-key support not long after. That's the part that lets you hide an amount on-chain without an L2, without an MPC cluster, without trusting a custodian. The compliance story is built into the primitive itself: the employer (and a tax authority, if you want one) holds a viewing key. Anyone else sees that something moved.

At the same time, USDC volume in Nigeria, Argentina, and Brazil has crossed the line where it's the dominant savings rail, not just a speculative one. The Naira has lost roughly 70% against the dollar in two years. Argentine peso is worse. People in these markets are not going to start using their local currency more.

So you have a privacy primitive that just landed, a regulatory meta that explicitly favors selective disclosure over anonymity, and a user base that already wants this product but is currently using duct tape. Someone is going to win this market. The question is who picks the right wedge.

## Who this is for

The first wave is small remote-first startups, somewhere between 5 and 50 people, with at least one or two contractors in a country where USDC is the better option. The founder is usually technical, already pays in stables informally, already hates Wise. Often Solana-aware because they've used Phantom for something else. This is the audience I personally know — they're in my DMs right now asking how to send a contractor in Lagos $3,500 without losing 4% to fees.

DAOs are the next layer. Five billion dollars sits in DAO treasuries and most of them pay contributors via Gnosis Safe and a Google Sheet. Every payment is fully public. You can read any DAO contributor's annual comp off Etherscan. Confidential payroll fixes that without requiring a governance vote to switch.

Web2 SMBs paying overseas dev shops are the third tier. Larger contracts, slower to convince, but a fatter ACV once they're in. Don't chase them yet.

## Pricing

| Stream | Rate | Notes |
|---|---|---|
| Payroll run fee | 0.5% per disbursement | Settlr (current crypto-native comparable) charges 1% |
| Off-ramp spread | ~1% | Passed through from MoonPay or Onramper depending on corridor |
| Premium tier | $99/org/mo | Multi-sig approvals, audit exports, SAML, custom roles. Year 2 |
| Treasury yield share | 50bps of float | Optional opt-in. Idle USDC into a Solana money market, split returns 50/50. Year 2+ |

A working org with about a dozen employees and $42K/mo of payroll volume gives us roughly $210/mo from payroll fees, plus another $80 or so from off-ramp spreads when employees cash out. Call it $290/mo per org, or about $3.5K ARR. Solana fees are not a real cost, so gross margin sits around 80% once we account for RPC and compliance tooling.

## How we get customers

The single channel I have the most conviction in is Superteam regional chapters. Nigeria, India, Brazil, Vietnam, Turkey. These are tight, English-speaking, founder-heavy Telegram groups that are already on Solana. Sponsoring one chapter event a quarter, plus direct founder outreach, should land us early pilots at well under $200 of effective CAC. I don't think a US-based competitor can match this channel. They don't have the relationships and they can't fake them.

Building in public on X is the second leg. Post latency benchmarks, real off-ramp price comparisons, founder testimonials, screenshots of a payroll run settling in 4 seconds. Anchor everything on a concrete demo: paying a Lagos engineer their full $3,500 with the recipient seeing the number land in their phone in a few seconds. The Wise version of that comparison is embarrassing for Wise, which is the point.

SEO comes later. Year 2. Long-tail pages targeting "pay contractor in [country] with stablecoins" and Deel/Remote alternative comparisons. Compounds slowly, becomes the second-largest channel by the end of Year 2.

What I'm not going to do: paid ads. The ACV doesn't support it at this stage of the funnel.

## 12 months

| Month | Where we should be | Why |
|---|---|---|
| 0 | Frontier submission shipped | Filter event for Colosseum |
| 1 | Mainnet live, 5 paid pilots | Convert hackathon momentum into real revenue |
| 3 | $2K MRR, 20 orgs, NGN + INR off-ramps live | Prove the Superteam channel actually works |
| 6 | $10K MRR, 75 orgs, BRL + KES live, audit done | Seed-readiness |
| 9 | $25K MRR, multi-sig + exports shipped, first DAO | Tier 2 starts paying off |
| 12 | $50K MRR, 250 orgs, ~$500K ARR run-rate | Accelerator graduation, seed round |

## Why this can be a real company

Cross-border contractor payroll is a TAM Deel quotes at over $40B. Capturing 0.1% in five years gets you to $40M ARR. The defensibility is structural: Deel and Remote can't ship confidential payroll on Solana without either rebuilding on Solana, which they won't, or making their banking partners profoundly uncomfortable, which they also won't. The crypto-native incumbents (Toku, Rise, Bitwage, Settlr, Request) are fragmented and have all chosen broader positioning. Nobody has gone hard at emerging-market remote contractors as the wedge.

That gap is where Zalary lives.

## Why me

I live in Lagos. I have personally paid contractors in USDC because the alternative was watching them lose money to Wise. I have watched my own savings get eaten by inflation. I'm not building a thesis — I'm shipping the version of this product I needed two years ago. The founder-market fit isn't on a slide. It's a fact about my life.

## What we need from Frontier

A slot in the Colosseum accelerator. Two pilot LOIs from Superteam Nigeria and India by the second week. An advisor with HR-tech or payroll-compliance background to plug in around month 6, when the Tier 2 push starts. Anything else is a bonus.
