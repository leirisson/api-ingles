# api-ingles

Plataforma de ensino de inglês para pequenos grupos (2–20 alunos) via WhatsApp, com professor de IA (Claude), gamificação e dashboard de progresso.

## Visão Geral

O sistema orquestra sessões de conversação, escrita e listening pelo WhatsApp. O n8n gerencia o fluxo das aulas e chama esta API para registrar progresso, calcular pontos, controlar sequências diárias e atualizar o ranking da turma.

```text
WhatsApp ←→ Evolution API ←→ n8n ←→ api-ingles (Fastify + PostgreSQL)
                                           ↑
                                    Dashboard (React)
```

## Stack

| Camada               | Tecnologia                  |
| -------------------- | --------------------------- |
| API                  | Node.js 20 + Fastify 5      |
| Banco de dados       | PostgreSQL 16               |
| IA                   | Claude (Anthropic)          |
| Transcrição de áudio | OpenAI Whisper              |
| Mensageria           | Evolution API + WhatsApp    |
| Orquestração         | n8n (self-hosted)           |
| Frontend             | React + Vite (planejado)    |
| Containers           | Docker Compose              |

## Pré-requisitos

- Node.js 20+
- Docker e Docker Compose

## Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/leirisson/api-ingles.git
cd api-ingles

# 2. Suba o PostgreSQL
docker compose up -d

# 3. Configure as variáveis de ambiente
cp api/.env.example api/.env
# Edite api/.env com seus valores

# 4. Instale as dependências
cd api && npm install

# 5. Rode as migrations
psql $DATABASE_URL -f src/db/schema.sql

# 6. Inicie o servidor
npm run dev
```

A API sobe em `http://localhost:3000`.

## Variáveis de Ambiente

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/ingles_db
JWT_SECRET=troque_por_uma_chave_aleatoria_de_no_minimo_32_chars
JWT_EXPIRES_IN=7d
PORT=3000
NODE_ENV=development
SCORE_DONE_THRESHOLD=70
```

## Endpoints

Todas as rotas protegidas requerem `Authorization: Bearer <token>`.

### Autenticação

| Método | Rota                     | Auth | Descrição                              |
| ------ | ------------------------ | ---- | -------------------------------------- |
| POST   | `/auth/teacher/register` | —    | Cadastro de professor                  |
| POST   | `/auth/register`         | —    | Cadastro de aluno (requer teacher_id)  |
| POST   | `/auth/login`            | —    | Login (professor ou aluno)             |
| GET    | `/auth/me`               | Sim  | Perfil do usuário autenticado          |

### Alunos

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/students` | Lista alunos do professor |
| GET | `/students/:id` | Perfil de um aluno |
| POST | `/students` | Cria aluno |
| PATCH | `/students/:id` | Atualiza aluno |
| DELETE | `/students/:id` | Remove aluno |

### Conteúdo

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/content` | Lista conteúdo (filtros: `level`, `rule`, `type`) |
| GET | `/content/:id` | Conteúdo específico |
| POST | `/content` | Cria lição/quiz/exercício (professor) |
| PATCH | `/content/:id` | Atualiza conteúdo (professor) |

### Sessões, Sequência e Pontos

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/sessions` | Registra sessão (chamado pelo n8n) |
| GET | `/sessions/me` | Histórico de sessões do aluno (últimas 100) |
| GET | `/streak/me` | Sequência atual, recorde e histórico dos últimos 30 dias |
| GET | `/points/me` | Log de pontos (últimas 100 entradas) |

### Ranking e Dashboard

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/ranking/global` | Top 20 alunos da turma |
| GET | `/ranking/level/:lvl` | Top 20 por nível CEFR (A1–C2) |
| GET | `/dashboard/me` | Dados completos do dashboard do aluno |

## Sistema de Pontos

| Evento | Pontos |
|--------|--------|
| Sessão completa | +10 |
| Primeira sessão do dia | +5 |
| Sessão perfeita (sem erros) | +20 |
| Sequência de 3 dias | +15 |
| Sequência de 7 dias | +40 |
| Sequência de 14 dias | +80 |
| Sequência de 30 dias | +150 |

Score por sessão: `acertos × 10 − erros × 5`. Conteúdo marcado como **concluído** quando score ≥ `SCORE_DONE_THRESHOLD` (padrão: 70).

## Fluxo de Registro de Sessão

1. n8n envia `POST /sessions` com telefone do aluno, modalidade e contagens de acertos/erros
2. A API calcula o score e executa em transação:
   - Insere a sessão
   - Calcula e registra pontos
   - Atualiza sequência diária (timezone UTC-4, Manaus)
   - Atualiza progresso no conteúdo
   - Atualiza totais do aluno
3. Recalcula ranking da turma
4. Retorna detalhes da sessão e pontos ganhos

## Estrutura do Projeto

```
api-ingles/
├── api/
│   ├── src/
│   │   ├── server.js          # Entrypoint Fastify
│   │   ├── db/
│   │   │   ├── index.js       # Pool de conexão PostgreSQL
│   │   │   └── schema.sql     # Schema completo do banco
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── students.js
│   │   │   ├── content.js
│   │   │   ├── sessions.js
│   │   │   ├── ranking.js
│   │   │   └── dashboard.js
│   │   └── services/
│   │       ├── auth.js        # Hash de senha
│   │       ├── points.js      # Cálculo de pontos e sequência
│   │       └── ranking.js     # Atualização de ranking
│   ├── .env.example
│   └── package.json
├── docker-compose.yml
└── spec.md                    # Especificação completa do sistema
```

## Scripts

```bash
npm start      # Servidor de produção
npm run dev    # Servidor com hot reload (nodemon)
```

## Roadmap

- **v1 (MVP):** API completa + integração n8n + WhatsApp
- **v2:** Dashboard React, relatórios por regra gramatical, notificações de sequência
- **v3:** Suporte a múltiplos professores, correção de pronúncia via Whisper, pagamentos
