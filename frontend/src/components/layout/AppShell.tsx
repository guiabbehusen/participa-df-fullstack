import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SkipLink } from '@/components/a11y/SkipLink'
import { OfflineBanner } from '@/components/a11y/OfflineBanner'
import { AccessibilityDock } from '@/components/a11y/AccessibilityDock'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { IzaChatWidget } from '@/components/iza/IzaChatWidget'

export function AppShell() {
  const location = useLocation()

  // Suporte para navegação por seções (menu do header): /#faq, /#como-funciona, etc.
  useEffect(() => {
    if (!location.hash) return

    const id = location.hash.replace('#', '')
    if (!id) return

    let raf = 0
    let tries = 0

    const tryScroll = () => {
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }

      tries += 1
      if (tries < 18) raf = window.requestAnimationFrame(tryScroll)
    }

    raf = window.requestAnimationFrame(tryScroll)
    return () => window.cancelAnimationFrame(raf)
  }, [location.pathname, location.hash])

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
