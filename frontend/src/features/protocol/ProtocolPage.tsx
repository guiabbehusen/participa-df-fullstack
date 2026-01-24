import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { CheckCircle2, Copy, Download, Info } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { getManifestation, buildAttachmentUrl } from '@/services/api/manifestations'
import type { ManifestationRecord } from '@/types/manifestation'

type LocationState = {
  fromSubmit?: boolean
  initialResponseSlaDays?: number
}

function kindLabel(kind: string) {
  const map: Record<string, string> = {
    reclamacao: 'Reclamação',
    denuncia: 'Denúncia',
    sugestao: 'Sugestão',
    elogio: 'Elogio',
    solicitacao: 'Solicitação',
  }
  return map[kind] || kind
}

export function ProtocolPage() {
  const { protocol = '' } = useParams()
  const location = useLocation()
  const state = (location.state || {}) as LocationState

  const [record, setRecord] = useState<ManifestationRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const slaDays = useMemo(() => state.initialResponseSlaDays ?? 10, [state.initialResponseSlaDays])

  useEffect(() => {
    let mounted = true

    async function run() {
      setLoading(true)
      setError(null)
      try {
        const data = await getManifestation(protocol)
        if (!mounted) return
        setRecord(data)
      } catch (e: any) {
        if (!mounted) return
        setError(e?.message || 'Não foi possível carregar o protocolo.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    if (protocol) run()

    return () => {
      mounted = false
    }
  }, [protocol])

  async function copyProtocol() {
    try {
      await navigator.clipboard.writeText(protocol)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Carregando…</CardTitle>
          <CardDescription>Buscando dados do protocolo.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (error || !record) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Não foi possível carregar</CardTitle>
          <CardDescription>{error || 'Protocolo não encontrado.'}</CardDescription>
        </CardHeader>
        <Link to="/">
          <Button className="mt-2">Voltar</Button>
        </Link>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Sucesso */}
      {state.fromSubmit && (
        <div className="rounded-2xl border border-[rgba(var(--c-success),0.25)] bg-[rgba(var(--c-success),0.10)] p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5" aria-hidden="true" />
            <div>
              <p className="text-base font-extrabold text-[rgb(var(--c-text))]">Manifestação enviada com sucesso.</p>
              <p className="mt-1 text-sm text-[rgba(var(--c-text),0.82)]">
                Protocolo gerado automaticamente. <span className="font-semibold">Prazo inicial de resposta: {slaDays} dias</span>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Resumo do protocolo */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Protocolo</Badge>
                <Badge>{kindLabel(record.kind)}</Badge>
                {record.anonymous ? <Badge variant="warning">Anônimo</Badge> : <Badge variant="success">Identificado</Badge>}
              </div>
              <CardTitle className="mt-3">{record.protocol}</CardTitle>
              <CardDescription>
                Aberto em {new Date(record.created_at).toLocaleString()} · Status: {record.status}
              </CardDescription>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={copyProtocol} aria-label="Copiar número do protocolo">
                <Copy className="h-4 w-4" aria-hidden="true" />
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
              <Link to="/manifestacoes/nova">
                <Button type="button">Nova manifestação</Button>
              </Link>
            </div>
          </div>
        </CardHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-[rgba(var(--c-border),0.70)] bg-[rgba(var(--c-surface),0.70)] p-4">
            <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Assunto</p>
            <p className="mt-1 text-sm text-[rgba(var(--c-text),0.82)]">{record.subject}</p>
            <p className="mt-2 text-xs font-semibold text-[rgba(var(--c-text),0.70)]">Descreva o tema</p>
            <p className="mt-1 text-sm text-[rgba(var(--c-text),0.82)]">{record.subject_detail}</p>
          </div>

          <div className="rounded-xl border border-[rgba(var(--c-border),0.70)] bg-[rgba(var(--c-surface),0.70)] p-4">
            <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Relato</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[rgba(var(--c-text),0.82)]">
              {record.description_text}
            </p>
          </div>

          {!record.anonymous && (record.contact_email || record.contact_name) && (
            <div className="rounded-xl border border-[rgba(var(--c-primary),0.18)] bg-[rgba(var(--c-primary),0.06)] p-4">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4" aria-hidden="true" />
                <div>
                  <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Identificação</p>
                  <p className="mt-1 text-sm text-[rgba(var(--c-text),0.82)]">
                    {record.contact_name || '—'}
                    {record.contact_email ? ` · ${record.contact_email}` : ''}
                    {record.contact_phone ? ` · ${record.contact_phone}` : ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Anexos */}
          <div className="rounded-xl border border-[rgba(var(--c-border),0.70)] bg-[rgba(var(--c-surface),0.70)] p-4">
            <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Anexos</p>
            {record.attachments.length === 0 ? (
              <p className="mt-2 text-sm text-[rgba(var(--c-text),0.75)]">Nenhum anexo enviado.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {record.attachments.map((att) => (
                  <li key={att.id} className="rounded-xl border border-[rgba(var(--c-border),0.70)] bg-[rgb(var(--c-surface))] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">
                          {att.field.toUpperCase()} · {att.filename}
                        </p>
                        <p className="mt-1 text-xs text-[rgba(var(--c-text),0.70)]">
                          {att.bytes ? `${Math.round(att.bytes / 1024)} KB` : ''}
                          {att.accessibility_text ? ` · Descrição: ${att.accessibility_text}` : ''}
                        </p>
                      </div>
                      <a href={buildAttachmentUrl(record.protocol, att)} target="_blank" rel="noreferrer">
                        <Button type="button" variant="secondary" aria-label={`Baixar ${att.filename}`}>
                          <Download className="h-4 w-4" aria-hidden="true" />
                          Baixar
                        </Button>
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-[rgba(var(--c-text),0.65)]">
            Prazo inicial de resposta: {slaDays} dias. Este prazo pode variar conforme análise e encaminhamento.
          </p>
        </div>
      </Card>
    </div>
  )
}
