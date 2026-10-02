import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoadingScreen from './components/LoadingScreen'

import Login from './pages/Login'
import Signup from './pages/Signup'
import AthleteHome from './pages/AthleteHome'
import CoachHome from './pages/CoachHome'
import CoachAthlete from './pages/CoachAthlete'

function RoleRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  return <Navigate to={profile?.role === 'coach' ? '/coach' : '/atleta'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          <Route path="/" element={<RoleRedirect />} />

          <Route
            path="/atleta"
            element={
              <ProtectedRoute role="athlete">
                <Layout><AthleteHome /></Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/coach"
            element={
              <ProtectedRoute role="coach">
                <Layout><CoachHome /></Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/coach/atleta/:athleteId"
            element={
              <ProtectedRoute role="coach">
                <Layout><CoachAthlete /></Layout>
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
