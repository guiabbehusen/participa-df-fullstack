import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronRight, MessageCircle, Mic, Search, Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'

type FaqItem = {
  q: string
  a: JSX.Element
  tags?: string[]
}

function normalize(s: string) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

export function HomePage() {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  const [protocol, setProtocol] = useState('')
  const [faqQuery, setFaqQuery] = useState('')
  const [activeFaq, setActiveFaq] = useState(0)

  const normalizedProtocol = useMemo(() => protocol.trim().toUpperCase(), [protocol])

  function submitTrack() {
    const p = normalizedProtocol
    if (!p) return
    navigate(`/protocolos/${encodeURIComponent(p)}`)
  }

  const FAQ = useMemo<FaqItem[]>(
    () => [
      {
        q: 'Para que serve a plataforma Participa DF?',
        tags: ['participa df', 'serviços', 'ouvidoria', 'e-sic'],
        a: (
          <div className="space-y-2">
            <p>Esse canal foi feito para você acompanhar e participar das ações do Governo do Distrito Federal.</p>
            <p>
              Aqui, você encontra dois importantes serviços:
              <span className="font-semibold"> Ouvidoria (Ouv-DF)</span> e o
              <span className="font-semibold"> Serviço de Informações ao Cidadão (e-SIC DF)</span>.
            </p>
          </div>
        ),
      },
      {
        q: 'Qual benefício de usar esta plataforma?',
        tags: ['benefício', 'cadastro único', 'lai'],
        a: (
          <p>
            Você tem um cadastro único para os serviços de Ouvidoria e da Lei de Acesso à Informação (LAI), reunidos em um só lugar.
          </p>
        ),
      },
      {
        q: 'Qualquer pessoa pode usar o Participa DF?',
        tags: ['pessoa física', 'pessoa jurídica'],
        a: (
          <p>
            Qualquer pessoa física ou jurídica pode usar o Participa DF para acessar os serviços de Ouvidoria e da Lei de Acesso à Informação (LAI).
          </p>
        ),
      },
      {
        q: 'Quais serviços posso solicitar pela Central 162?',
        tags: ['162', 'central', 'serviços'],
        a: (
          <p>
            Apenas serviços de Ouvidoria. O Serviço de Informação ao Cidadão continua com atendimento presencial nas ouvidorias do GDF, ou pela internet, aqui no Participa DF.
          </p>
        ),
      },
      {
        q: 'Já tinha cadastro no sistema de Ouvidoria (Ouv-DF). Preciso me cadastrar novamente aqui?',
        tags: ['cadastro', 'ouv-df'],
        a: <p>Não. Você apenas precisará definir uma nova senha. Assim, os seus dados estarão mais seguros.</p>,
      },
      {
        q: 'Já tinha cadastro no sistema da Lei de Acesso à Informação (e-SIC DF). Preciso me cadastrar novamente aqui?',
        tags: ['cadastro', 'e-sic', 'lai'],
        a: <p>Sim. Faça um novo cadastro para que seus dados fiquem mais seguros.</p>,
      },
      {
        q: 'Tenho registros em andamento. Com o Participa DF eles serão respondidos?',
        tags: ['registros', 'prazo', 'andamento'],
        a: (
          <p>
            Sim. Todos os registros de Ouvidoria e da Lei de Acesso à Informação feitos antes do Participa DF deverão ser respondidos dentro do prazo legal.
          </p>
        ),
      },
      {
        q: 'Como acessar meus registros anteriores?',
        tags: ['registros anteriores'],
        a: <p>Registros de Ouvidoria: serão acessados aqui, no Participa DF.</p>,
      },
      {
        q: 'CPF bloqueado por falecimento do usuário (ERRO 003): o que fazer?',
        tags: ['cpf', 'erro 003', 'falecimento'],
        a: (
          <div className="space-y-2">
            <p>
              Para ter acesso aos registros realizados por um CPF bloqueado por falecimento do usuário, compareça pessoalmente a uma das ouvidorias do Governo do DF,
              com documentos que comprovem a relação com a pessoa falecida.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>
                <span className="font-semibold">Herdeiro legítimo</span>: certidão de óbito do falecido, documento de identificação, certidão de nascimento, certidão de casamento da pessoa falecida.
              </li>
              <li>
                <span className="font-semibold">Herdeiro testamentário</span>: decisão judicial que determine o registro, arquivamento e cumprimento do testamento.
              </li>
              <li>
                <span className="font-semibold">Inventariante extrajudicial</span>: certidão ou escritura pública (cartório de notas ou ofício de justiça) que comprove o processamento do inventário e a indicação como inventariante.
              </li>
              <li>
                <span className="font-semibold">Inventariante judicial</span>: decisão judicial que autorizou a inventariança; termo de compromisso assinado; certidão do Juízo do Inventário confirmando que o inventariante não foi afastado.
              </li>
              <li>
                <span className="font-semibold">Representante</span>: procuração com poderes específicos.
              </li>
            </ul>
            <p className="text-sm">
              Atenção: utilizamos a base da Receita Federal para o bloqueio. Se o CPF foi bloqueado indevidamente, entre em contato com a Ouvidoria-Geral:
              <span className="font-semibold"> ouvidoriageral@cg.df.gov.br</span>.
            </p>

            <p className="text-sm">
              Endereços das ouvidorias:
              <a
                className="ml-1 font-semibold text-[rgb(var(--c-primary))] underline underline-offset-2"
                href="https://www.ouvidoria.df.gov.br/texto-endereco-das-ouvidorias/"
                target="_blank"
                rel="noreferrer"
              >
                ver unidades de atendimento
              </a>
              .
            </p>
          </div>
        ),
      },
      {
        q: 'Por que é necessário vincular um CPF à conta CNPJ no ParticipaDF?',
        tags: ['cpf', 'cnpj', 'segurança'],
        a: (
          <div className="space-y-2">
            <p>
              A vinculação é necessária para garantir autenticidade e segurança das informações. Isso ajuda a evitar fraudes e assegura que apenas usuários legítimos tenham acesso aos serviços.
            </p>
            <p className="text-sm">
              Se precisar de apoio, procure uma unidade de ouvidoria.
              <a
                className="ml-1 font-semibold text-[rgb(var(--c-primary))] underline underline-offset-2"
                href="https://www.ouvidoria.df.gov.br/texto-endereco-das-ouvidorias/"
                target="_blank"
                rel="noreferrer"
              >
                Encontre a mais próxima
              </a>
              .
            </p>
          </div>
        ),
      },
    ],
    [],
  )

  const filteredFaq = useMemo(() => {
    const q = normalize(faqQuery)
    if (!q) return FAQ

    return FAQ.filter((item) => {
      const inQ = normalize(item.q).includes(q)
      const inTags = (item.tags || []).some((t) => normalize(t).includes(q))
      return inQ || inTags
    })
  }, [FAQ, faqQuery])

  useEffect(() => {
    // Se o filtro reduzir a lista e o índice ficar inválido, corrige.
    if (activeFaq >= filteredFaq.length) setActiveFaq(0)
  }, [activeFaq, filteredFaq.length])

  const activeItem = filteredFaq[activeFaq] || filteredFaq[0]

  return (
    <div className="space-y-10">
      {/* HERO */}
      <section className="surface relative overflow-hidden p-6 md:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(1100px_circle_at_12%_12%,rgba(var(--c-primary),0.10),transparent_45%),radial-gradient(900px_circle_at_88%_18%,rgba(var(--c-warning),0.10),transparent_40%),radial-gradient(900px_circle_at_60%_95%,rgba(var(--c-success),0.08),transparent_45%)]"
        />

        <div className="relative z-[1]">
          <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
            <motion.div
              className="flex-1"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {/* Lockup de marcas */}
              <div className="flex flex-wrap items-center gap-4">
                <img src="/brand/participadf-azul.svg" alt="Participa DF" className="h-10 w-auto" />
                <div className="hidden h-10 w-px bg-[rgba(var(--c-border),0.90)] md:block" aria-hidden="true" />
                <img
                  src="/brand/logo-ouvidoria.png"
                  alt="Ouvidoria do Governo do Distrito Federal"
                  className="h-12 w-auto"
                />
              </div>

              <h1 className="mt-7 text-3xl font-extrabold tracking-tight text-[rgb(var(--c-text))] md:text-4xl">
                Ouvidoria digital com foco em inclusão e acessibilidade.
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-relaxed text-[rgba(var(--c-text),0.80)]">
                Registre <span className="font-semibold">reclamação</span>, <span className="font-semibold">denúncia</span>,{' '}
                <span className="font-semibold">sugestão</span>, <span className="font-semibold">elogio</span> ou{' '}
                <span className="font-semibold">solicitação</span> por texto e anexos (imagem, áudio e vídeo). O protocolo é gerado automaticamente.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <Badge variant="info">PWA</Badge>
                <Badge>WCAG 2.1 AA</Badge>
                <Badge variant="success">Texto · Áudio · Imagem · Vídeo</Badge>
                <Badge variant="warning">Opção de anonimato</Badge>
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/manifestacoes/nova">
                  <Button className="px-6">
                    Iniciar manifestação
                    <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                  </Button>
                </Link>

                <Button
                  type="button"
                  variant="secondary"
                  className="px-6"
                  onClick={() => {
                    const el = document.getElementById('acompanhar-protocolo')
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                >
                  Acompanhar protocolo
                </Button>

                <a href="#como-funciona" className="hidden sm:inline">
                  <Button variant="ghost" className="px-3">Como funciona</Button>
                </a>
              </div>
            </motion.div>

            {/* Coluna direita: ações + IZA */}
            <motion.div
              className="w-full max-w-md space-y-4"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.05 }}
            >
              <div className="glass p-6">
                <div className="flex items-start gap-4">
                  <img
                    src="/brand/iza-1.png"
                    alt="Mascote da IZA"
                    className="h-14 w-14 rounded-2xl bg-white/70 p-2 shadow-sm ring-1 ring-black/5 animate-float"
                    loading="lazy"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[rgb(var(--c-primary))]" aria-hidden="true" />
                      <p className="text-sm font-extrabold tracking-wide text-[rgb(var(--c-text))]">Assistente IZA</p>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-[rgba(var(--c-text),0.78)]">
                      Use o chat no canto inferior direito. A IZA ajuda a organizar o relato, orientar anexos e preencher o formulário.
                    </p>
                    <p className="mt-3 text-xs text-[rgba(var(--c-text),0.70)]">
                      Dica: anexos exigem descrição (texto alternativo/transcrição) para garantir acessibilidade.
                    </p>
                  </div>
                </div>
              </div>

              <div id="acompanhar-protocolo" className="glass p-6">
                <p className="text-sm font-extrabold tracking-wide text-[rgb(var(--c-text))]">Acompanhar protocolo</p>
                <p className="mt-2 text-sm text-[rgba(var(--c-text),0.78)]">
                  Digite o número do protocolo para ver o status e detalhes da sua manifestação.
                </p>

                <div className="mt-4 flex gap-2">
                  <Input
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value)}
                    placeholder="Ex.: DF-20260123-AB12CD34"
                    aria-label="Número do protocolo"
                  />
                  <Button type="button" onClick={submitTrack} aria-label="Acompanhar protocolo" className="shrink-0">
                    <Search className="h-4 w-4" aria-hidden="true" />
                    Ver
                  </Button>
                </div>

                <p className="mt-2 text-xs text-[rgba(var(--c-text),0.70)]">
                  Se acabou de enviar, copie o protocolo na tela de sucesso.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>1) Identificação</CardTitle>
            <CardDescription>
              Escolha o tipo, o assunto e descreva o tema. Para elogio/sugestão/solicitação, a identificação é obrigatória.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2) Relato e anexos</CardTitle>
            <CardDescription>
              Escreva o que aconteceu (o quê, onde, quando) e o impacto. Você pode anexar imagem, áudio e vídeo.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3) Enviar e receber protocolo</CardTitle>
            <CardDescription>
              Ao enviar, você recebe um protocolo automaticamente. Prazo inicial de resposta: 10 dias.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      {/* TUTORIAL IZA */}
      <section className="surface p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <h2 className="text-2xl font-extrabold tracking-tight text-[rgb(var(--c-text))]">Como usar a IZA</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[rgba(var(--c-text),0.80)]">
              A IZA é uma assistente que ajuda você a montar um relato completo. Ela entende texto e também pode conversar por voz.
              O objetivo é facilitar para pessoas com pouca familiaridade digital, idosos e pessoas com deficiência.
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] p-4">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-[rgb(var(--c-primary))]" aria-hidden="true" />
                  <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">1) Abra o chat</p>
                </div>
                <p className="mt-2 text-sm text-[rgba(var(--c-text),0.78)]">Clique no ícone de chat no canto inferior direito.</p>
              </div>

              <div className="rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] p-4">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-[rgb(var(--c-primary))]" aria-hidden="true" />
                  <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">2) Conte o que aconteceu</p>
                </div>
                <p className="mt-2 text-sm text-[rgba(var(--c-text),0.78)]">Você pode digitar ou falar. Tente incluir: o quê, onde e quando.</p>
              </div>

              <div className="rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[rgb(var(--c-success))]" aria-hidden="true" />
                  <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">3) Revise e envie</p>
                </div>
                <p className="mt-2 text-sm text-[rgba(var(--c-text),0.78)]">A IZA prepara um rascunho. Você pode enviar no formulário e gerar o protocolo.</p>
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm">
            <div className="glass p-6">
              <div className="flex items-center gap-4">
                <motion.img
                  src="/brand/iza-1.png"
                  alt="IZA, assistente virtual"
                  className="h-20 w-20 rounded-3xl bg-white/70 p-3 shadow-sm ring-1 ring-black/5"
                  animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
                  transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div>
                  <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Dica de acessibilidade</p>
                  <p className="mt-2 text-sm text-[rgba(var(--c-text),0.78)]">
                    Se anexar imagem, áudio ou vídeo, informe a descrição. Isso garante que sua manifestação seja acessível e bem encaminhada.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ PREMIUM */}
      <section className="surface p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-[rgb(var(--c-text))]">Perguntas frequentes</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[rgba(var(--c-text),0.80)]">
              Encontre respostas rápidas sobre o Participa DF e o canal de Ouvidoria.
            </p>
          </div>

          <div className="w-full max-w-sm">
            <label htmlFor="faq-search" className="sr-only">Buscar no FAQ</label>
            <Input
              id="faq-search"
              value={faqQuery}
              onChange={(e) => setFaqQuery(e.target.value)}
              placeholder="Buscar por palavra-chave (ex.: 162, cadastro, CPF)…"
              aria-label="Buscar perguntas frequentes"
            />
            <p className="mt-2 text-xs text-[rgba(var(--c-text),0.70)]">
              {filteredFaq.length} resultado(s).
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] p-2">
              <ul className="space-y-1" aria-label="Lista de perguntas frequentes">
                {filteredFaq.map((item, idx) => {
                  const active = idx === activeFaq
                  return (
                    <li key={item.q}>
                      <button
                        type="button"
                        onClick={() => setActiveFaq(idx)}
                        className={[
                          'w-full rounded-xl px-3 py-3 text-left text-sm font-semibold',
                          'border border-transparent hover:bg-[rgba(var(--c-border),0.20)]',
                          active ? 'bg-[rgba(var(--c-primary),0.10)] text-[rgb(var(--c-text))] border-[rgba(var(--c-primary),0.18)]' : 'text-[rgba(var(--c-text),0.86)]',
                        ].join(' ')}
                        aria-current={active ? 'true' : undefined}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="leading-relaxed">{item.q}</span>
                          <ChevronRight className={['mt-0.5 h-4 w-4 shrink-0', active ? 'text-[rgb(var(--c-primary))]' : 'text-[rgba(var(--c-text),0.45)]'].join(' ')} aria-hidden="true" />
                        </div>
                      </button>
                    </li>
                  )
                })}

                {filteredFaq.length === 0 && (
                  <li className="p-4 text-sm text-[rgba(var(--c-text),0.75)]">
                    Nenhuma pergunta encontrada para o termo informado.
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="md:col-span-7">
            <div className="glass p-6">
              {activeItem ? (
                <motion.div
                  key={activeItem.q}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">{activeItem.q}</p>
                  <div className="mt-4 text-sm leading-relaxed text-[rgba(var(--c-text),0.80)]">{activeItem.a}</div>

                  <div className="mt-6 rounded-2xl border border-[rgba(var(--c-border),0.70)] bg-[rgba(var(--c-surface),0.80)] p-4">
                    <p className="text-xs font-extrabold text-[rgba(var(--c-text),0.75)]">Precisa de ajuda agora?</p>
                    <p className="mt-2 text-sm text-[rgba(var(--c-text),0.78)]">
                      Abra o chat da IZA no canto inferior direito e descreva sua dúvida em uma frase. Ela ajuda a organizar o relato e preencher o formulário.
                    </p>
                  </div>
                </motion.div>
              ) : (
                <p className="text-sm text-[rgba(var(--c-text),0.78)]">Selecione uma pergunta para ver a resposta.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
