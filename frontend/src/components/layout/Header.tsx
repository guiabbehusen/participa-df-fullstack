import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'inicio', label: 'Início' },
  { id: 'sobre', label: 'O que é' },
  { id: 'como-funciona', label: 'Como funciona' },
  { id: 'iza', label: 'IZA' },
  { id: 'faq', label: 'Perguntas' },
]

function navItemClass(active: boolean) {
  return [
    'inline-flex items-center rounded-full px-3 py-2 text-sm font-semibold transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.40)]',
    active
      ? 'bg-[rgba(var(--c-primary),0.10)] text-[rgb(var(--c-text))]'
      : 'text-[rgba(var(--c-text),0.80)] hover:bg-[rgba(var(--c-border),0.30)] hover:text-[rgb(var(--c-text))]',
  ].join(' ')
}

export function Header() {
  const { pathname, hash } = useLocation()

  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(var(--c-border),0.70)] bg-[rgba(var(--c-surface),0.92)] backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-3" aria-label="Ir para a página inicial">
          {/* Marca principal no header (institucional) */}
          <div className="rounded-xl bg-[rgb(var(--c-primary))] px-3 py-2 shadow-[var(--shadow-elev-1)] ring-1 ring-[rgba(var(--c-primary),0.30)]">
            <img src="/brand/logo-gdf-branca.png" alt="Governo do Distrito Federal" className="h-6 w-auto" loading="eager" />
          </div>

          <div className="leading-tight">
            <p className="text-sm font-extrabold tracking-tight text-[rgb(var(--c-text))]">Participa DF</p>
            <p className="text-xs font-semibold text-[rgba(var(--c-text),0.70)]">Ouvidoria</p>
          </div>
        </Link>

        {/* Menu por seções (desktop) */}
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Seções da página">
          {SECTIONS.map((s) => {
            const active = pathname === '/' && hash === `#${s.id}`
            return (
              <Link key={s.id} to={`/#${s.id}`} className={navItemClass(active)}>
                {s.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          {/* Menu compacto (mobile/tablet) */}
          <details className="relative lg:hidden">
            <summary
              className="list-none rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.85)] px-3 py-2 text-sm font-semibold text-[rgb(var(--c-text))] shadow-sm transition-colors hover:bg-[rgba(var(--c-border),0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.40)]"
              aria-label="Abrir menu de seções"
            >
              <span className="inline-flex items-center gap-2">
                Seções
                <ChevronDown className="h-4 w-4 text-[rgba(var(--c-text),0.65)]" aria-hidden="true" />
              </span>
            </summary>
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.98)] shadow-[var(--shadow-elev-2)]"
            >
              {SECTIONS.map((s) => (
                <Link
                  key={s.id}
                  to={`/#${s.id}`}
                  role="menuitem"
                  className="block px-4 py-3 text-sm font-semibold text-[rgb(var(--c-text))] hover:bg-[rgba(var(--c-border),0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.40)]"
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </details>

          {/* CTA */}
          {pathname !== '/manifestacoes/nova' && (
            <Link to="/manifestacoes/nova">
              <Button className="px-4 py-2 text-sm" aria-label="Criar nova manifestação">
                Nova manifestação
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
