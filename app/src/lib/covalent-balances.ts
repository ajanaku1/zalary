// Covalent Balances v2 — historical USDC balance trail for the treasury.
//
// Endpoint: /v1/{chain}/address/{addr}/portfolio_v2/?quote-currency=USD
// Returns up to 30 days of daily holdings per token. We extract the USDC row
// and map it to a tiny [{ date, balance }] series the chart can render.
//
// Privacy contract still holds: only the treasury PDA (already public on the
// chain explorer) crosses to Covalent. No employee wallets, no salaries.

import { NETWORK } from './helius'
import { PublicKey } from '@solana/web3.js'

const COVALENT_BASE = 'https://api.covalenthq.com/v1'
const SOLANA_CHAIN = 'solana-mainnet'
const USDC_MAINNET_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const API_KEY = import.meta.env.VITE_COVALENT_API_KEY as string | undefined

export interface BalancePoint {
  date: string  // YYYY-MM-DD
  balance: number  // USDC, ui amount
}

export function isPortfolioAvailable(): boolean {
  return Boolean(API_KEY) && NETWORK !== 'devnet'
}

interface PortfolioResponse {
  data?: {
    items?: Array<{
      contract_address?: string
      contract_ticker_symbol?: string
      holdings?: Array<{
        timestamp: string
        close?: { balance?: string; quote?: number }
      }>
    }>
  }
}

export async function getTreasuryBalanceHistory(treasury: PublicKey): Promise<BalancePoint[]> {
  if (!isPortfolioAvailable()) return []
  const url = `${COVALENT_BASE}/${SOLANA_CHAIN}/address/${treasury.toBase58()}/portfolio_v2/?key=${API_KEY}&quote-currency=USD&days=30`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Covalent portfolio ${res.status}`)
  const json = (await res.json()) as PortfolioResponse
  const usdc = json.data?.items?.find(it =>
    it.contract_address === USDC_MAINNET_MINT || it.contract_ticker_symbol === 'USDC'
  )
  if (!usdc?.holdings) return []
  return usdc.holdings
    .map(h => ({
      date: h.timestamp.slice(0, 10),
      balance: Number(h.close?.balance ?? 0) / 1_000_000,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
