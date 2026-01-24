import { Outlet } from 'react-router-dom'
import { SkipLink } from '@/components/a11y/SkipLink'
import { OfflineBanner } from '@/components/a11y/OfflineBanner'
import { AccessibilityDock } from '@/components/a11y/AccessibilityDock'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { IzaChatWidget } from '@/components/iza/IzaChatWidget'

export function AppShell() {
  return (
    <div className="min-h-screen">
      <SkipLink />
      <Header />

      <main id="main" className="mx-auto max-w-5xl px-4 py-6">
        <OfflineBanner />
        <Outlet />
      </main>

      <Footer />

      {/* Acessibilidade sempre disponível */}
      <AccessibilityDock />
      {/* Assistente virtual */}
      <IzaChatWidget />
    </div>
  )
}
