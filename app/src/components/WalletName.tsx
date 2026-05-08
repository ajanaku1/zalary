// Render a wallet as its SNS .sol name when available, falling back to the
// truncated base58 address. Plug this in everywhere a raw wallet appears so
// addresses become human-readable identities across the app.

import { useEffect, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { useConnection } from '@solana/wallet-adapter-react'
import { getFavoriteDomain, getSnsProfile } from '../lib/sns'
import { truncateAddress } from '../lib/utils'

interface Props {
  wallet: string | PublicKey
  showAvatar?: boolean
  className?: string
  style?: React.CSSProperties
}

export default function WalletName({ wallet, showAvatar, className, style }: Props) {
  const { connection } = useConnection()
  const [name, setName] = useState<string | null>(null)
  const [picture, setPicture] = useState<string | null>(null)
  const pubkey = typeof wallet === 'string' ? safePub(wallet) : wallet

  useEffect(() => {
    if (!pubkey) return
    let cancelled = false
    if (showAvatar) {
      getSnsProfile(pubkey, connection).then(p => {
        if (cancelled) return
        if (p.domain) setName(p.domain)
        if (p.picture) setPicture(p.picture)
      })
    } else {
      getFavoriteDomain(pubkey, connection).then(d => {
        if (!cancelled) setName(d)
      })
    }
    return () => { cancelled = true }
  }, [pubkey?.toBase58(), connection, showAvatar])

  const display = name ? `${name}.sol` : pubkey ? truncateAddress(pubkey.toBase58()) : '—'

  if (showAvatar) {
    return (
      <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
        {picture ? (
          <img src={picture} alt="" style={{ width: 20, height: 20, borderRadius: 10, objectFit: 'cover' }} />
        ) : (
          <span style={{ width: 20, height: 20, borderRadius: 10, background: 'var(--accent, #6c5ce7)', opacity: 0.4, display: 'inline-block' }} />
        )}
        <span className={name ? '' : 'mono'}>{display}</span>
      </span>
    )
  }
  return <span className={`${className ?? ''} ${name ? '' : 'mono'}`} style={style}>{display}</span>
}

function safePub(s: string): PublicKey | null {
  try { return new PublicKey(s) } catch { return null }
}
