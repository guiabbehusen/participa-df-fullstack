import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { CheckCircle2, Clock, Copy, Download, Info, MessageCircle, Shield, Image as ImageIcon, FileAudio, Video } from 'lucide-react'
import { motion } from 'framer-motion'

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

function iconForTopic(record: ManifestationRecord) {
  const t = `${record.subject} ${record.subject_detail} ${record.description_text}`.toLowerCase()
  if (/(assalto|furto|roubo|amea|arma|tiro|violencia|vandal)/.test(t)) return Shield
  if (/(saude|sus|posto|hospital|vacina|dengue|medic)/.test(t)) return Info
  if (/(buraco|asfalto|calcada|ilumin|poste|sinaliza|infra)/.test(t)) return Clock
  return MessageCircle
}

function buildSimulatedResponse(record: ManifestationRecord) {
  const kind = kindLabel(record.kind)
  const topic = record.subject_detail || record.subject
  const t = `${record.subject} ${record.subject_detail} ${record.description_text}`.toLowerCase()

  const isSecurity = /(assalto|furto|roubo|amea|arma|tiro|violencia|vandal|segur)/.test(t)
  const isHealth = /(saude|sus|posto|hospital|vacina|dengue|medic|atendimento)/.test(t)
  const isInfra = /(buraco|asfalto|calcada|ilumin|poste|sinaliza|infra)/.test(t)

  const greeting = record.anonymous ? 'Olá!' : `Olá${record.contact_name ? `, ${record.contact_name}` : ''}!`

  const header = `${greeting} Recebemos sua manifestação (${kind}).`
  const routed =
    isInfra
      ? 'Encaminhamos para a área responsável pela manutenção urbana para avaliação e providências.'
      : isHealth
        ? 'Encaminhamos para a área responsável pela rede de atendimento para análise.'
        : isSecurity
          ? 'Encaminhamos para o órgão competente para apuração e encaminhamentos cabíveis.'
          : 'Encaminhamos para a área responsável para análise e providências.'

  const tips: string[] = []

  if (isInfra) tips.push('Se possível, informe pontos de referência e numeração do local.')
  if (record.attachments.length === 0 && (isInfra || isSecurity)) tips.push('Um anexo (foto/áudio/vídeo) pode ajudar na análise, quando aplicável.')
  if (record.attachments.some((a) => a.accessibility_text)) tips.push('A descrição dos anexos foi registrada para garantir acessibilidade.')
  if (record.anonymous) tips.push('Como está anônimo, mantenha o relato bem detalhado (onde/quando) para viabilizar a análise.')

  const body = [
    `Assunto: ${topic}.`,
    routed,
    'Acompanhe por este protocolo. Caso a equipe precise de esclarecimentos adicionais, poderá solicitar complementação.',
  ]

  return {
    title: 'Resposta (simulação de atendimento)',
    subtitle: 'Exemplo de como o retorno pode aparecer ao cidadão.',
    message: `${header}\n\n${body.join('\n')}`,
    tips,
  }
}

