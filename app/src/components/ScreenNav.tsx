import { useNavigate, useLocation } from 'react-router-dom'

export default function ScreenNav() {
  const navigate = useNavigate()
  const location = useLocation()

  const current = location.pathname

  // Hide screen nav on employee/join pages (employees only access via invite links)
  if (current.startsWith('/employee') || current.startsWith('/join')) return null

  const goTo = (path: string) => {
    window.scrollTo(0, 0)
    navigate(path)
  }

  return (
    <div className="screen-nav">
      <button className={current === '/' ? 'active' : ''} onClick={() => goTo('/')}>Home</button>
      <button className={current === '/employer' ? 'active' : ''} onClick={() => goTo('/employer')}>Dashboard</button>
    </div>
  )
}
