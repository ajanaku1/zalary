import { useNavigate } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import TopNav from '../components/TopNav'

export default function Landing() {
  const navigate = useNavigate()
  const { connected } = useWallet()
  const { setVisible } = useWalletModal()

  const goTo = (path: string) => {
    window.scrollTo(0, 0)
    if (!connected) {
      setVisible(true)
    }
    navigate(path)
  }

  const lockSvg12 = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
  )

  return (
    <div className="screen active">
      <TopNav variant="landing" />

      <main>
        {/* Hero */}
        <section className="hero">
          <div className="hero-left">
            <h1>Pay contractors anywhere, <span className="highlight">privately</span></h1>
            <p>USDC payroll on Solana for remote teams paying across borders. Amounts stay hidden on-chain. Employees cash out to NGN, INR, BRL, or KES inside the same app.</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(108,92,231,0.08)', border: '1px solid rgba(108,92,231,0.2)', borderRadius: 'var(--radius-full)', padding: '6px 14px', fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 20 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Colosseum Frontier Hackathon 2026
            </div>
            <div className="hero-buttons">
              <button className="btn-primary" onClick={() => goTo('/employer')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                I'm an Employer
              </button>
              <button className="btn-outline" onClick={() => goTo('/employee')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                Employee Login
              </button>
            </div>
          </div>
          <div className="hero-right">
            {/* Card 1: Back - Employee Balance */}
            <div className="hero-card">
              <div className="card-label">Employee Balance</div>
              <div className="card-amount mono">$8,500.00</div>
              <div className="card-detail">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Just for your eyes
              </div>
            </div>
            {/* Card 2: Middle - Encrypted Tx */}
            <div className="hero-card">
              <div className="card-label">Confidential Transfer</div>
              <div className="encrypted-bar"></div>
              <div className="encrypted-bar" style={{ width: '70%' }}></div>
              <div className="card-detail" style={{ marginTop: 12 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Private
              </div>
            </div>
            {/* Card 3: Front - Employer Dashboard */}
            <div className="hero-card">
              <div className="card-label">Employer Dashboard</div>
              <div className="mini-row"><span className="name">Alice</span><span className="status status-paid">Paid</span></div>
              <div className="mini-row"><span className="name">Bob</span><span className="status status-private">Private</span></div>
              <div className="mini-row"><span className="name">Carol</span><span className="status status-paid">Paid</span></div>
              <div className="mini-row"><span className="name">Dave</span><span className="status status-private">Private</span></div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="how-it-works" id="how-it-works">
          <h2>How It Works</h2>

          <div className="zigzag-step">
            <div className="zigzag-text">
              <div className="step-num">01</div>
              <h3>Set up your treasury</h3>
              <p>Deposit USDC into your org's on-chain vault. It's a token account only you can move. Fund it, run payroll, withdraw whenever.</p>
            </div>
            <div className="zigzag-visual">
              <div className="zigzag-card">
                <div className="vault-header">
                  <span>USDC Treasury</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <div className="vault-amount mono">$250,000.00</div>
                <div className="progress-bar"><div className="fill" style={{ width: '72%' }}></div></div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>72% funded for Q2</div>
              </div>
            </div>
          </div>

          <div className="zigzag-step">
            <div className="zigzag-text">
              <div className="step-num">02</div>
              <h3>Add your team</h3>
              <p>Add employees by wallet or email. They log in with their own wallet. Nobody touches anyone else's keys, and nobody sees what their teammates earn.</p>
            </div>
            <div className="zigzag-visual">
              <div className="zigzag-card">
                <div className="employee-cards">
                  <div className="employee-mini">
                    <div className="avatar-xs" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>AJ</div>
                    <div className="info">Aisha J.<br/><span className="addr-small">7xKt...m4Fp</span></div>
                  </div>
                  <div className="employee-mini">
                    <div className="avatar-xs" style={{ background: 'var(--accent-warm-subtle)', color: 'var(--accent-warm)' }}>MR</div>
                    <div className="info">Marcus R.<br/><span className="addr-small">3vBn...q9Xz</span></div>
                  </div>
                  <div className="employee-mini">
                    <div className="avatar-xs" style={{ background: 'rgba(0,184,148,0.12)', color: 'var(--success)' }}>LP</div>
                    <div className="info">Lena P.<br/><span className="addr-small">9aHk...w2Ty</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="zigzag-step">
            <div className="zigzag-text">
              <div className="step-num">03</div>
              <h3>Everyone gets paid, privately</h3>
              <p>One transaction per employee per run. The amount gets encrypted before it touches the chain. Your team can verify they got paid. A block explorer just sees a transfer happened.</p>
            </div>
            <div className="zigzag-visual">
              <div className="zigzag-card">
                <div className="blurred-amounts">
                  {[
                    { name: 'Aisha J.', amount: '$8,500.00' },
                    { name: 'Marcus R.', amount: '$12,000.00' },
                    { name: 'Lena P.', amount: '$9,200.00' },
                  ].map((row) => (
                    <div className="blurred-row" key={row.name}>
                      <span>{row.name}</span>
                      <span className="amount-hidden mono">{row.amount}</span>
                      <span className="lock-badge">
                        {lockSvg12}
                        Private
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust Section */}
        <section className="trust-section" id="security">
          <h2>Your salary, your secret</h2>
          <div className="trust-cards">
            <div className="trust-card">
              <div className="trust-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <h3>Confidential transfers</h3>
              <p>Each salary lives in a Token-2022 confidential balance on Solana. The transaction is visible on-chain. The number inside it isn't.</p>
            </div>
            <div className="trust-card">
              <div className="trust-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              </div>
              <h3>Self-custody</h3>
              <p>Zalary holds nothing. Funds go into your org's vault, then directly to each employee's wallet when payroll runs.</p>
            </div>
            <div className="trust-card">
              <div className="trust-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              </div>
              <h3>Instant settlement</h3>
              <p>Solana transactions confirm in about 400ms. Each payroll transfer costs fractions of a cent. No bank rails, no 2-3 business days.</p>
            </div>
          </div>
        </section>

        {/* Built With */}
        <section className="partners-section">
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20, fontWeight: 600 }}>
            Built with
          </p>
          <div className="marquee-track">
            {[
              { name: 'Solana', desc: 'L1 Blockchain' },
              { name: 'Token-2022', desc: 'Confidential Transfers' },
              { name: 'Privy', desc: 'Auth & Onboarding' },
              { name: 'World ID', desc: 'Proof of Personhood' },
              { name: 'MoonPay', desc: 'Fiat Off-Ramp' },
              { name: 'Phantom', desc: 'Wallet' },
              { name: 'Solana', desc: 'L1 Blockchain' },
              { name: 'Token-2022', desc: 'Confidential Transfers' },
              { name: 'Privy', desc: 'Auth & Onboarding' },
              { name: 'World ID', desc: 'Proof of Personhood' },
              { name: 'MoonPay', desc: 'Fiat Off-Ramp' },
              { name: 'Phantom', desc: 'Wallet' },
            ].map((item, i) => (
              <span key={`${item.name}-${i}`} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', marginRight: 40 }}>
                <span className="partner-logo">{item.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{item.desc}</span>
              </span>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section style={{ textAlign: 'center', padding: '80px 24px', background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 16 }}>
            Try it on devnet
          </h2>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto 32px', lineHeight: 1.7 }}>
            Set up your org, add employees, and run a payroll. You need a Phantom wallet and some devnet SOL. That's it.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => goTo('/employer')} style={{ padding: '14px 32px', fontSize: 16 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Launch Employer Dashboard
            </button>
            <button className="btn-outline" onClick={() => goTo('/employee')} style={{ padding: '14px 32px', fontSize: 16 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Employee Portal
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="site-footer">
          <div className="footer-left">
            <div className="logo-footer">Z<span>.</span>alary</div>
            <div className="solana-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l2 2 4-4"/></svg>
              Built on Solana
            </div>
          </div>
          <div className="footer-right">
            <a href="#" aria-label="GitHub">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            </a>
          </div>
        </footer>
        <div className="footer-inspiration">Inspired by Deel, Mercury, Coinbase</div>
      </main>
    </div>
  )
}
