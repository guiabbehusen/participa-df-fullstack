# Participa DF — Ouvidoria (PWA + IZA Assistente)

Aplicação **fullstack** para registro e acompanhamento de manifestações (Ouvidoria) com foco em **acessibilidade (WCAG 2.1 AA)**, experiência multicanal (texto, imagem, áudio, vídeo) e apoio inteligente via **IZA**, uma assistente virtual que **conversa por voz** e **ajuda a preencher o formulário automaticamente**.

> **Link do vídeo demo:** _https://www.youtube.com/watch?v=g3veqcnv2Xg_

---

## Sumário
- [Visão geral](#visão-geral)
- [Principais diferenciais](#principais-diferenciais)
- [Arquitetura do projeto](#arquitetura-do-projeto)
- [Como rodar (tutorial)](#como-rodar-tutorial)
- [Banco de dados (PostgreSQL)](#banco-de-dados-postgresql)
- [Docker (ambiente local)](#docker-ambiente-local)
- [PWA (como validar)](#pwa-como-validar)
- [IZA: IA generativa + modo conversa (ênfase)](#iza-ia-generativa--modo-conversa-ênfase)
- [Ollama (motor de IA da IZA)](#ollama-motor-de-ia-da-iza)
- [Formulário: autopreenchimento assistido pela IZA](#formulário-autopreenchimento-assistido-pela-iza)
- [Anexos + acessibilidade + transcrição automática (Speech-to-Text)](#anexos--acessibilidade--transcrição-automática-speech-to-text)
- [Acessibilidade (Perfis e Ferramentas)](#acessibilidade-perfis-e-ferramentas)
- [VLibras (Libras)](#vlibras-libras)
- [API / Swagger](#api--swagger)
- [Identidade visual e conteúdo](#identidade-visual-e-conteúdo)
- [Troubleshooting](#troubleshooting)
- [Uso de IA no projeto](#uso-de-ia-no-projeto)

---

## Visão geral

O **Participa DF — Ouvidoria** é um PWA que permite ao cidadão registrar manifestações por múltiplos canais (texto/áudio/imagem/vídeo) e receber um **protocolo** automaticamente.  
O projeto inclui a **IZA**, uma assistente virtual que:
- conduz o usuário no passo a passo do registro;
- esclarece dúvidas;
- **conversa por voz (sem precisar digitar)**; e
- **preenche automaticamente campos do formulário** com base no relato e anexos.

---

## Principais diferenciais

### Acessibilidade (critério central)
- Perfis prontos: **Baixa visão**, **Habilidades motoras**, **Daltonismo**, **Epilepsia/sensibilidade**, **TDAH**, **Dislexia**, **Deficiência auditiva**.
- Ferramentas finas: **alto contraste**, **monocromático**, ajustes de **fonte**, **espaçamento de linhas**, **atalhos de teclado**, **índice automático da página**, **cursor alternativo**, **leitor de texto ao passar o mouse**, **silenciar sons**.
- Integração com **VLibras**.

### Multicanalidade real
- Registro por **texto** e anexos (imagem/áudio/vídeo).
- Para acessibilidade: anexos exigem **descrição / texto alternativo / transcrição**.

### IZA (IA generativa + conversa por voz)
- Chat com **IA generativa via Ollama** (simulando a IZA).  
  O motor é **facilmente substituível** por outro provider/modelo.
- Modo **“Conversar”**: o usuário pode **falar**, a IZA **ouve, pensa e responde por voz**, mantendo uma experiência hands-free.
- A IZA consegue **atualizar o rascunho** e **preencher o formulário** conforme a conversa evolui.

### Persistência completa
- Dados armazenados em **PostgreSQL** (manifestação + anexos).
- Acompanhamento de protocolo e visualização de resposta simulada (para demonstrar o ciclo de retorno ao cidadão).

### Anonimato opcional
Garante o anonimato opcional (conforme edital), permitindo que o cidadão escolha se identificar ou não, mas gerando protocolo em ambos os casos.

---

## Arquitetura do projeto

```
backend/   → FastAPI (Uvicorn) + PostgreSQL + endpoints REST (Swagger)
frontend/  → Vite + React + Tailwind + shadcn/ui + PWA + A11y Dock + Chat IZA
```

- **Frontend**: experiência “GovTech premium” com UI consistente e componentes acessíveis.
- **Backend**: API com validação e armazenamento; expõe documentação via Swagger.
- **IZA**: rota dedicada para chat; usa **Ollama** quando disponível e faz **fallback para modo simulado** quando backend/ollama estiverem indisponíveis.

---

## Como rodar (tutorial)

### Pré-requisitos
- **Node.js 18+**
- **Python 3.10+**
- **PostgreSQL 14+**
- (Opcional, recomendado) **Ollama** instalado e rodando localmente

---

### 1) Backend (API)

#### 1.1) Criar ambiente virtual e instalar dependências
```bash
cd backend

python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

#### 1.2) Variáveis de ambiente
Crie um arquivo `.env` em `backend/` (ou exporte no terminal) com, no mínimo:

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/participa_df
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173
MAX_FILE_MB=25
```

> Ajuste usuário/senha/host conforme seu PostgreSQL.

#### 1.3) Subir a API
```bash
uvicorn app.main:app --reload --port 8000
```

API em: `http://127.0.0.1:8000`

---

### 2) Frontend (web/PWA)

```bash
cd frontend
npm install
npm run dev
```

Frontend em: `http://localhost:5173`

> Em modo `dev`, o Service Worker é normalmente **desativado** (por design) para evitar cache/reload indesejado.


Para testar como **PWA (instalável/offline)**, rode:

```bash
npm run pwa
```

Isso compila (`build`) e serve (`preview`) o app em modo produção (ex.: `http://localhost:4173`).

---

## Banco de dados (PostgreSQL)

- O projeto usa **PostgreSQL** para armazenar:
  - manifestações (tipo, assunto, tema, relato, anonimato/identificação, protocolo etc.)
  - anexos (imagem/áudio/vídeo) e metadados de acessibilidade (alt text / descrição / transcrição)

### Criar banco rapidamente (exemplo)
```sql
CREATE DATABASE participa_df;
```

### Health check
- O backend expõe um endpoint de health que indica se o banco está conectado.

---

## Docker (ambiente local)

O Docker é opcional, mas recomendado para **subir rapidamente o PostgreSQL** sem instalar o banco “na mão”.  
Isso facilita a avaliação e padroniza o ambiente em qualquer máquina.

### Subir apenas o PostgreSQL via Docker Compose

1) Crie um arquivo `docker-compose.yml` na **raiz do repositório** (ou use o existente, se você já tiver um):

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: participa_df_db
    environment:
      POSTGRES_DB: participa_df
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - participa_df_db:/var/lib/postgresql/data

volumes:
  participa_df_db:
```

2) Suba o banco:

```bash
docker compose up -d
```

3) Aponte o backend para esse banco (no `backend/.env`):

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/participa_df
```

4) Rode o backend normalmente:

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

### Parar e remover (quando quiser)

```bash
docker compose down
```

> Dica: se quiser apagar **também os dados persistidos** (volume), use:
> ```bash
> docker compose down -v
> ```

### Observações
- Em Windows/macOS, normalmente é necessário ter **Docker Desktop** instalado e rodando.
- As credenciais (`postgres/postgres`) são adequadas para desenvolvimento local. Em produção, use senhas fortes e secrets.

---

## PWA (como validar)

O projeto é um **PWA** (manifest + service worker) via configuração no frontend (Vite).

### Como validar corretamente
O comportamento “real” de PWA aparece em **produção/preview**, não no `dev`.

```bash
cd frontend
# modo PWA (build + preview)
npm run pwa
```

> Alternativa (equivalente ao comando acima):
> ```bash
> npm run build
> npm run preview
> ```

Abra o `preview` (geralmente `http://localhost:4173`) e confira:
- DevTools → **Application → Manifest**
- DevTools → **Application → Service Workers** (status “activated”)
- opção **Instalar** (Chrome/Edge)

> Se a API estiver em outra porta/domínio, ajuste `CORS_ORIGINS` no backend ou configure proxy no preview.

---

## IZA: IA generativa + modo conversa (ênfase)

A IZA é a assistente virtual do Participa DF e atua em duas frentes:

### 1) Chat assistivo
- responde dúvidas de forma contextual;
- pede informações faltantes (o quê/onde/quando/impacto);
- reforça orientações de privacidade (não inserir dados pessoais no relato).

### 2) **Modo “Conversar” (voz)**
- o usuário clica em **Conversar** e pode **falar** sem digitar;
- a IZA **escuta**, processa e **responde por voz**;
- o fluxo foi pensado para inclusão (baixa letracia digital, idosos, baixa visão etc.).

### Motor de IA (Ollama) e substituição
- A implementação atual usa **Ollama** como IA generativa **para simular a IZA**.
- A integração é **modular**: é fácil substituir por outro modelo/provider (local ou remoto).

### Fallback (modo simulado)
Se o backend/Ollama não estiverem disponíveis, o chat opera em modo **simulado**, mantendo:
- fluxo de orientação;
- sugestões de tipo/assunto/tema por heurísticas;
- atualização do rascunho sem travar o app.

---


## Ollama (motor de IA da IZA)

A IZA utiliza um modelo local via **Ollama** como motor de IA generativa para simular o comportamento do assistente.

- Modelo utilizado: **`qwen2.5:7b-instruct`**
- **Tamanho**: o download pode levar alguns minutos (aprox. **4,5 GB**, dependendo da versão/quantização).
- Importante: **o site e o backend funcionam sem o Ollama**.  
  Sem ele, apenas a parte de **IA generativa da IZA** não estará disponível (o chat pode operar em **modo simulado** para não travar o fluxo).

### Instalação do Ollama
1) Instale o Ollama:
- Acesse o site do Ollama e faça a instalação para seu sistema operacional.

2) Verifique a instalação:
```bash
ollama --version
```

3) Baixe o modelo (demora alguns minutos):
```bash
ollama pull qwen2.5:7b-instruct
```

4) Rode o serviço (em geral ele inicia automaticamente; se precisar):
```bash
ollama serve
```

5) Verifique se o modelo está disponível:
```bash
ollama list
```

### Observação sobre execução
- Se você rodar apenas o frontend/backend, a aplicação continua funcional.
- Para experiência completa da IZA (respostas generativas e conversa por voz), mantenha o **Ollama** ativo e o **backend** rodando.

---


## Formulário: autopreenchimento assistido pela IZA

Além do chat, o formulário é “assistido”:

- O usuário escreve o relato e adiciona anexos.
- A IZA sugere automaticamente:
  - **Tipo de manifestação**
  - **Assunto**
  - **Tema**
- O usuário pode **editar livremente** qualquer sugestão.

A IZA também pode preencher via chat (rascunho) e “empurrar” os campos do formulário conforme a conversa avança.

---

## Anexos + acessibilidade + transcrição automática (Speech-to-Text)

### Upload e gravação
Para cada mídia (imagem/áudio/vídeo), o usuário pode:
- **selecionar um arquivo** do dispositivo; ou
- **gravar na hora** (quando suportado pelo navegador).

### Regras de acessibilidade (obrigatórias)
- **Imagem**: exige **texto alternativo**.
- **Áudio**: exige **transcrição**.
- **Vídeo**: exige **descrição do vídeo**.

### Transcrição automática (Speech-to-Text)
Ao **gravar um áudio**, o frontend inicia um processo de **Speech-to-Text (STT)** e preenche automaticamente o campo:
- **Transcrição do áudio**

Isso reduz atrito e melhora acessibilidade sem depender de API keys.

---

## Acessibilidade (Perfis e Ferramentas)

O site possui um **Dock de Acessibilidade** sempre disponível, com perfis e ferramentas.

### Perfis
- **Baixa visão**: contraste elevado, zoom ~200%, ajustes de legibilidade.
- **Habilidades motoras**: foco em navegação por teclado, focus ring reforçado, alvos maiores.
- **Daltonismo**: redução de saturação + contraste, incentivo a não depender só de cor.
- **Epilepsia / sensibilidade**: reduz animações/transições e evita autoplay.
- **TDAH**: máscara de leitura para reduzir distrações.
- **Dislexia**: fonte amigável + espaçamento de letras/palavras/linhas.
- **Deficiência auditiva**: evita autoplay e tenta habilitar legendas quando possível.

### Ferramentas (principais)
- **Texto**: aumentar/diminuir fonte; ajustar **espaçamento de linhas**.
- **Cores**: claro/escuro; **alto contraste**; monocromático.
- **Navegação**:
  - **Atalhos** (Alt + 1…9) para pular para seções,
  - **Índice** automático baseado em `h1/h2/h3`,
  - cursor alternativo (preto/branco).
- **Som**:
  - **Silenciar sons** do site (mídias e leituras),
  - **Leitor de texto ao passar o mouse** (hover-to-read).

> Importante: as ferramentas foram desenhadas para continuar operáveis mesmo com zoom alto.

---

## VLibras (Libras)

O projeto integra o **VLibras Widget** conforme o manual oficial, permitindo tradução/apoio em Libras.

---

## API / Swagger

O backend expõe documentação interativa via Swagger:

- **Swagger UI**: `http://127.0.0.1:8000/docs`
- **OpenAPI JSON**: `http://127.0.0.1:8000/openapi.json`

Principais rotas (alto nível):
- Health check
- CRUD/consulta de manifestações
- Endpoint do chat da IZA

---

## Identidade visual e conteúdo

- Todo o site segue o **Manual de Identidade Visual** da Ouvidoria/Participa DF.
- As **imagens** usadas foram extraídas do material de aplicação (manual).
- A seção de **Perguntas Frequentes** foi baseada nas perguntas/respostas originalmente publicadas no Participa DF (adaptadas para a interface).
- A linguagem e microcopy foram desenhadas para clareza e acolhimento (“cidadão no centro”).

---

## Troubleshooting

### “Não aparece como PWA no dev”
Normal: o Service Worker é validado em `build + preview`. Rode:
```bash
npm run build
npm run preview
```

### API funciona no dev, mas falha no preview (CORS/proxy)
No preview você pode:
- liberar CORS no backend para `localhost:4173`, ou
- adicionar proxy para `preview` no Vite config.

### Ollama indisponível
- O chat cai em **modo simulado** automaticamente.
- Para usar IA generativa, inicie o Ollama e o backend.

### STT não funciona em alguns navegadores
A transcrição automática via Web Speech API tende a funcionar melhor em Chrome/Edge. Em navegadores sem suporte, o campo de transcrição continua disponível para preenchimento manual.

---

## Uso de IA no projeto

Este projeto utiliza IA de duas formas:

### 1) IA em tempo de execução (IZA)
- A IZA opera com **IA generativa local via Ollama**, utilizando o modelo **`qwen2.5:7b-instruct`**.
- O objetivo é permitir uma experiência de atendimento **sem depender de chaves de API externas**, com possibilidade de funcionar offline/limitado e com troca simples de motor/modelo.

> Observação: não há integração em runtime com **APIs externas de IA** (sem uso de API keys para IA em produção).  
> O comportamento generativo da IZA é provido pelo **Ollama** (local), e quando indisponível o chat entra em **modo simulado**.

### 2) IA como apoio de desenvolvimento
Durante a implementação e refinamento do projeto, foram utilizados **ChatGPT** e **Gemini** como apoio para:
- documentação e revisão de texto;
- adição/ajuste de comentários;
- melhorias de fluxo e UX;
- correção de bugs;
- otimizações de performance e acessibilidade.

Essas ferramentas foram usadas como suporte ao desenvolvimento. O produto final não depende delas em produção.
