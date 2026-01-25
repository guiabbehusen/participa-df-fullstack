import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import Balancer from 'react-wrap-balancer'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  FilePlus2,
  Headphones,
  Image as ImageIcon,
  MapPin,
  MessageSquare,
  Mic,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Video as VideoIcon,
} from 'lucide-react'

type FaqCategory = 'Plataforma' | 'Cadastro' | 'Registros' | 'Suporte'
type FaqItem = {
  id: string
  category: FaqCategory
  question: string
  answer: ReactNode
  searchText: string
}

const BRAND = {
  blue: 'rgb(var(--brand-blue, 0 113 188))', // Manual: RGB 0/113/188
  green: 'rgb(var(--brand-green, 82 142 70))',
  yellow: 'rgb(var(--brand-yellow, 230 172 46))',
  ink: 'rgb(var(--brand-ink, 89 89 87))',
  gray2: 'rgb(var(--brand-gray-2, 206 206 206))',
  bg: 'rgb(var(--c-bg, 239 239 239))',
  surface: 'rgb(var(--c-surface, 255 255 255))',
}

const CONTAINER = 'mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10 2xl:px-12'

const FAQ: FaqItem[] = [
  {
    id: 'serve',
    category: 'Plataforma',
    question: 'Para que serve o Participa DF?',
    answer: (
      <div className="space-y-2">
        <p>
          O Participa DF é o canal digital da Ouvidoria para você registrar <strong>solicitação</strong>,{' '}
          <strong>reclamação</strong>, <strong>sugestão</strong>, <strong>denúncia</strong>, <strong>elogio</strong> e{' '}
          pedidos de informação relacionados aos serviços do GDF.
        </p>
        <p className="text-slate-600">
          Você pode acompanhar o andamento e receber respostas com transparência e rastreabilidade (protocolo).
        </p>
      </div>
    ),
    searchText: 'serve participa df ouvidoria canal digital solicitação reclamação sugestão denúncia elogio',
  },
  {
    id: 'beneficio',
    category: 'Plataforma',
    question: 'Qual o benefício em usar o Participa DF?',
    answer: (
      <ul className="list-disc space-y-1 pl-5 text-slate-700">
        <li>Registro com protocolo automático.</li>
        <li>Mais clareza do seu relato (com apoio da IZA, quando quiser).</li>
        <li>Possibilidade de anexar evidências (imagem, áudio, vídeo) com descrição para acessibilidade.</li>
        <li>Acompanhamento do andamento e retorno ao cidadão.</li>
      </ul>
    ),
    searchText: 'benefício vantagens protocolo acompanhamento anexos evidências acessibilidade',
  },
  {
    id: 'quem-pode',
    category: 'Cadastro',
    question: 'Quem pode usar o Participa DF?',
    answer: (
      <p className="text-slate-700">
        Qualquer cidadão pode registrar manifestações. Alguns tipos podem exigir identificação (por exemplo, elogio,
        sugestão e solicitação), conforme regras do fluxo.
      </p>
    ),
    searchText: 'quem pode usar cadastro cidadão identificação elogio sugestão solicitação',
  },
  {
    id: 'central162',
    category: 'Plataforma',
    question: 'Quais são os canais de acesso à Ouvidoria do DF?',
    answer: (
      <ul className="list-disc space-y-1 pl-5 text-slate-700">
        <li>Participa DF (online).</li>
        <li>Central 162 (telefone).</li>
        <li>Atendimento presencial nos órgãos do GDF (quando disponível).</li>
      </ul>
    ),
    searchText: 'canais 162 presencial participa df online',
  },
  {
    id: 'cadastro-ouvdf',
    category: 'Cadastro',
    question: 'Preciso fazer cadastro no Ouv-DF (Ouvidoria) para usar?',
    answer: (
      <p className="text-slate-700">
        Depende do tipo de manifestação. Para anonimato, você não informa dados pessoais. Para alguns serviços e tipos,
        pode ser necessário identificar-se.
      </p>
    ),
    searchText: 'cadastro ouvidoria ouvidoria ouvd f preciso cadastro anonimato',
  },
  {
    id: 'cadastro-esic',
    category: 'Cadastro',
    question: 'Preciso de cadastro no e-SIC para pedidos de informação?',
    answer: (
      <p className="text-slate-700">
        Pedidos de informação (LAI) costumam exigir identificação para retorno e tramitação adequados. O fluxo pode
        direcionar para o canal correto.
      </p>
    ),
    searchText: 'e-sic lai pedido de informação cadastro identificação',
  },
  {
    id: 'andamento',
    category: 'Registros',
    question: 'Como acompanho o andamento da minha manifestação?',
    answer: (
      <p className="text-slate-700">
        Após enviar, você recebe um <strong>protocolo</strong>. Use a opção <strong>Acompanhar protocolo</strong> na home
        para consultar status e respostas.
      </p>
    ),
    searchText: 'acompanhar andamento protocolo status respostas',
  },
  {
    id: 'acessar-anteriores',
    category: 'Registros',
    question: 'Posso acessar manifestações anteriores?',
    answer: (
      <p className="text-slate-700">
        Sim. Use o número de protocolo de cada registro para consultar o histórico (inclui eventos e respostas).
      </p>
    ),
    searchText: 'acessar anteriores histórico eventos respostas protocolo',
  },
  {
    id: 'erro003',
    category: 'Suporte',
    question: 'Recebi erro ao enviar. O que fazer?',
    answer: (
      <ul className="list-disc space-y-1 pl-5 text-slate-700">
        <li>Verifique conexão e tente novamente.</li>
        <li>Se houver anexos, confirme se você adicionou a descrição (texto alternativo/transcrição).</li>
        <li>Se persistir, use a Central 162 ou atendimento presencial.</li>
      </ul>
    ),
    searchText: 'erro enviar suporte conexão anexos descrição texto alternativo transcrição',
  },
  {
    id: 'cnpj-cpf',
    category: 'Cadastro',
    question: 'Posso usar CPF ou CNPJ?',
    answer: (
      <p className="text-slate-700">
        Quando a identificação é necessária, o sistema pode aceitar CPF e, em alguns casos, CNPJ (conforme o tipo de
        solicitação e regras de tramitação).
      </p>
    ),
    searchText: 'cpf cnpj identificação cadastro',
  },
]