function statusStep(statusRaw: string | undefined) {
  const s = (statusRaw || '').toLowerCase()
  if (/(respond|final|conclu|encerr)/.test(s)) return 2
  // Para demo premium: após o envio, considere que está "em análise"
  if (/(anal|triag|andamento|encaminh)/.test(s)) return 1
  return 1
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

  const ui = useMemo(() => {
    if (!record) return null
    const Icon = iconForTopic(record)
    const simulated = buildSimulatedResponse(record)
    const step = statusStep(record.status)

    const steps = [
      { label: 'Recebido', desc: 'Protocolo gerado' },
      { label: 'Em análise', desc: 'Triagem e encaminhamento' },
      { label: 'Resposta', desc: `Prazo inicial: ${slaDays} dias` },
    ]

    return { Icon, simulated, step, steps }
  }, [record, slaDays])

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

  if (error || !record || !ui) {
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
    <div className="space-y-6">
      {/* Sucesso */}
      {state.fromSubmit && (
        <motion.div
          className="rounded-2xl border border-[rgba(var(--c-success),0.25)] bg-[rgba(var(--c-success),0.10)] p-5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5" aria-hidden="true" />
            <div>
              <p className="text-base font-extrabold text-[rgb(var(--c-text))]">Manifestação enviada com sucesso.</p>
              <p className="mt-1 text-sm text-[rgba(var(--c-text),0.82)]">
                Protocolo gerado automaticamente. <span className="font-semibold">Prazo inicial de resposta: {slaDays} dias</span>.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Cabeçalho do protocolo + Linha do tempo */}
      <section className="surface p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info">Protocolo</Badge>
              <Badge>{kindLabel(record.kind)}</Badge>
              {record.anonymous ? <Badge variant="warning">Anônimo</Badge> : <Badge variant="success">Identificado</Badge>}
            </div>

            <div className="mt-4 flex items-start gap-3">
              <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-primary),0.06)]">
                <ui.Icon className="h-5 w-5 text-[rgb(var(--c-primary))]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-extrabold tracking-tight text-[rgb(var(--c-text))]">{record.protocol}</h1>
                <p className="mt-1 text-sm text-[rgba(var(--c-text),0.80)]">
                  Aberto em {new Date(record.created_at).toLocaleString()} · Status: <span className="font-semibold">{record.status}</span>
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={copyProtocol} aria-label="Copiar número do protocolo">
                <Copy className="h-4 w-4" aria-hidden="true" />
                {copied ? 'Copiado' : 'Copiar'}
              </Button>

              <Link to="/manifestacoes/nova">
                <Button type="button">Nova manifestação</Button>
              </Link>
            </div>
          </div>

          {/* Linha do tempo */}
          <div className="w-full max-w-md">
            <div className="rounded-2xl border border-[rgba(var(--c-border),0.80)] bg-[rgba(var(--c-surface),0.92)] p-4">
              <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Acompanhamento</p>
              <p className="mt-1 text-xs text-[rgba(var(--c-text),0.70)]">
                Linha do tempo ilustrativa (para demonstrar a experiência do cidadão).
              </p>

              <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Linha do tempo do protocolo">
                {ui.steps.map((s, idx) => {
                  const done = idx < ui.step
                  const current = idx === ui.step
                  return (
                    <li key={s.label} className="min-w-0">
                      <div
                        className={[
                          'rounded-2xl border p-3',
                          done
                            ? 'border-[rgba(var(--c-success),0.35)] bg-[rgba(var(--c-success),0.10)]'
                            : current
                              ? 'border-[rgba(var(--c-primary),0.28)] bg-[rgba(var(--c-primary),0.08)]'
                              : 'border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.80)]',
                        ].join(' ')}
                        aria-current={current ? 'step' : undefined}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={[
                              'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold',
                              done
                                ? 'bg-[rgba(var(--c-success),0.20)] text-[rgb(var(--c-success))]'
                                : current
                                  ? 'bg-[rgba(var(--c-primary),0.18)] text-[rgb(var(--c-primary))]'
                                  : 'bg-[rgba(var(--c-border),0.18)] text-[rgba(var(--c-text),0.75)]',
                            ].join(' ')}
                            aria-hidden="true"
                          >
                            {idx + 1}
                          </span>
                          <span className="truncate text-xs font-extrabold text-[rgb(var(--c-text))]">{s.label}</span>
                        </div>
                        <p className="mt-2 text-[10px] leading-relaxed text-[rgba(var(--c-text),0.72)]">{s.desc}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>

              <div className="mt-3 flex items-center gap-2 text-xs text-[rgba(var(--c-text),0.72)]">
                <Clock className="h-4 w-4" aria-hidden="true" />
                <span>
                  Prazo inicial de resposta: <span className="font-semibold">{slaDays} dias</span>.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Resposta simulada */}
      <section className="surface p-6 md:p-8">
        <div className="flex items-start gap-3">
          <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-primary),0.06)]">
            <MessageCircle className="h-5 w-5 text-[rgb(var(--c-primary))]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-tight text-[rgb(var(--c-text))]">{ui.simulated.title}</h2>
              <Badge variant="info">Simulação</Badge>
            </div>
            <p className="mt-1 text-sm text-[rgba(var(--c-text),0.78)]">{ui.simulated.subtitle}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.92)] p-4">
            <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Mensagem</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[rgba(var(--c-text),0.82)]">{ui.simulated.message}</p>
          </div>

          <div className="rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.92)] p-4">
            <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Próximos passos</p>
            <ul className="mt-3 space-y-2 text-sm text-[rgba(var(--c-text),0.80)]">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-[rgb(var(--c-success))]" aria-hidden="true" />
                <span>Acompanhe pelo protocolo.</span>
              </li>
              <li className="flex gap-2">
                <Info className="mt-0.5 h-4 w-4 text-[rgb(var(--c-primary))]" aria-hidden="true" />
                <span>Se necessário, solicitaremos complementação do relato/anexos.</span>
              </li>
              <li className="flex gap-2">
                <Clock className="mt-0.5 h-4 w-4 text-[rgb(var(--c-warning))]" aria-hidden="true" />
                <span>Prazo inicial: {slaDays} dias.</span>
              </li>
            </ul>

            {ui.simulated.tips.length > 0 && (
              <>
                <p className="mt-5 text-xs font-extrabold text-[rgba(var(--c-text),0.75)]">Dicas</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[rgba(var(--c-text),0.75)]">
                  {ui.simulated.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Detalhes */}
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes da manifestação</CardTitle>
            <CardDescription>Confira as informações registradas.</CardDescription>
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
                  {record.attachments.map((att) => {
                    const Icon = att.field === 'image' ? ImageIcon : att.field === 'audio' ? FileAudio : Video
                    return (
                      <li key={att.id} className="rounded-xl border border-[rgba(var(--c-border),0.70)] bg-[rgb(var(--c-surface))] p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(var(--c-border),0.70)] bg-[rgba(var(--c-primary),0.06)]">
                              <Icon className="h-5 w-5 text-[rgba(var(--c-text),0.70)]" aria-hidden="true" />
                            </span>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-extrabold text-[rgb(var(--c-text))]">
                                {att.field.toUpperCase()} · {att.filename}
                              </p>
                              <p className="mt-1 text-xs text-[rgba(var(--c-text),0.70)]">
                                {att.bytes ? `${Math.round(att.bytes / 1024)} KB` : ''}
                                {att.accessibility_text ? ` · Descrição: ${att.accessibility_text}` : ''}
                              </p>
                            </div>
                          </div>

                          <a href={buildAttachmentUrl(record.protocol, att)} target="_blank" rel="noreferrer">
                            <Button type="button" variant="secondary" aria-label={`Baixar ${att.filename}`}>
                              <Download className="h-4 w-4" aria-hidden="true" />
                              Baixar
                            </Button>
                          </a>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <p className="text-xs text-[rgba(var(--c-text),0.65)]">
              Prazo inicial de resposta: {slaDays} dias. Este prazo pode variar conforme análise e encaminhamento.
            </p>
          </div>
        </Card>
      </section>
    </div>
  )
}
