import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js'

// SPL Memo program v2
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

const MEMO_TAG = 'zalary-join'
const MEMO_VERSION = 1

export interface JoinRecord {
  signature: string
  orgName: string
  employeeName: string
  sessionPubkey: string
  joinerWallet: string
  blockTime: number | null
}

interface JoinMemoPayload {
  t: typeof MEMO_TAG
  v: typeof MEMO_VERSION
  org: string
  name: string
  pubkey: string
}

export function encodeJoinMemo(orgName: string, employeeName: string, sessionPubkey: string): string {
  const payload: JoinMemoPayload = {
    t: MEMO_TAG,
    v: MEMO_VERSION,
    org: orgName.slice(0, 64),
    name: employeeName.slice(0, 64),
    pubkey: sessionPubkey,
  }
  return JSON.stringify(payload)
}

export function decodeJoinMemo(memo: string): { orgName: string; employeeName: string; sessionPubkey: string } | null {
  try {
    const parsed = JSON.parse(memo) as Partial<JoinMemoPayload>
    if (parsed.t !== MEMO_TAG || parsed.v !== MEMO_VERSION) return null
    if (!parsed.org || !parsed.name || !parsed.pubkey) return null
    new PublicKey(parsed.pubkey)
    return { orgName: parsed.org, employeeName: parsed.name, sessionPubkey: parsed.pubkey }
  } catch {
    return null
  }
}

// Build a tx that both pings the employer wallet (0 lamports — makes the tx
// discoverable via getSignaturesForAddress on the employer side) and carries
// a memo with the employee's joining metadata.
export function buildJoinTx(
  employeeWallet: PublicKey,
  employerWallet: PublicKey,
  orgName: string,
  employeeName: string,
  sessionPubkey: string,
): Transaction {
  const tx = new Transaction()
  tx.add(SystemProgram.transfer({
    fromPubkey: employeeWallet,
    toPubkey: employerWallet,
    lamports: 0,
  }))
  tx.add(new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(encodeJoinMemo(orgName, employeeName, sessionPubkey), 'utf8'),
  }))
  return tx
}

// Scan an employer wallet's recent signatures for join memos. Returns one
// record per unique session pubkey (the most recent join wins on collision).
export async function scanJoinTxs(
  connection: Connection,
  employerWallet: PublicKey,
  limit = 50,
): Promise<JoinRecord[]> {
  const sigs = await connection.getSignaturesForAddress(employerWallet, { limit })
  if (sigs.length === 0) return []
  const results = await Promise.all(
    sigs.map(s => connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 })),
  )
  const records: JoinRecord[] = []
  const seen = new Set<string>()
  const employerB58 = employerWallet.toBase58()
  for (let i = 0; i < results.length; i++) {
    const tx = results[i]
    if (!tx) continue
    const ixs = tx.transaction.message.instructions
    let memoText: string | null = null
    let joiner: string | null = null
    let destination: string | null = null
    for (const ix of ixs) {
      if ('parsed' in ix && ix.program === 'spl-memo') {
        memoText = typeof ix.parsed === 'string' ? ix.parsed : String((ix as any).parsed ?? '')
      }
      if ('parsed' in ix && ix.program === 'system' && (ix.parsed as any)?.type === 'transfer') {
        joiner = (ix.parsed as any)?.info?.source ?? null
        destination = (ix.parsed as any)?.info?.destination ?? null
      }
    }
    if (!memoText || !joiner || !destination) continue
    // Only count memos whose transfer destination IS this employer. Otherwise
    // we'd pick up memos this wallet sent to OTHER orgs (when it joined them
    // as an employee) and add itself to its own roster.
    if (destination !== employerB58) continue
    // And ignore self-sent txs (wallet would be both source and destination).
    if (joiner === employerB58) continue
    const decoded = decodeJoinMemo(memoText)
    if (!decoded) continue
    if (seen.has(decoded.sessionPubkey)) continue
    seen.add(decoded.sessionPubkey)
    records.push({
      signature: sigs[i].signature,
      orgName: decoded.orgName,
      employeeName: decoded.employeeName,
      sessionPubkey: decoded.sessionPubkey,
      joinerWallet: joiner,
      blockTime: tx.blockTime ?? null,
    })
  }
  // Newest first (sigs come back newest first by default)
  return records
}

export function buildInviteUrl(
  origin: string,
  employerWallet: string,
  orgName: string,
  mint?: string | null,
): string {
  const params = new URLSearchParams({ org: employerWallet, name: orgName })
  if (mint) params.set('mint', mint)
  return `${origin}/join?${params.toString()}`
}
