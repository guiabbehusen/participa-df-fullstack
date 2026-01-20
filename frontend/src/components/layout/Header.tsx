import { Link, NavLink } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/30 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="inline-flex items-center gap-3">
            <img
              src="/brand/participadf-branca.svg"
              alt="Participa DF"
              className="h-6 w-auto"
            />
            <Badge variant="info">PWA</Badge>
          </Link>
        </div>

        <nav aria-label="Navegação principal" className="hidden items-center gap-2 md:flex">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `rounded-full px-3 py-1 text-sm ${isActive ? 'bg-white/10 text-white' : 'text-slate-200/80 hover:bg-white/10'}`
            }
          >
            Início
          </NavLink>
          <NavLink
            to="/manifestacoes/nova"
            className={({ isActive }) =>
              `rounded-full px-3 py-1 text-sm ${isActive ? 'bg-white/10 text-white' : 'text-slate-200/80 hover:bg-white/10'}`
            }
          >
            Registrar
          </NavLink>
        </nav>

        <div className="flex items-center gap-3">
          <img
            src="/brand/logo-gdf-branca.png"
            alt="GDF"
            className="hidden h-10 w-auto opacity-90 md:block"
          />
          <Link
            to="/manifestacoes/nova"
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow shadow-blue-600/20 hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
          >
            Registrar manifestação
          </Link>
        </div>
      </div>
    </header>
  )
}