const FAQ_CATEGORIES: Array<FaqCategory | 'Todas'> = ['Todas', 'Plataforma', 'Cadastro', 'Registros', 'Suporte']

const CHANNELS = [
  {
    title: 'Participa DF (online)',
    description: 'Registre sua manifestação com protocolo e acompanhe o andamento.',
    icon: MessageSquare,
    tone: 'blue' as const,
  },
  {
    title: 'Central 162',
    description: 'Atendimento telefônico com orientação e registro.',
    icon: Phone,
    tone: 'yellow' as const,
  },
  {
    title: 'Atendimento presencial',
    description: 'Nos órgãos do GDF, conforme horários e disponibilidade.',
    icon: MapPin,
    tone: 'green' as const,
  },
]

const FLOW_STEPS = [
  {
    title: 'Identifique o tipo e o assunto',
    description: 'Reclamação, denúncia, sugestão, elogio ou solicitação, com tema principal.',
    icon: BookOpen,
  },
  {
    title: 'Relate e anexe evidências',
    description: 'Texto e/ou anexos (imagem, áudio, vídeo) com descrição para acessibilidade.',
    icon: ImageIcon,
  },
  {
    title: 'Envie e receba protocolo',
    description: 'Protocolo automático e prazo inicial de resposta exibido na confirmação.',
    icon: BadgeCheck,
  },
]

function clampProtocol(raw: string) {
  return raw.replace(/[^A-Za-z0-9\-]/g, '').trim()
}

function toneToColor(tone: 'blue' | 'green' | 'yellow') {
  if (tone === 'green') return BRAND.green
  if (tone === 'yellow') return BRAND.yellow
  return BRAND.blue
}

