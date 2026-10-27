/*
  app/App — F&L routing (src/app is the route layer; pages live in features).
  ───────────
  /          landing (public)
  /login     auth page — gradient left, form right (public)
  /signup    auth page — gradient left, form right (public)
  /app       dashboard (requires session)

  Auth flows:
  · signed-in + public route → /app
  · signed-out + /app        → /login
*/

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { ErrorDialog, Toasts } from '../components/Toast'
import { Landing } from '../features/landing/page'
import { AuthPage } from '../features/auth/page'
import { Dashboard } from '../features/dashboard/page'
import { LegalPage } from '../features/legal/page'
import { KycPage } from '../features/kyc/page'

function RequireSession({ session, children }: { session: Session | null; children: React.ReactNode }) {
  const location = useLocation()
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <>{children}</>
}

function PublicOnly({ session, children }: { session: Session | null; children: React.ReactNode }) {
  if (session) return <Navigate to="/app" replace />
  return <>{children}</>
}

function AppRoutes() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (!ready) {
    return <div className="min-h-screen bg-paper" aria-busy="true" />
  }

  return (
    <Routes>
      <Route path="/" element={<PublicOnly session={session}><Landing session={session} /></PublicOnly>} />
      <Route
        path="/login"
        element={
          <PublicOnly session={session}>
            <AuthPage mode="signin" />
          </PublicOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnly session={session}>
            <AuthPage mode="signup" />
          </PublicOnly>
        }
      />
      <Route
        path="/app"
        element={
          <RequireSession session={session}>
            <Dashboard session={session!} />
          </RequireSession>
        }
      />
      <Route
        path="/kyc"
        element={
          <RequireSession session={session}>
            <KycPage />
          </RequireSession>
        }
      />
      <Route path="/kyc/done" element={<Navigate to="/kyc" replace />} />
      <Route path="/terms" element={<LegalPage kind="terms" />} />
      <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <Toasts />
      <ErrorDialog />
    </BrowserRouter>
  )
}
