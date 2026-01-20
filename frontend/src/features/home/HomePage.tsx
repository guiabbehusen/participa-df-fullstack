import { Link } from 'react-router-dom'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export function HomePage() {
  return (
    <div className="space-y-8">
      <section className="glass relative overflow-hidden p-8">
        <div className="pointer-events-none absolute inset-0 opacity-60">
          <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-blue-600/20 blur-2xl" />
          <div className="absolute -right-16 -bottom-16 h-56 w-56 rounded-full bg-blue-400/20 blur-2xl" />
        </div>

        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">Ouvidoria</Badge>
            <Badge variant="default">WCAG 2.1 AA</Badge>
            <Badge variant="default">Multicanal</Badge>
          </div>

          <h1 className="mt-4 text-balance text-3xl font-extrabold tracking-tight text-slate-50 sm:text-4xl">
            Participa DF: registrar uma manifestação deve ser simples, inclusivo e humano.
          </h1>

          <p className="mt-4 max-w-2xl text-base text-slate-200/80">
            Um PWA focado em acessibilidade e baixa inclusão digital: registre por texto, áudio, imagem ou vídeo,
            receba protocolo automático e acompanhe o status. A IZA ajuda a direcionar sua solicitação com IA local no navegador.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/manifestacoes/nova"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow shadow-blue-600/20 hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
            >
              Registrar manifestação
            </Link>
            <Link
              to="/protocolos/DF-EXEMPLO-000000"
              className="inline-flex items-center justify-center rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-slate-50 ring-1 ring-white/10 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
            >
              Consultar protocolo
            </Link>
          </div>

          <p className="mt-3 text-xs text-slate-200/60">
            Dica: abra o chat da IZA no canto inferior direito para orientação e anexos recomendados.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardTitle>Inclusão digital de verdade</CardTitle>
          <CardDescription>
            Linguagem clara, etapas curtas, salvamento de rascunho e suporte a anexos.
          </CardDescription>
        </Card>
        <Card>
          <CardTitle>Acessibilidade como critério principal</CardTitle>
          <CardDescription>
            Foco visível, navegação por teclado, resumo de erros e exigência de alt/transcrição para mídia.
          </CardDescription>
        </Card>
        <Card>
          <CardTitle>IZA: triagem offline-friendly</CardTitle>
          <CardDescription>
            Classificação local (sem API keys). Sugere o que anexar e encaminha para o fluxo correto.
          </CardDescription>
        </Card>
      </section>

      <section className="glass p-6">
        <h2 className="text-lg font-semibold text-slate-50">Como funciona</h2>
        <ol className="mt-4 grid gap-3 text-sm text-slate-200/80 md:grid-cols-3">
          <li className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
            <strong className="text-slate-50">1) Descreva</strong>
            <div className="mt-1">Texto ou mídia (áudio/imagem/vídeo) com requisitos acessíveis.</div>
          </li>
          <li className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
            <strong className="text-slate-50">2) Receba protocolo</strong>
            <div className="mt-1">Geração automática para acompanhamento e rastreabilidade.</div>
          </li>
          <li className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
            <strong className="text-slate-50">3) Acompanhe</strong>
            <div className="mt-1">Consulte o status com transparência (recebido / em análise / respondido).</div>
          </li>
        </ol>
      </section>
    </div>
  )
}
