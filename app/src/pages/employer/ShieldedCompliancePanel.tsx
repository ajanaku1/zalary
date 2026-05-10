// Surface 6: Hierarchical compliance grant.
//
// The differentiator vs. plain shielded-payroll: selective disclosure. An
// employer can grant a specific auditor (tax authority, internal compliance
// officer, etc.) the ability to re-encrypt and read a subset of the employer's
// shielded activity — without revealing the full master viewing key and
// without weakening anonymity for anyone else.
//
// What we ship here: the issuer side. The auditor's re-encryption viewer
// would be a separate /auditor route; this build only proves the grant is
// creatable and revocable on-chain.

import { useCallback, useState } from 'react'
import { address } from '@solana/kit'
import {
  getComplianceGrantIssuerFunction,
  getComplianceGrantRevokerFunction,
  getUserAccountQuerierFunction,
} from '@umbra-privacy/sdk'
import { useUmbra } from '../../contexts/UmbraProvider'
import {
  Alert,
  Btn,
  Card,
  Heading,
  MAX_W,
  StatusLabel,
  sp,
} from '../../components/shielded/primitives'

interface GrantRecord {
  auditor: string
  nonce: string
  sig: string
  issuedAt: number
  revokedSig?: string
}

const STORAGE_KEY = 'zalary.compliance.grants'

function loadGrants(): GrantRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveGrants(grants: GrantRecord[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(grants)) } catch { /* ignore */ }
}

export default function ShieldedCompliancePanel() {
  const { client, sessionPubkey, status } = useUmbra()
  const [auditor, setAuditor] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [grants, setGrants] = useState<GrantRecord[]>(() => loadGrants())
  const [revokingNonce, setRevokingNonce] = useState<string | null>(null)

  const issue = useCallback(async () => {
    if (!client || !sessionPubkey) return
    const trimmed = auditor.trim()
    if (!trimmed) { setError('Enter the auditor wallet address'); return }
    setIssuing(true)
    setError(null)
    try {
      const queryUser = getUserAccountQuerierFunction({ client })
      // Get both X25519 keys — the granter's (us) and the receiver's (auditor).
      const [me, them]: any[] = await Promise.all([
        queryUser(address(sessionPubkey)),
        queryUser(address(trimmed)),
      ])
      if (me?.state !== 'exists' || !me?.data?.x25519PublicKey) {
        throw new Error('Your own Umbra account is not fully registered — wait for the shielded layer pill to be green.')
      }
      if (them?.state !== 'exists' || !them?.data?.x25519PublicKey) {
        throw new Error('Auditor has no Umbra account on-chain. Ask them to open Zalary and complete the shielded layer setup first.')
      }
      const granterX25519 = me.data.x25519PublicKey
      const receiverX25519 = them.data.x25519PublicKey
      const nonce = BigInt(Date.now()) as any

      const issueFn = getComplianceGrantIssuerFunction({ client })
      const sig: string = await issueFn(address(trimmed), granterX25519, receiverX25519, nonce)

      const next: GrantRecord[] = [
        { auditor: trimmed, nonce: nonce.toString(), sig, issuedAt: Date.now() },
        ...grants,
      ]
      setGrants(next)
      saveGrants(next)
      setAuditor('')
    } catch (err: any) {
      console.error('[Compliance] issue failed', err)
      setError(err?.cause?.message ?? err?.message ?? String(err))
    } finally {
      setIssuing(false)
    }
  }, [auditor, client, sessionPubkey, grants])

  const revoke = useCallback(async (grant: GrantRecord) => {
    if (!client || !sessionPubkey) return
    setRevokingNonce(grant.nonce)
    setError(null)
    try {
      const queryUser = getUserAccountQuerierFunction({ client })
      const [me, them]: any[] = await Promise.all([
        queryUser(address(sessionPubkey)),
        queryUser(address(grant.auditor)),
      ])
      const granterX25519 = me?.data?.x25519PublicKey
      const receiverX25519 = them?.data?.x25519PublicKey
      if (!granterX25519 || !receiverX25519) throw new Error('Could not resolve X25519 keys for revoke')

      const revokeFn = getComplianceGrantRevokerFunction({ client })
      const sig: string = await revokeFn(
        address(grant.auditor),
        granterX25519,
        receiverX25519,
        BigInt(grant.nonce) as any,
      )
      const next = grants.map((g) => g.nonce === grant.nonce ? { ...g, revokedSig: sig } : g)
      setGrants(next)
      saveGrants(next)
    } catch (err: any) {
      console.error('[Compliance] revoke failed', err)
      setError(err?.cause?.message ?? err?.message ?? String(err))
    } finally {
      setRevokingNonce(null)
    }
  }, [client, sessionPubkey, grants])

  if (!client || (status !== 'ready' && status !== 'proving-anonymous')) {
    return (
      <Card style={{ maxWidth: MAX_W.card }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Compliance grants become available once the shielded layer pill turns green.
        </div>
      </Card>
    )
  }

  return (
    <Card style={{ maxWidth: MAX_W.card }}>
      <Heading
        title="Compliance grants"
        subtitle="Grant a specific auditor — tax authority, internal compliance, regulator — re-encryption access to your shielded activity. Selective disclosure: only this auditor, only what you granted, revocable at any time."
      />

      <div style={{ display: 'flex', gap: sp.sm, marginBottom: sp.lg }}>
        <input
          type="text"
          placeholder="Auditor wallet address (their session pubkey)"
          value={auditor}
          onChange={(e) => setAuditor(e.target.value)}
          disabled={issuing}
          style={{
            flex: 1,
            padding: `${sp.sm + 2}px ${sp.md}px`,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-base)',
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
          }}
        />
        <Btn onClick={issue} disabled={issuing || !auditor.trim()}>
          {issuing ? 'Issuing…' : 'Issue grant'}
        </Btn>
      </div>

      {error && <Alert tone="err">{error}</Alert>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: sp.sm }}>
        {grants.length === 0 ? (
          <div style={{
            padding: sp.xl,
            fontSize: 13,
            color: 'var(--text-muted)',
            textAlign: 'center',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius)',
          }}>
            No grants issued yet.
          </div>
        ) : (
          grants.map((g) => {
            const revoked = !!g.revokedSig
            return (
              <div key={g.nonce} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${sp.sm + 2}px ${sp.md}px`,
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                    {g.auditor.slice(0, 8)}…{g.auditor.slice(-6)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Issued {new Date(g.issuedAt).toLocaleString()} · nonce {g.nonce.slice(0, 10)}…
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: sp.md }}>
                  <StatusLabel tone={revoked ? 'muted' : 'ok'}>
                    {revoked ? 'Revoked' : 'Active'}
                  </StatusLabel>
                  <a
                    href={`https://explorer.solana.com/tx/${g.sig}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono"
                    style={{ fontSize: 11, color: 'var(--accent)' }}
                  >
                    issue tx ↗
                  </a>
                  {!revoked && (
                    <Btn
                      variant="ghost"
                      size="sm"
                      onClick={() => revoke(g)}
                      disabled={revokingNonce === g.nonce}
                    >
                      {revokingNonce === g.nonce ? 'Revoking…' : 'Revoke'}
                    </Btn>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
