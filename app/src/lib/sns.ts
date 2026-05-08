// SNS (Solana Name Service) — three surfaces for the SNS Identity track.
//
//   1. Forward resolution: alice.sol → wallet pubkey. Used in onboarding +
//      add-employee flows so an employer can register a contractor by their
//      .sol domain instead of pasting a base58 address.
//   2. Favorite domain (reverse): wallet pubkey → preferred .sol name. Used
//      everywhere a wallet appears in the UI — team lists, payroll review,
//      activity log, insights funders. The address becomes a name.
//   3. Profile records: pulls the SNS Records v2 metadata (picture, twitter,
//      email) so the dashboard can render a contractor's actual profile picture
//      from their .sol domain instead of a generated avatar.
//
// Privacy contract: only base58 pubkeys (already public on chain) cross to the
// SNS resolver. No employee names or salaries.

import { Connection, PublicKey } from '@solana/web3.js'

// In-memory cache to avoid hammering the resolver on every render. Keyed by
// pubkey-base58 for reverse, by domain for forward.
const reverseCache = new Map<string, string | null>()
const forwardCache = new Map<string, string | null>()
const recordsCache = new Map<string, SnsProfile | null>()

export interface SnsProfile {
  domain: string | null
  picture: string | null
  twitter: string | null
  email: string | null
}

// 1. Forward resolution
export async function resolveSolDomain(domain: string, connection: Connection): Promise<string | null> {
  const name = domain.replace(/\.sol$/, '').trim().toLowerCase()
  if (!name) return null
  if (forwardCache.has(name)) return forwardCache.get(name) ?? null
  try {
    const { resolve } = await import('@bonfida/spl-name-service')
    const owner = await resolve(connection, name)
    const out = owner.toBase58()
    forwardCache.set(name, out)
    return out
  } catch {
    forwardCache.set(name, null)
    return null
  }
}

// 2. Favorite (reverse) domain — wallet pubkey → preferred display name.
// SNS lets every wallet pick one canonical .sol; if unset, fall back to the
// first reverse-lookup domain found.
export async function getFavoriteDomain(wallet: PublicKey, connection: Connection): Promise<string | null> {
  const key = wallet.toBase58()
  if (reverseCache.has(key)) return reverseCache.get(key) ?? null
  try {
    const sns = await import('@bonfida/spl-name-service')
    // Try favorite_domain (the user-picked canonical name) first.
    const fav = await tryFavoriteDomain(sns, connection, wallet)
    if (fav) {
      reverseCache.set(key, fav)
      return fav
    }
    // Fall back to any domain owned by this wallet.
    const reverse = await tryReverseLookup(sns, connection, wallet)
    reverseCache.set(key, reverse)
    return reverse
  } catch {
    reverseCache.set(key, null)
    return null
  }
}

async function tryFavoriteDomain(sns: any, connection: Connection, wallet: PublicKey): Promise<string | null> {
  // The SDK has shifted naming over versions; try both canonical names.
  const fn = sns.getFavoriteDomain ?? sns.getPrimaryDomain
  if (!fn) return null
  try {
    const result = await fn(connection, wallet)
    // Older versions return { domain: PublicKey, reverse: string }; newer
    // return { domain, reverse } where reverse is already the .sol name.
    if (typeof result === 'string') return result
    if (result?.reverse) return result.reverse
    if (result?.domain && typeof result.domain === 'string') return result.domain
  } catch { /* unset is the common case — fall back below */ }
  return null
}

async function tryReverseLookup(sns: any, connection: Connection, wallet: PublicKey): Promise<string | null> {
  const fn = sns.getAllDomains ?? sns.findOwnedNameAccountsForUser
  if (!fn) return null
  try {
    const owned: PublicKey[] = await fn(connection, wallet)
    if (!owned || owned.length === 0) return null
    const reverseFn = sns.reverseLookup ?? sns.performReverseLookup
    if (!reverseFn) return null
    const name = await reverseFn(connection, owned[0])
    return typeof name === 'string' ? name : null
  } catch { return null }
}

// 3. Profile records — picture, twitter, email pulled from SNS Records v2.
// Best-effort: any individual record fetch may fail without affecting others.
export async function getSnsProfile(wallet: PublicKey, connection: Connection): Promise<SnsProfile> {
  const key = wallet.toBase58()
  const cached = recordsCache.get(key)
  if (cached) return cached
  const empty: SnsProfile = { domain: null, picture: null, twitter: null, email: null }
  const domain = await getFavoriteDomain(wallet, connection)
  if (!domain) {
    recordsCache.set(key, empty)
    return empty
  }
  try {
    const sns = await import('@bonfida/spl-name-service')
    const recordFn = sns.getRecord ?? sns.getRecordV2
    if (!recordFn) {
      const out = { ...empty, domain }
      recordsCache.set(key, out)
      return out
    }
    const [picture, twitter, email] = await Promise.all([
      safeRecord(recordFn, connection, domain, 'pic'),
      safeRecord(recordFn, connection, domain, 'twitter'),
      safeRecord(recordFn, connection, domain, 'email'),
    ])
    const profile: SnsProfile = { domain, picture, twitter, email }
    recordsCache.set(key, profile)
    return profile
  } catch {
    const out = { ...empty, domain }
    recordsCache.set(key, out)
    return out
  }
}

async function safeRecord(fn: any, connection: Connection, domain: string, record: string): Promise<string | null> {
  try {
    const r = await fn(connection, domain, record)
    if (!r) return null
    if (typeof r === 'string') return r
    if (r.retrievedRecord?.deserialize) return r.retrievedRecord.deserialize() as string
    if (r.deserialize) return r.deserialize() as string
    return null
  } catch { return null }
}
