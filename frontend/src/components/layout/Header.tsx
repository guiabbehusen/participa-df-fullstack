import { Link, useLocation } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function Header() {
  const { pathname } = useLocation()

  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(var(--c-border),0.70)] bg-[rgba(var(--c-surface),0.92)] backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-3" aria-label="Ir para a página inicial">
          {/* Marca principal no header (institucional) */}
          <div className="rounded-xl bg-[rgb(var(--c-primary))] px-3 py-2 shadow-[var(--shadow-elev-1)] ring-1 ring-[rgba(var(--c-primary),0.30)]">
            <img
              src="/brand/logo-gdf-branca.png"
              alt="Governo do Distrito Federal"
              className="h-6 w-auto"
              loading="eager"
            />
          </div>

          <div className="leading-tight">
            <p className="text-sm font-extrabold tracking-tight text-[rgb(var(--c-text))]">Participa DF</p>
            <p className="text-xs font-semibold text-[rgba(var(--c-text),0.70)]">Ouvidoria</p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-xs font-semibold text-[rgba(var(--c-text),0.70)]">
              Acessível · Multicanal · PWA
            </span>
          </div>

          {pathname !== '/manifestacoes/nova' && (
            <Link to="/manifestacoes/nova">
              <Button className="px-4" aria-label="Criar nova manifestação">
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
