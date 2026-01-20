import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { buildAttachmentUrl, getManifestation } from '@/services/api/manifestations'
import type { ManifestationRecord } from '@/types/manifestation'

export function ProtocolPage() {
  const navigate = useNavigate()
  const { protocol: protocolParam } = useParams()
  const [protocol, setProtocol] = useState(protocolParam || '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [record, setRecord] = useState<ManifestationRecord | null>(null)

  useEffect(() => {
    if (!protocolParam) return
    setLoading(true)
    setError(null)

    getManifestation(protocolParam)
      .then((data) => {
        setRecord(data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao consultar protocolo'))
      .finally(() => setLoading(false))
  }, [protocolParam])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-50">Acompanhar protocolo</h1>
          <p className="mt-1 text-sm text-slate-200/70">
            Consulte o status da sua manifestação.
          </p>
        </div>

        <Link
          to="/manifestacoes/nova"
          className="inline-flex items-center justify-center rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-slate-50 ring-1 ring-white/10 hover:bg-white/15"
        >
          Registrar nova
        </Link>
      </div>

      <Card>
        <CardTitle>Consultar</CardTitle>
        <CardDescription>Digite o protocolo recebido (ex.: DF-20250116-ABC123).</CardDescription>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Input value={protocol} onChange={(e) => setProtocol(e.target.value)} placeholder="DF-20250116-ABC123" />
          <Button type="button" onClick={() => navigate(`/protocolos/${encodeURIComponent(protocol.trim())}`)}>
            Consultar
          </Button>
        </div>
      </Card>

      {loading && <div className="glass p-6 shimmer">Carregando…</div>}

      {error && (
        <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}

      {record && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Protocolo {record.protocol}</CardTitle>
              <CardDescription>Criado em {new Date(record.created_at).toLocaleString()}</CardDescription>
            </div>
            <Badge variant={record.status === 'Respondido' ? 'success' : record.status === 'Em análise' ? 'warning' : 'info'}>
              {record.status}
            </Badge>
          </div>

          <dl className="mt-6 grid gap-4 text-sm md:grid-cols-2">
            <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
              <dt className="text-slate-200/60">Tipo</dt>
              <dd className="mt-1 font-semibold text-slate-50">{record.kind}</dd>
            </div>
            <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
              <dt className="text-slate-200/60">Assunto</dt>
              <dd className="mt-1 font-semibold text-slate-50">{record.subject}</dd>
            </div>

            <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10 md:col-span-2">
              <dt className="text-slate-200/60">Relato</dt>
              <dd className="mt-1 whitespace-pre-wrap text-slate-50">
                {record.description_text || '(Sem relato em texto)'}
              </dd>
            </div>
          </dl>

          {record.attachments.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-50">Anexos</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {record.attachments.map((a) => (
                  <li key={a.filename} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                    <span className="text-slate-50">
                      {a.filename} <span className="text-slate-200/60">({Math.round(a.bytes / 1024)} KB)</span>
                    </span>
                    <a
                      className="text-blue-200 underline underline-offset-2 hover:text-white"
                      href={buildAttachmentUrl(record.protocol, a.filename)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Baixar
                    </a>
                  </li>
                ))}
              </ul>

              <div className="mt-3 text-xs text-slate-200/60">
                Para acessibilidade, anexos devem ter descrição/transcrição.
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
