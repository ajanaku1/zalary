import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

type UserRole = 'owner' | 'admin' | 'employee' | null

interface RoleContextType {
  role: UserRole
  setRole: (role: UserRole) => void
  orgName: string | null
}

const RoleContext = createContext<RoleContextType>({
  role: null,
  setRole: () => {},
  orgName: null,
})

export function useRole() {
  return useContext(RoleContext)
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>(null)
  const [orgName] = useState<string | null>('Acme Corp')
  const location = useLocation()

  useEffect(() => {
    if (location.pathname.startsWith('/employer')) {
      setRole('owner')
    } else if (location.pathname.startsWith('/employee') || location.pathname.startsWith('/join')) {
      setRole('employee')
    } else {
      setRole(null)
    }
  }, [location.pathname])

  return (
    <RoleContext.Provider value={{ role, setRole, orgName }}>
      {children}
    </RoleContext.Provider>
  )
}
