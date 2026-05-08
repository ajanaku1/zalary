// Covalent Pricing API — quote USDC against contractor-friendly fiat rails.
//
// The ICP for Zalary is contractors paid in USDC who think in their local
// currency. We surface the spot USDC→{NGN,INR,BRL,USD} rate on the Insights
// tab so the employer sees the human stakes of a payroll run without anyone
// pushing fiat amounts through the chain.
//
// Endpoint: /v1/pricing/historical_by_addresses_v2/{chain}/{quote}/{addr}/
// We fetch a single recent day per currency and cache for the session.

import { NETWORK } from './helius'

const COVALENT_BASE = 'https://api.covalenthq.com/v1'
const SOLANA_CHAIN = 'solana-mainnet'
const USDC_MAINNET_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const API_KEY = import.meta.env.VITE_COVALENT_API_KEY as string | undefined

export type FiatCode = 'USD' | 'NGN' | 'INR' | 'BRL'

export interface FiatQuote {
  currency: FiatCode
  pricePerUsdc: number  // 1 USDC = X currency
  asOf: string
}

export function isPricingAvailable(): boolean {
  return Boolean(API_KEY) && NETWORK !== 'devnet'
}

interface PricingResponse {
  data?: Array<{
    prices?: Array<{ date: string; price: number }>
  }>
}

const cache = new Map<FiatCode, FiatQuote>()

export async function getUsdcPrice(currency: FiatCode): Promise<FiatQuote | null> {
  if (!isPricingAvailable()) return null
  const cached = cache.get(currency)
  if (cached) return cached
  const url = `${COVALENT_BASE}/pricing/historical_by_addresses_v2/${SOLANA_CHAIN}/${currency}/${USDC_MAINNET_MINT}/?key=${API_KEY}`
  const res = await fetch(url)
  if (!res.ok) return null
  const json = (await res.json()) as PricingResponse
  const point = json.data?.[0]?.prices?.[0]
  if (!point) return null
  const quote: FiatQuote = { currency, pricePerUsdc: point.price, asOf: point.date }
  cache.set(currency, quote)
  return quote
}

export async function getMultiFiat(): Promise<FiatQuote[]> {
  const codes: FiatCode[] = ['USD', 'NGN', 'INR', 'BRL']
  const results = await Promise.all(codes.map(getUsdcPrice))
  return results.filter((q): q is FiatQuote => q !== null)
}
