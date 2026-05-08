// Covalent Multichain — cross-chain stablecoin balances for the employer wallet.
//
// The pitch: many companies hold treasury across chains. Before signing a
// payroll run on Solana, the employer wants to see "what stablecoins do I have,
// anywhere?" so they know whether to bridge first. Covalent's unified API lets
// us answer that with one call shape across Solana, Ethereum, Base, Polygon,
// Arbitrum — no separate RPC plumbing per chain.
//
// Privacy contract: the employer's own wallet pubkey crosses to Covalent
// (already public); no employee data, no salaries.

const COVALENT_BASE = 'https://api.covalenthq.com/v1'
const API_KEY = import.meta.env.VITE_COVALENT_API_KEY as string | undefined

// Major stablecoin contracts on each chain. Used as a known-good filter so we
// don't enumerate every dust token in the response.
const STABLECOIN_FILTERS: Record<string, string[]> = {
  'eth-mainnet':     ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0xdac17f958d2ee523a2206206994597c13d831ec7'], // USDC, USDT
  'base-mainnet':    ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'], // USDC
  'matic-mainnet':   ['0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', '0xc2132d05d31c914a87c6611c10748aeb04b58e8f'], // USDC, USDT
  'arbitrum-mainnet':['0xaf88d065e77c8cc2239327c5edb3a432268e5831', '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'], // USDC, USDT
  'solana-mainnet':  ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'], // USDC, USDT
}

const CHAIN_LABELS: Record<string, string> = {
  'eth-mainnet': 'Ethereum',
  'base-mainnet': 'Base',
  'matic-mainnet': 'Polygon',
  'arbitrum-mainnet': 'Arbitrum',
  'solana-mainnet': 'Solana',
}

export interface CrossChainBalance {
  chain: string  // human label
  symbol: string
  balance: number
  quote: number  // USD value
}

export function isMultichainAvailable(): boolean {
  return Boolean(API_KEY)
}

interface BalancesResponse {
  data?: {
    items?: Array<{
      contract_address?: string
      contract_ticker_symbol?: string
      balance?: string
      contract_decimals?: number
      quote?: number
    }>
  }
}

// Returns the wallet's stablecoin holdings across the supported chains.
// Each chain is queried in parallel; failures don't poison the whole result.
export async function getCrossChainStables(walletEvm: string, walletSolana: string): Promise<CrossChainBalance[]> {
  if (!API_KEY) return []
  const chains = Object.keys(STABLECOIN_FILTERS)
  const results = await Promise.all(chains.map(async chain => {
    const wallet = chain === 'solana-mainnet' ? walletSolana : walletEvm
    if (!wallet) return []
    return fetchStablesForChain(chain, wallet)
  }))
  return results.flat().filter(b => b.balance > 0.01)
}

async function fetchStablesForChain(chain: string, wallet: string): Promise<CrossChainBalance[]> {
  try {
    const url = `${COVALENT_BASE}/${chain}/address/${wallet}/balances_v2/?key=${API_KEY}&no-spam=true`
    const res = await fetch(url)
    if (!res.ok) return []
    const json = (await res.json()) as BalancesResponse
    const allowed = new Set(STABLECOIN_FILTERS[chain])
    return (json.data?.items ?? [])
      .filter(it => it.contract_address && allowed.has(it.contract_address.toLowerCase ? it.contract_address.toLowerCase() : it.contract_address))
      .map(it => ({
        chain: CHAIN_LABELS[chain] ?? chain,
        symbol: it.contract_ticker_symbol ?? 'USD',
        balance: Number(it.balance ?? 0) / 10 ** (it.contract_decimals ?? 6),
        quote: it.quote ?? 0,
      }))
  } catch {
    return []
  }
}

// SOL/USD spot price for converting fee tile from SOL → USD.
export async function getSolUsdPrice(): Promise<number | null> {
  if (!API_KEY) return null
  try {
    const url = `${COVALENT_BASE}/pricing/historical_by_addresses_v2/solana-mainnet/USD/So11111111111111111111111111111111111111112/?key=${API_KEY}`
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json() as { data?: Array<{ prices?: Array<{ price: number }> }> }
    return json.data?.[0]?.prices?.[0]?.price ?? null
  } catch {
    return null
  }
}
