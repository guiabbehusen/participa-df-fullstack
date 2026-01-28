import * as React from 'react'
import { ExternalLink, Info, MapPin, Paperclip, ShieldCheck, UserRound } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'

function DetailBlock({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <details className="group rounded-2xl border border-[rgba(var(--c-border),0.85)] bg-[rgba(var(--c-surface),0.75)] p-4">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <span className="flex items-start gap-3">
          <span
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--c-primary),0.10)] text-[rgb(var(--c-primary))] ring-1 ring-[rgba(var(--c-primary),0.20)]"
            aria-hidden="true"
          >
            {icon}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-extrabold text-[rgb(var(--c-text))]">{title}</span>
            <span className="mt-1 block text-xs text-[rgba(var(--c-text),0.72)]">
              Clique para ver detalhes
            </span>
          </span>
        </span>
        <span
          aria-hidden="true"
          className="mt-1 h-6 w-6 shrink-0 rounded-full bg-[rgba(var(--c-border),0.25)] text-[rgba(var(--c-text),0.70)] ring-1 ring-[rgba(var(--c-border),0.55)] transition group-open:rotate-180"
          style={{ display: 'grid', placeItems: 'center' }}
        >
          ▾
        </span>
      </summary>

      <div className="mt-3 text-sm leading-relaxed text-[rgba(var(--c-text),0.82)]">{children}</div>
    </details>
  )
}

export function RegistrationGuidelines() {
  return (
    <Card id="orientacoes" className="scroll-mt-28">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">Guia rápido</Badge>
          <Badge>Segurança e acessibilidade</Badge>
        </div>
        <CardTitle className="mt-2">Orientações para registrar</CardTitle>
        <CardDescription>
          Um passo a passo simples para você registrar com clareza, segurança e inclusão.
        </CardDescription>
      </CardHeader>

      <div className="grid gap-3 md:grid-cols-2">
        <DetailBlock title="Acompanhamento e resposta" icon={<UserRound className="h-5 w-5" />}>
          <p>
            Você pode acompanhar seu registro e receber a resposta. Para isso, é importante{' '}
            <strong>se identificar</strong> (nome e e-mail no formulário).
          </p>
          <p className="mt-2">
            Se preferir, você pode registrar <strong>reclamação</strong> e <strong>denúncia</strong> sem se identificar,
            mas não poderá acompanhar nem receber a resposta por e-mail.
          </p>
        </DetailBlock>

        <DetailBlock title="Proteção ao denunciante" icon={<ShieldCheck className="h-5 w-5" />}>
          <p>
            Denúncias são tratadas com <strong>sigilo</strong>. A identidade do denunciante deve ser protegida.
          </p>
          <p className="mt-2">
            Pode confiar: sua segurança é prioridade. Descreva o máximo de detalhes do fato e do local, sem expor
            informações pessoais.
          </p>
        </DetailBlock>

        <DetailBlock title="Não informe dados pessoais no relato" icon={<Info className="h-5 w-5" />}>
          <p>
            Para proteger seus dados, evite escrever no texto do registro: <strong>CPF</strong>, <strong>e-mail</strong>,
            <strong>data de nascimento</strong> e outros dados pessoais.
          </p>
          <p className="mt-2">
            Se precisar se identificar para acompanhamento, use os campos de identificação do formulário.
          </p>
        </DetailBlock>

        <DetailBlock title="Um assunto por registro" icon={<MapPin className="h-5 w-5" />}>
          <p>
            Cada registro deve conter apenas <strong>1 assunto</strong>. Se você quiser tratar de temas diferentes (ex.:
            poda de árvore e tapa-buraco), faça <strong>2 registros</strong>.
          </p>
        </DetailBlock>
      </div>

      <div className="mt-4 rounded-2xl border border-[rgba(var(--c-border),0.85)] bg-[rgba(var(--c-surface),0.65)] p-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(var(--c-success),0.10)] text-[rgb(var(--c-success))] ring-1 ring-[rgba(var(--c-success),0.20)]"
            aria-hidden="true"
          >
            <Paperclip className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Passo a passo do registro</p>
            <p className="mt-1 text-xs text-[rgba(var(--c-text),0.72)]">
              Dica: anexe fotos/vídeos quando puder. Lembre de descrever o anexo para acessibilidade.
            </p>
          </div>
        </div>

        <ol className="mt-4 space-y-3">
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(var(--c-primary),0.10)] text-sm font-extrabold text-[rgb(var(--c-primary))] ring-1 ring-[rgba(var(--c-primary),0.20)]">
              1
            </span>
            <div className="text-sm text-[rgba(var(--c-text),0.82)]">
              <strong>Escreva os detalhes:</strong> o que aconteceu, quem está envolvido, quando, onde e como ocorreu.
            </div>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(var(--c-primary),0.10)] text-sm font-extrabold text-[rgb(var(--c-primary))] ring-1 ring-[rgba(var(--c-primary),0.20)]">
              2
            </span>
            <div className="text-sm text-[rgba(var(--c-text),0.82)]">
              <strong>A IZA sugere assuntos:</strong> selecione o assunto principal. Se nenhum servir, escreva outro.
            </div>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(var(--c-primary),0.10)] text-sm font-extrabold text-[rgb(var(--c-primary))] ring-1 ring-[rgba(var(--c-primary),0.20)]">
              3
            </span>
            <div className="text-sm text-[rgba(var(--c-text),0.82)]">
              <strong>Informe o local:</strong> cidade, bairro, endereço, CEP e pontos de referência.
            </div>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(var(--c-primary),0.10)] text-sm font-extrabold text-[rgb(var(--c-primary))] ring-1 ring-[rgba(var(--c-primary),0.20)]">
              4
            </span>
            <div className="text-sm text-[rgba(var(--c-text),0.82)]">
              <strong>Anexe evidências (opcional):</strong> fotos, áudio ou vídeo (máx. 25MB). Descreva o anexo.
            </div>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(var(--c-primary),0.10)] text-sm font-extrabold text-[rgb(var(--c-primary))] ring-1 ring-[rgba(var(--c-primary),0.20)]">
              5
            </span>
            <div className="text-sm text-[rgba(var(--c-text),0.82)]">
              <strong>Confirme:</strong> ao enviar, você recebe um protocolo para acompanhamento.
            </div>
          </li>
        </ol>

        <div className="mt-4 rounded-xl border border-[rgba(var(--c-border),0.85)] bg-white/70 p-3">
          <p className="text-xs text-[rgba(var(--c-text),0.76)]">
            Para assuntos do Governo Federal (ex.: INSS, Conecta SUS, gov.br), use o sistema{' '}
            <a
              className="font-semibold text-[rgb(var(--c-primary))] underline underline-offset-2"
              href="https://falabr.cgu.gov.br"
              target="_blank"
              rel="noreferrer"
            >
              Fala BR
              <ExternalLink className="ml-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
            </a>
            .
          </p>
        </div>
      </div>
    </Card>
  )
}
