// Privy embedded-wallet claim path. Shown in the Portal when a user is signed
// in via Privy email/Google/Twitter but does NOT have a Phantom-style wallet
// connected. This makes the contractor flow:
//   1. Sign in with email
//   2. Privy auto-creates a Solana wallet on first login
//   3. Click Claim — the embedded wallet signs claim_funds directly
//
// No Phantom install required. This is the BUSINESS.md ICP path: the Lagos
// contractor who owns nothing but a Gmail account.

import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { PublicKey, Transaction } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token'
import { findOrganizationPda, findEmployeePda, findTreasuryPda } from '../../lib/program'
import { IDL } from '../../lib/zalary_idl'
import { usePrivyEmbeddedWallet } from '../../hooks/usePrivyEmbeddedWallet'
import { truncateAddress } from '../../lib/utils'

const USDC_MINT = new PublicKey('AY6ZDfcEqzRKmjk4SJ6s5WUtozYGmgBmHds8M5JhxmnD')

type EmployeeAccount = { encryptedSalary: number[] } | null

export default function PrivyClaimCard() {
  const { ready, authenticated } = usePrivy()
  const { connected: phantomConnected } = useWallet()
  const { connection } = useConnection()
  const signer = usePrivyEmbeddedWallet()

  const [balance, setBalance] = useState('0.00')
  const [employeePda, setEmployeePda] = useState<PublicKey | null>(null)
  const [employeeFound, setEmployeeFound] = useState<boolean | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [claimSig, setClaimSig] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Read-only Anchor program — no signer needed for fetch operations.
  const program = signer
    ? new Program(IDL as any, new AnchorProvider(connection, { publicKey: signer.address, signTransaction: async () => { throw new Error('read-only') }, signAllTransactions: async () => { throw new Error('read-only') } } as any, { commitment: 'confirmed' }))
    : null

  useEffect(() => {
    if (!signer || !program) return
    let cancelled = false
    ;(async () => {
      try {
        const orgAuthority = localStorage.getItem('zalary_org_authority')
        if (!orgAuthority) { setEmployeeFound(false); return }
        const [orgPda] = findOrganizationPda(new PublicKey(orgAuthority))
        const [pda] = findEmployeePda(orgPda, signer.address)
        if (cancelled) return
        setEmployeePda(pda)
        const acct = (await (program.account as any).employee.fetchNullable(pda)) as EmployeeAccount
        if (cancelled) return
        setEmployeeFound(Boolean(acct))
        const ata = getAssociatedTokenAddressSync(USDC_MINT, signer.address, false, TOKEN_2022_PROGRAM_ID)
        const bal = await connection.getTokenAccountBalance(ata).catch(() => null)
        if (!cancelled && bal) setBalance(bal.value.uiAmountString || '0.00')
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load Privy claim state')
      }
    })()
    return () => { cancelled = true }
  }, [signer, program, connection, claimSig])

  const handleClaim = async () => {
    if (!signer || !program || !employeePda) return
    setClaiming(true)
    setError(null)
    try {
      const orgAuthority = localStorage.getItem('zalary_org_authority')
      if (!orgAuthority) throw new Error('No organization linked on this device')
      const [orgPda] = findOrganizationPda(new PublicKey(orgAuthority))
      const [escrow] = findTreasuryPda(orgPda)
      const ata = getAssociatedTokenAddressSync(USDC_MINT, signer.address, false, TOKEN_2022_PROGRAM_ID)

      const tx = new Transaction()
      tx.add(createAssociatedTokenAccountIdempotentInstruction(
        signer.address, ata, signer.address, USDC_MINT, TOKEN_2022_PROGRAM_ID,
      ))
      const ix = await (program.methods as any)
        .claimFunds(new BN(1_000_000)) // 1 USDC test claim — real flow plumbs the eligible amount in
        .accounts({
          organization: orgPda,
          employee: employeePda,
          escrowTokenAccount: escrow,
          claimerTokenAccount: ata,
          usdcMint: USDC_MINT,
          claimer: signer.address,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .instruction()
      tx.add(ix)

      const sig = await signer.signAndSend(tx, connection)
      setClaimSig(sig)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claim failed')
    } finally {
      setClaiming(false)
    }
  }

  // Hide entirely when not relevant: not authenticated, or a Phantom-style
  // wallet is already connected (Portal's existing claim flow handles that).
  if (!ready || !authenticated || phantomConnected || !signer) return null

  return (
    <div className="balance-card-wrapper" style={{ marginTop: 16 }}>
      <div className="balance-card-inner" style={{ textAlign: 'left', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="balance-label" style={{ marginBottom: 2 }}>Privy embedded wallet</div>
            <div className="mono" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{truncateAddress(signer.address.toBase58())}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="balance-label" style={{ marginBottom: 2 }}>USDC balance</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>${balance}</div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          {employeeFound === null ? 'Looking up your Employee PDA…' :
           employeeFound ? <>Linked to Employee PDA <span className="mono">{employeePda && truncateAddress(employeePda.toBase58())}</span></> :
           'No Employee PDA found for this wallet. Ask your employer to add this address.'}
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        {claimSig && (
          <div style={{ color: 'var(--success)', fontSize: 13, marginBottom: 12 }}>
            Claimed via Privy. <a href={`https://solscan.io/tx/${claimSig}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>View tx</a>
          </div>
        )}

        <button
          onClick={handleClaim}
          disabled={!employeeFound || claiming || !!claimSig}
          className="bal-btn claim"
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: employeeFound && !claiming && !claimSig ? 'pointer' : 'not-allowed', opacity: employeeFound && !claiming && !claimSig ? 1 : 0.5, width: '100%', justifyContent: 'center' }}
        >
          {claiming ? 'Signing with Privy…' : claimSig ? 'Claimed' : 'Claim 1 USDC (Privy signs)'}
        </button>
      </div>
    </div>
  )
}
