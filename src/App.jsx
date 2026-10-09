import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { LangProvider, LangBoundary } from './i18n'
import UiHost from './ui/UiHost'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoadingScreen from './components/LoadingScreen'

import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import LegalPage from './pages/LegalPage'
import AthleteHome from './pages/AthleteHome'
import CoachHome from './pages/CoachHome'
import CoachAthlete from './pages/CoachAthlete'
import CoachLibrary from './pages/CoachLibrary'

function RoleRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  return <Navigate to={profile?.role === 'coach' ? '/coach' : '/atleta'} replace />
}

export default function App() {
  return (
    <LangProvider>
    <AuthProvider>
      <LangBoundary>
      <UiHost />
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/recuperar" element={<ForgotPassword />} />
          <Route path="/restablecer" element={<ResetPassword />} />
          <Route path="/privacidad" element={<LegalPage kind="privacy" />} />
          <Route path="/terminos" element={<LegalPage kind="terms" />} />

          <Route path="/" element={<RoleRedirect />} />

          <Route
            path="/atleta"
            element={
              <ProtectedRoute role="athlete">
                <Layout wide><AthleteHome /></Layout>
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
            path="/coach/biblioteca"
            element={
              <ProtectedRoute role="coach">
                <Layout wide><CoachLibrary /></Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/coach/atleta/:athleteId"
            element={
              <ProtectedRoute role="coach">
                <Layout wide><CoachAthlete /></Layout>
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      </LangBoundary>
    </AuthProvider>
    </LangProvider>
  )
}
