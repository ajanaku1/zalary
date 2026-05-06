import { Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Dashboard from './pages/employer/Dashboard'
import Portal from './pages/employee/Portal'
import JoinOrg from './pages/employee/JoinOrg'
import ScreenNav from './components/ScreenNav'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/employer" element={<Dashboard />} />
        <Route path="/employee" element={<Portal />} />
        <Route path="/join" element={<JoinOrg />} />
      </Routes>
      <ScreenNav />
    </>
  )
}