function toneToBg(tone: 'blue' | 'green' | 'yellow') {
  if (tone === 'green') return 'rgba(var(--brand-green, 82 142 70), 0.12)'
  if (tone === 'yellow') return 'rgba(var(--brand-yellow, 230 172 46), 0.14)'
  return 'rgba(var(--brand-blue, 0 113 188), 0.10)'
}

export function HomePage() {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  // FAQ state
  const [faqCategory, setFaqCategory] = useState<(typeof FAQ_CATEGORIES)[number]>('Todas')
  const [faqQuery, setFaqQuery] = useState('')
  const [faqListRef] = useAutoAnimate<HTMLDivElement>({
    duration: reduceMotion ? 0 : 180,
    easing: 'ease-in-out',
  })

  // Track protocol state
  const [track, setTrack] = useState('')
  const [trackError, setTrackError] = useState<string | null>(null)

  const filteredFaq = useMemo(() => {
    const q = faqQuery.trim().toLowerCase()
    return FAQ.filter((item) => {
      const byCat = faqCategory === 'Todas' ? true : item.category === faqCategory
      const byQuery = q.length === 0 ? true : item.searchText.includes(q) || item.question.toLowerCase().includes(q)
      return byCat && byQuery
    })
  }, [faqCategory, faqQuery])

  function handleNewManifestation() {
    navigate('/manifestacoes/nova')
  }

  function handleTrackSubmit(e: FormEvent) {
    e.preventDefault()
    const clean = clampProtocol(track)

    if (!clean) {
      setTrackError('Digite um protocolo para acompanhar.')
      return
    }

    setTrackError(null)
    navigate(`/protocolos/${encodeURIComponent(clean)}`)
  }

  return (
    <main id="inicio" className="min-h-screen text-[rgb(var(--c-text))]">
      {/* 
        Home alinhada ao Manual de Identidade Visual (Ouvidoria GDF):
        - Tipografia: Visby (Regular/ExtraBold) — conforme manual
        - Paleta: azul, verde, amarelo e cinzas institucionais
      */}
      <style>{`
        .hero-bg {
          background:
            radial-gradient(1000px 520px at 10% 8%, rgba(var(--brand-blue, 0 113 188), 0.10), transparent 55%),
            radial-gradient(900px 460px at 92% 18%, rgba(var(--brand-green, 82 142 70), 0.10), transparent 58%),
            radial-gradient(760px 420px at 88% 92%, rgba(var(--brand-yellow, 230 172 46), 0.10), transparent 55%),
            linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.92));
        }
        .brand-grid {
          background-image:
            linear-gradient(to right, rgba(var(--brand-gray-2, 206 206 206), 0.22) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(var(--brand-gray-2, 206 206 206), 0.22) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: radial-gradient(circle at 35% 35%, black 35%, transparent 70%);
          opacity: 0.55;
        }
        .section-surface {
          background: rgb(var(--c-surface, 255 255 255));
          border: 1px solid rgba(var(--c-border, 206 206 206), 0.85);
          border-radius: 24px;
          box-shadow: var(--shadow-elev-1, 0 10px 30px rgba(17,24,39,.10));
        }
        .chip {
          border: 1px solid rgba(var(--c-border, 206 206 206), 0.9);
          background: rgba(255,255,255,0.75);
          border-radius: 999px;
          padding: 8px 12px;
        }
        .faq-summary::-webkit-details-marker { display:none; }
      `}</style>

      {/* Skip link */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow"
      >
        Pular para conteúdo
      </a>

      {/* HERO */}
      <section aria-label="Apresentação" className="relative overflow-hidden border-b border-slate-200">
        <div className="hero-bg absolute inset-0" aria-hidden="true" />
        <div className="brand-grid pointer-events-none absolute inset-0" aria-hidden="true" />

        <div className={CONTAINER}>
          <div id="conteudo" className="relative grid gap-10 py-12 sm:py-16 lg:grid-cols-12 lg:items-center">
            {/* Left */}
            <div className="lg:col-span-7">
              <div className="flex flex-wrap items-center gap-4">
                <img
                  src="/brand/participadf-azul.svg"
                  alt="Participa DF"
                  className="h-10 w-auto"
                  loading="eager"
                />
                <div className="h-6 w-px bg-slate-200" aria-hidden="true" />
                <img
                  src="/brand/logo-ouvidoria.png"
                  alt="Ouvidoria do Governo do Distrito Federal"
                  className="h-14 w-auto"
                  loading="eager"
                />
              </div>

              <h1 className="mt-7 text-balance text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
                <Balancer>Ouvidoria do DF com acesso simples, inclusivo e multicanal.</Balancer>
              </h1>

              <p className="mt-5 max-w-prose text-pretty text-base leading-relaxed text-slate-700 sm:text-lg">
                Registre sua manifestação por <strong>texto</strong>, <strong>áudio</strong>, <strong>imagem</strong> ou{' '}
                <strong>vídeo</strong>. A IZA pode organizar seu relato e ajudar a preencher o formulário passo a passo.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={handleNewManifestation}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2"
                  style={{ backgroundColor: BRAND.blue, outlineColor: BRAND.blue }}
                >
                  Registrar manifestação <ArrowRight className="h-5 w-5" />
                </button>

                <a
                  href="#acompanhar"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2"
                >
                  Acompanhar protocolo <ChevronRight className="h-5 w-5" />
                </a>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-700">
                <span className="chip inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" style={{ color: BRAND.green }} />
                  Conformidade WCAG 2.1 AA
                </span>
                <span className="chip inline-flex items-center gap-2">
                  <Clock className="h-4 w-4" style={{ color: BRAND.blue }} />
                  Protocolo automático
                </span>
                <span className="chip inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4" style={{ color: BRAND.yellow }} />
                  IZA (assistente de preenchimento)
                </span>
              </div>
            </div>

            {/* Right */}
            <div className="lg:col-span-5">
              <div className="section-surface p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <motion.img
                    src="/brand/iza-1.png"
                    alt="IZA, assistente virtual"
                    className="h-16 w-16 rounded-2xl border border-slate-200 bg-white object-cover"
                    initial={false}
                    animate={
                      reduceMotion
                        ? undefined
                        : {
                            y: [0, -6, 0],
                          }
                    }
                    transition={reduceMotion ? undefined : { duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
                  />

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-extrabold tracking-tight" style={{ color: BRAND.ink }}>
                        IZA
                      </p>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: 'rgba(var(--brand-blue, 0 113 188), 0.12)', color: BRAND.blue }}
                      >
                        Assistente
                      </span>
                    </div>

                    <p className="mt-1 text-sm leading-relaxed text-slate-700">
                      Abra o chat no canto inferior direito. A IZA organiza seu relato e ajuda a preencher o formulário
                      com você — passo a passo.
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold text-slate-700">Exemplo</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">
                    “Tem um buraco na Rua X, perto do nº 120. Está perigoso e já quase causou acidente.”
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="chip inline-flex items-center gap-2 text-sm text-slate-800">
                    <MessageSquare className="h-4 w-4" /> Texto
                  </span>
                  <span className="chip inline-flex items-center gap-2 text-sm text-slate-800">
                    <ImageIcon className="h-4 w-4" /> Imagem
                  </span>
                  <span className="chip inline-flex items-center gap-2 text-sm text-slate-800">
                    <VideoIcon className="h-4 w-4" /> Vídeo
                  </span>
                  <span className="chip inline-flex items-center gap-2 text-sm text-slate-800">
                    <Mic className="h-4 w-4" /> Áudio
                  </span>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  Observação: anexos exigem descrição (texto alternativo/transcrição) para garantir acessibilidade.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* QUICK ACTIONS + CHANNELS */}
      <section id="sobre" aria-label="Sobre a Ouvidoria" className="py-14 sm:py-16">
        <div className={CONTAINER}>
          <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-7">
              <h2 className="text-balance text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                <Balancer>O que é a Ouvidoria do DF?</Balancer>
              </h2>

              <div className="mt-4 space-y-3 text-slate-700">
                <p className="max-w-prose text-pretty leading-relaxed">
                  A Ouvidoria é um espaço para você se relacionar com o Governo do Distrito Federal, registrando sua
                  solicitação, reclamação, elogio, denúncia ou pedido de informação relacionado aos serviços prestados
                  pelo Governo.
                </p>

                <details className="group mt-2 rounded-2xl border border-slate-200 bg-white p-4">
                  <summary className="faq-summary flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-offset-2">
                    <span>Leia mais sobre a rede SIGO/DF</span>
                    <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                  </summary>
                  <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
                    <p>
                      As ouvidorias do GDF formam uma rede que integra o Sistema de Gestão de Ouvidoria do Distrito
                      Federal (SIGO/DF), coordenado pela Ouvidoria-Geral do DF (Controladoria-Geral do DF).
                    </p>
                    <p className="text-slate-600">
                      Na prática: você registra, recebe protocolo, e o encaminhamento segue o fluxo adequado.
                    </p>
                  </div>
                </details>
              </div>

              <div id="acompanhar" className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">Acompanhar protocolo</h3>
                    <p className="mt-1 text-sm text-slate-700">
                      Digite o número de protocolo para ver status e respostas do seu registro.
                    </p>
                  </div>

                  <span
                    className="hidden items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold sm:inline-flex"
                    style={{ background: 'rgba(var(--brand-yellow, 230 172 46), 0.15)', color: BRAND.ink }}
                  >
                    <Clock className="h-4 w-4" style={{ color: BRAND.yellow }} />
                    Prazo inicial: 10 dias
                  </span>
                </div>

                <form onSubmit={handleTrackSubmit} className="mt-4">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <label className="sr-only" htmlFor="protocolo">
                      Protocolo
                    </label>
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="protocolo"
                        value={track}
                        onChange={(e) => setTrack(e.target.value)}
                        placeholder="Ex.: DF-20260123-ABC123"
                        className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-offset-2"
                        style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.02)' }}
                        aria-invalid={!!trackError}
                        aria-describedby={trackError ? 'protocolo-erro' : undefined}
                      />
                    </div>

                    <button
                      type="submit"
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2"
                      style={{ backgroundColor: BRAND.blue, outlineColor: BRAND.blue }}
                    >
                      Consultar <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {trackError && (
                    <p id="protocolo-erro" className="mt-2 text-sm text-red-700">
                      {trackError}
                    </p>
                  )}
                </form>
              </div>
            </div>

            <div className="lg:col-span-5">
              <h3 className="text-base font-extrabold text-slate-900">Canais de atendimento</h3>
              <p className="mt-1 text-sm text-slate-700">Escolha o canal que melhor atende você.</p>

              <div className="mt-4 grid gap-3">
                {CHANNELS.map((c) => {
                  const Icon = c.icon
                  const accent = toneToColor(c.tone)
                  return (
                    <div key={c.title} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-xl"
                          style={{ background: toneToBg(c.tone) }}
                        >
                          <Icon className="h-5 w-5" style={{ color: accent }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{c.title}</p>
                          <p className="mt-1 text-sm leading-relaxed text-slate-700">{c.description}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ background: 'rgba(var(--brand-green, 82 142 70), 0.12)' }}
                  >
                    <Headphones className="h-5 w-5" style={{ color: BRAND.green }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">Precisa de ajuda para escrever?</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700">
                      A IZA pode conversar com você (inclusive por voz) e transformar sua explicação em um relato claro.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FLOW */}
      <section id="como-funciona" aria-label="Como funciona" className="border-t border-slate-200 bg-white py-14 sm:py-16">
        <div className={CONTAINER}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-balance text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                <Balancer>Como funciona</Balancer>
              </h2>
              <p className="mt-2 max-w-prose text-pretty text-sm leading-relaxed text-slate-700 sm:text-base">
                Um fluxo completo, claro e inclusivo — pensado para pessoas de todas as idades.
              </p>
            </div>

            <button
              type="button"
              onClick={handleNewManifestation}
              className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-offset-2 sm:self-auto"
            >
              <FilePlus2 className="h-4 w-4" />
              Começar agora
            </button>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {FLOW_STEPS.map((step) => {
              const Icon = step.icon
              return (
                <div key={step.title} className="rounded-3xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: 'rgba(var(--brand-blue, 0 113 188), 0.10)' }}
                    >
                      <Icon className="h-5 w-5" style={{ color: BRAND.blue }} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-extrabold text-slate-900">{step.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">{step.description}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-700">
                Dica: se você preferir, abra o chat e diga com suas palavras. A IZA ajuda a organizar e preencher.
              </p>
              <p className="text-sm font-semibold text-slate-900">A IZA não substitui você — ela facilita.</p>
            </div>
          </div>
        </div>
      </section>

      {/* IZA TUTORIAL */}
      <section id="iza" aria-label="Como usar a IZA" className="py-14 sm:py-16">
        <div className={CONTAINER}>
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6">
                <div
                  className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-[36px]"
                  style={{ background: 'rgba(var(--brand-yellow, 230 172 46), 0.14)' }}
                  aria-hidden="true"
                />
                <div
                  className="pointer-events-none absolute -left-10 -bottom-10 h-44 w-44 rounded-[36px]"
                  style={{ background: 'rgba(var(--brand-green, 82 142 70), 0.12)' }}
                  aria-hidden="true"
                />

                <div className="relative flex items-start gap-4">
                  <motion.img
                    src="/brand/iza-1.png"
                    alt="Mascote da IZA"
                    className="h-20 w-20 rounded-2xl border border-slate-200 bg-white object-cover"
                    initial={{ rotate: 0 }}
                    whileHover={reduceMotion ? undefined : { rotate: -1 }}
                    transition={{ type: 'spring', stiffness: 250, damping: 18 }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-slate-900">Como usar a IZA (em 30 segundos)</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700">
                      1) Conte o que aconteceu. 2) Se necessário, anexe evidências. 3) Confirme e envie.
                    </p>
                  </div>
                </div>

                <div className="relative mt-5 grid gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold text-slate-700">Passo 1</p>
                    <p className="mt-1 text-sm text-slate-700">Diga o que aconteceu, onde e quando.</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold text-slate-700">Passo 2</p>
                    <p className="mt-1 text-sm text-slate-700">
                      Se anexar, a IZA pede a descrição (texto alternativo/transcrição).
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold text-slate-700">Passo 3</p>
                    <p className="mt-1 text-sm text-slate-700">
                      Revise. Você recebe protocolo automático ao enviar.
                    </p>
                  </div>
                </div>

                <p className="relative mt-4 text-xs leading-relaxed text-slate-600">
                  Dica de acessibilidade: o painel fixo permite aumentar fonte, contraste e leitura em voz alta.
                </p>
              </div>
            </div>

            <div className="lg:col-span-7">
              <h2 className="text-balance text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                <Balancer>Uma experiência mais humana, sem perder rastreabilidade.</Balancer>
              </h2>
              <p className="mt-3 max-w-prose text-pretty text-sm leading-relaxed text-slate-700 sm:text-base">
                A IZA foi pensada para reduzir barreiras: pessoas idosas, com baixa inclusão digital ou com deficiência
                conseguem concluir o registro com menos esforço e mais segurança.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: 'rgba(var(--brand-blue, 0 113 188), 0.10)' }}
                    >
                      <Mic className="h-5 w-5" style={{ color: BRAND.blue }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-slate-900">Por voz, quando preferir</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">
                        Fale naturalmente: a IZA ajuda a transformar sua fala em campos do formulário.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: 'rgba(var(--brand-green, 82 142 70), 0.10)' }}
                    >
                      <ShieldCheck className="h-5 w-5" style={{ color: BRAND.green }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-slate-900">Acessibilidade de verdade</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">
                        Anexos com descrição, foco visível, contraste e leitura para reduzir barreiras.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: 'rgba(var(--brand-yellow, 230 172 46), 0.14)' }}
                    >
                      <BadgeCheck className="h-5 w-5" style={{ color: BRAND.yellow }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-slate-900">Protocolo e transparência</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">
                        Você recebe protocolo automático e consegue acompanhar todas as etapas.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                      <BookOpen className="h-5 w-5 text-slate-700" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-slate-900">Orientação clara</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">
                        Linguagem simples e feedback visual para reduzir erros e ansiedade.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-7">
                <button
                  type="button"
                  onClick={handleNewManifestation}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2"
                  style={{ backgroundColor: BRAND.blue, outlineColor: BRAND.blue }}
                >
                  Registrar manifestação <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" aria-label="Perguntas frequentes" className="border-t border-slate-200 bg-white py-14 sm:py-16">
        <div className={CONTAINER}>
          <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-4">
              <h2 className="text-balance text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                <Balancer>Perguntas frequentes</Balancer>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                Busque por palavras-chave e filtre por categoria.
              </p>

              <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4">
                <label className="sr-only" htmlFor="faq-search">
                  Buscar perguntas frequentes
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="faq-search"
                    value={faqQuery}
                    onChange={(e) => setFaqQuery(e.target.value)}
                    placeholder="Ex.: protocolo, cadastro, 162..."
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-offset-2"
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {FAQ_CATEGORIES.map((cat) => {
                    const active = cat === faqCategory
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFaqCategory(cat)}
                        className="rounded-full px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2"
                        style={{
                          background: active ? 'rgba(var(--brand-blue, 0 113 188), 0.14)' : 'rgba(15,23,42,0.04)',
                          color: active ? BRAND.blue : 'rgb(51 65 85)',
                          border: '1px solid rgba(var(--c-border, 206 206 206), 0.75)',
                        }}
                      >
                        {cat}
                      </button>
                    )
                  })}
                </div>

                <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                  Dica: se a dúvida estiver durante o preenchimento, a IZA pode orientar no chat.
                </div>
              </div>
            </div>

            <div className="lg:col-span-8">
              <div
                ref={faqListRef}
                className="grid gap-3"
                aria-live="polite"
                aria-relevant="additions removals"
              >
                {filteredFaq.map((item) => (
                  <details
                    key={item.id}
                    className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <summary className="faq-summary flex cursor-pointer list-none items-center justify-between gap-4 focus:outline-none focus:ring-2 focus:ring-offset-2">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-slate-900">{item.question}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          Categoria: <span className="font-semibold">{item.category}</span>
                        </p>
                      </div>
                      <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" />
                    </summary>
                    <div className="mt-3 border-t border-slate-200 pt-3 text-sm leading-relaxed text-slate-700">
                      {item.answer}
                    </div>
                  </details>
                ))}

                {filteredFaq.length === 0 && (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
                    <p className="text-sm font-semibold text-slate-900">Não encontrei essa pergunta.</p>
                    <p className="mt-1 text-sm text-slate-700">Tente outro termo ou selecione “Todas”.</p>
                  </div>
                )}
              </div>

              <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" style={{ color: BRAND.blue }} />
                    <p className="text-sm font-semibold text-slate-900">Quer registrar agora?</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleNewManifestation}
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2"
                    style={{ backgroundColor: BRAND.blue, outlineColor: BRAND.blue }}
                  >
                    Registrar manifestação <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-white py-10">
        <div className={CONTAINER}>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <img src="/brand/logo-ouvidoria.png" alt="Ouvidoria do GDF" className="h-12 w-auto" />
              <div className="h-6 w-px bg-slate-200" aria-hidden="true" />
              <p className="text-sm text-slate-700">
                Participa DF — Ouvidoria do Governo do Distrito Federal
              </p>
            </div>
            <p className="text-xs text-slate-500">
              Experiência demonstrativa (hackathon). Conteúdo e prazos podem variar conforme normativos.
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}

export default HomePage
