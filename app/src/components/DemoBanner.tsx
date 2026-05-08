// Sticky banner shown across the app when ?demo=1 is in the URL. Tells the
// visitor they're looking at seeded showcase data and offers a one-click exit
// back to a normal session.

import { useNavigate, useLocation } from 'react-router-dom'
import { useDemoMode } from '../hooks/useDemoMode'

export default function DemoBanner() {
  const { isDemo, demoAuthority } = useDemoMode()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  if (!isDemo) return null

  const exitDemo = () => navigate(pathname, { replace: true })

  return (
    <div style={containerStyle}>
      <span>
        {demoAuthority
          ? <>Demo data — you're viewing the seeded showcase org. Writes are disabled.</>
          : <>Demo mode requested but <code>VITE_DEMO_ORG_AUTHORITY</code> is not set.</>}
      </span>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <a href="/employer" style={linkStyle}>Sign in to create your own org →</a>
        <button onClick={exitDemo} style={btnStyle}>Exit demo</button>
      </div>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  position: 'sticky',
  top: 64,
  zIndex: 100,
  background: 'var(--accent)',
  color: '#fff',
  padding: '8px 16px',
  fontSize: 13,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
  boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
}

const linkStyle: React.CSSProperties = {
  color: '#fff',
  textDecoration: 'underline',
  fontSize: 12,
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.18)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.4)',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
}
