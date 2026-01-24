import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, MessageCircle, Mic, Search } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'

export function HomePage() {
  const navigate = useNavigate()
  const [protocol, setProtocol] = useState('')

  const normalizedProtocol = useMemo(() => protocol.trim().toUpperCase(), [protocol])

  function submitTrack() {
    const p = normalizedProtocol
    if (!p) return
    navigate(`/protocolos/${encodeURIComponent(p)}`)
  }

  const FAQ = useMemo(
    () => [
      {
        q: 'Para que serve a plataforma Participa DF?',
        a: (
          <div className="space-y-2">
            <p>
              Esse canal foi feito para você acompanhar e participar das ações do Governo do Distrito Federal.
            </p>
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
        a: (
          <p>
            Você tem um cadastro único para os serviços de Ouvidoria e da Lei de Acesso à Informação (LAI), reunidos em um só lugar.
          </p>
        ),
      },
      {
        q: 'Qualquer pessoa pode usar o Participa DF?',
        a: (
          <p>
            Qualquer pessoa física ou jurídica pode usar o Participa DF para acessar os serviços de Ouvidoria e da Lei de Acesso à Informação (LAI).
          </p>
        ),
      },
      {
        q: 'Quais serviços posso solicitar pela Central 162?',
        a: (
          <p>
            Apenas serviços de Ouvidoria. O Serviço de Informação ao Cidadão continua com atendimento presencial nas ouvidorias do GDF, ou pela internet, aqui no Participa DF.
          </p>
        ),
      },
      {
        q: 'Já tinha cadastro no sistema de Ouvidoria (Ouv-DF). Preciso me cadastrar novamente aqui?',
        a: <p>Não. Você apenas precisará definir uma nova senha. Assim, os seus dados estarão mais seguros.</p>,
      },
      {
        q: 'Já tinha cadastro no sistema da Lei de Acesso à Informação (e-SIC DF). Preciso me cadastrar novamente aqui?',
        a: <p>Sim. Faça um novo cadastro para que seus dados fiquem mais seguros.</p>,
      },
      {
        q: 'Tenho registros em andamento. Com o Participa DF eles serão respondidos?',
        a: (
          <p>
            Sim. Todos os registros de Ouvidoria e da Lei de Acesso à Informação feitos antes do Participa DF deverão ser respondidos dentro do prazo legal.
          </p>
        ),
      },
      {
        q: 'Como acessar meus registros anteriores?',
        a: <p>Registros de Ouvidoria: serão acessados aqui, no Participa DF.</p>,
      },
      {
        q: 'CPF bloqueado por falecimento do usuário (ERRO 003): o que fazer?',
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

  return (
    <div className="space-y-8">
      {/* HERO */}
      <section className="surface p-6 md:p-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            {/* Lockup de marcas (manual) */}
            <div className="flex flex-wrap items-center gap-4">
              <img
                src="/brand/participadf-azul.svg"
                alt="Participa DF"
                className="h-10 w-auto"
              />
              <div className="hidden h-10 w-px bg-[rgba(var(--c-border),0.90)] md:block" aria-hidden="true" />
              <img
                src="/brand/logo-ouvidoria.png"
                alt="Ouvidoria do Governo do Distrito Federal"
                className="h-12 w-auto"
              />
            </div>

            <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-[rgb(var(--c-text))] md:text-4xl">
              Registre sua manifestação com simplicidade, inclusão e acessibilidade.
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[rgba(var(--c-text),0.80)]">
              Aqui você pode enviar <span className="font-semibold">reclamação</span>, <span className="font-semibold">denúncia</span>,
              <span className="font-semibold"> sugestão</span>, <span className="font-semibold">elogio</span> ou <span className="font-semibold">solicitação</span>
              por texto e anexos (imagem, áudio e vídeo). O protocolo é gerado automaticamente.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="info">PWA</Badge>
              <Badge>WCAG 2.1 AA</Badge>
              <Badge variant="success">Texto · Áudio · Imagem · Vídeo</Badge>
              <Badge variant="warning">Opção de anonimato</Badge>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/manifestacoes/nova">
                <Button className="px-6">Iniciar manifestação</Button>
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
          </div>

          {/* Coluna direita (diferenciais) */}
          <div className="w-full max-w-md space-y-4">
            <div className="glass p-6">
              <div className="flex items-start gap-4">
                <img
                  src="/brand/iza-1.png"
                  alt="Mascote da IZA"
                  className="h-14 w-14 rounded-2xl bg-white/70 p-2 shadow-sm ring-1 ring-black/5 animate-float"
                  loading="lazy"
                />
                <div>
                  <p className="text-sm font-extrabold tracking-wide text-[rgb(var(--c-text))]">Assistente IZA</p>
                  <p className="mt-2 text-sm leading-relaxed text-[rgba(var(--c-text),0.78)]">
                    Use o chat no canto inferior direito. A IZA ajuda a organizar seu relato e preencher o formulário.
                    Se quiser, ela também lê as mensagens em voz alta.
                  </p>
                  <p className="mt-3 text-xs text-[rgba(var(--c-text),0.70)]">
                    Dica: anexos exigem descrição (texto alternativo/transcrição) para acessibilidade.
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
                <Button
                  type="button"
                  onClick={submitTrack}
                  aria-label="Acompanhar protocolo"
                  className="shrink-0"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Ver
                </Button>
              </div>

              <p className="mt-2 text-xs text-[rgba(var(--c-text),0.70)]">
                Se acabou de enviar, copie o protocolo na tela de sucesso.
              </p>
            </div>
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
                <p className="mt-2 text-sm text-[rgba(var(--c-text),0.78)]">
                  Clique no ícone de chat no canto inferior direito.
                </p>
              </div>

              <div className="rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] p-4">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-[rgb(var(--c-primary))]" aria-hidden="true" />
                  <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">2) Conte o que aconteceu</p>
                </div>
                <p className="mt-2 text-sm text-[rgba(var(--c-text),0.78)]">
                  Você pode digitar ou falar. Tente incluir: o quê, onde e quando.
                </p>
              </div>

              <div className="rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[rgb(var(--c-success))]" aria-hidden="true" />
                  <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">3) Revise e envie</p>
                </div>
                <p className="mt-2 text-sm text-[rgba(var(--c-text),0.78)]">
                  A IZA prepara um rascunho. Você pode enviar no formulário e gerar o protocolo.
                </p>
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm">
            <div className="glass p-6">
              <div className="flex items-center gap-4">
                <img
                  src="/brand/iza-1.png"
                  alt="IZA, assistente virtual"
                  className="h-20 w-20 rounded-3xl bg-white/70 p-3 shadow-sm ring-1 ring-black/5 animate-float"
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

      {/* FAQ */}
      <section className="surface p-6 md:p-8">
        <h2 className="text-2xl font-extrabold tracking-tight text-[rgb(var(--c-text))]">Perguntas frequentes</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[rgba(var(--c-text),0.80)]">
          Reunimos algumas dúvidas comuns sobre o Participa DF e o uso do canal de Ouvidoria.
        </p>

        <div className="mt-6 space-y-3">
          {FAQ.map((item, idx) => (
            <details
              key={idx}
              className="group rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] p-4"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="text-sm font-extrabold text-[rgb(var(--c-text))]">{item.q}</span>
                <span
                  aria-hidden="true"
                  className="rounded-full border border-[rgba(var(--c-border),0.75)] bg-white/70 px-3 py-1 text-xs font-semibold text-[rgba(var(--c-text),0.75)]"
                >
                  Abrir
                </span>
              </summary>
              <div className="mt-3 text-sm leading-relaxed text-[rgba(var(--c-text),0.80)]">{item.a}</div>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
