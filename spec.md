# Spec — Plataforma de Ensino de Inglês
**Versão:** 1.0  
**Data:** Junho 2026  
**Autor:** Leirisson  
**Status:** Rascunho

---

## 1. Visão Geral

Plataforma de ensino de inglês para pequenas turmas (2–20 alunos) integrada ao WhatsApp via Evolution API e n8n. O professor (agente IA baseado em Claude) conduz sessões de conversação, escrita e escuta com base em 16 regras gramaticais estruturadas. A plataforma registra progresso, atribui pontos por consistência (streak diário) e exibe ranking geral e por nível.

### Objetivos
- Automatizar o ensino individual via WhatsApp com IA
- Registrar progresso por aluno e por conteúdo
- Gamificar o estudo com streak, pontos e ranking
- Oferecer dashboard web para acompanhamento

### Fora do escopo (v1)
- Pagamentos ou monetização
- App mobile nativo
- Suporte a múltiplos professores/instâncias
- Correção de pronúncia por áudio (além de transcrição)

---

## 2. Atores e Perfis

| Ator | Descrição |
|---|---|
| **Aluno** | Estuda via WhatsApp, acessa dashboard de progresso |
| **Admin** | Gerencia alunos e conteúdo via API (sem UI dedicada na v1) |
| **Agente IA** | Professor virtual (Claude) operado pelo n8n |
| **n8n** | Orquestrador que conecta WhatsApp ↔ IA ↔ API |

---

## 3. Arquitetura do Sistema

```
WhatsApp (aluno)
      │
      ▼
Evolution API  ──webhook──►  n8n Workflow
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
               Whisper API   Claude API    API Fastify
               (transcrição)  (professor)  (dados/progresso)
                                  │             │
                                  └──────┬──────┘
                                         ▼
                                    PostgreSQL
                                         │
                                         ▼
                                  Dashboard React
```

### Componentes

| Componente | Tecnologia | Responsabilidade |
|---|---|---|
| Mensageria | Evolution API + WhatsApp | Entrada/saída de mensagens |
| Orquestrador | n8n (self-hosted) | Fluxo de automação |
| Transcrição | OpenAI Whisper | Áudios → texto |
| IA Professor | Claude (Anthropic API) | Conduz aulas, corrige, explica |
| API | Node.js + Fastify | Endpoints REST, lógica de negócio |
| Banco | PostgreSQL | Persistência de dados |
| Auth | JWT + bcrypt | Autenticação de alunos |
| Dashboard | React | Visualização de progresso e ranking |

---

## 4. Banco de Dados

### 4.1 Tabelas

#### `students`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID PK | Identificador único |
| name | VARCHAR(100) | Nome completo |
| email | VARCHAR(150) UNIQUE | Email de acesso |
| phone | VARCHAR(20) | Número WhatsApp (sem @s.whatsapp.net) |
| level | VARCHAR(5) | Nível CEFR: A1, A2, B1, B2, C1 |
| total_points | INTEGER | Pontos acumulados totais |
| current_streak | INTEGER | Streak atual em dias |
| longest_streak | INTEGER | Maior streak alcançado |
| last_activity | TIMESTAMP | Última sessão registrada |
| password_hash | VARCHAR | Senha hasheada com bcrypt |
| created_at | TIMESTAMP | Data de cadastro |

#### `content`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID PK | Identificador único |
| title | VARCHAR(200) | Título da aula/exercício |
| type | VARCHAR(20) | `lesson`, `quiz`, `exercise` |
| level | VARCHAR(5) | Nível CEFR do conteúdo |
| rule_number | INTEGER | Regra do curso (1–16) |
| body | JSONB | Conteúdo estruturado (perguntas, exemplos, etc.) |
| points_reward | INTEGER | Pontos base ao completar |
| order_index | INTEGER | Ordem de exibição |
| created_at | TIMESTAMP | Data de criação |

#### `sessions`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID PK | Identificador único |
| student_id | UUID FK | Referência ao aluno |
| content_id | UUID FK | Referência ao conteúdo (nullable) |
| modality | VARCHAR(20) | `conversation`, `writing`, `listening` |
| score | INTEGER | Pontuação da sessão |
| correct | INTEGER | Acertos |
| wrong | INTEGER | Erros |
| duration_min | INTEGER | Duração em minutos |
| created_at | TIMESTAMP | Data da sessão |

#### `streaks`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID PK | Identificador único |
| student_id | UUID FK | Referência ao aluno |
| date | DATE | Data do dia estudado |
| points_earned | INTEGER | Pontos ganhos neste dia |
| sessions_count | INTEGER | Quantas sessões neste dia |
| UNIQUE | (student_id, date) | Um registro por aluno por dia |

#### `points_log`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID PK | Identificador único |
| student_id | UUID FK | Referência ao aluno |
| amount | INTEGER | Quantidade de pontos |
| reason | VARCHAR(100) | Motivo (ex: "streak dia 7") |
| created_at | TIMESTAMP | Data do registro |

#### `rankings`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID PK | Identificador único |
| student_id | UUID FK | Referência ao aluno |
| type | VARCHAR(20) | `global` ou `by_level` |
| level | VARCHAR(5) | Nível (null se global) |
| position | INTEGER | Posição no ranking |
| points | INTEGER | Pontos no momento do cálculo |
| updated_at | TIMESTAMP | Última atualização |
| UNIQUE | (student_id, type, level) | Um registro por combinação |

#### `progress`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID PK | Identificador único |
| student_id | UUID FK | Referência ao aluno |
| content_id | UUID FK | Referência ao conteúdo |
| status | VARCHAR(20) | `not_started`, `in_progress`, `done` |
| best_score | INTEGER | Melhor pontuação neste conteúdo |
| completed_at | TIMESTAMP | Data de conclusão |
| UNIQUE | (student_id, content_id) | Um registro por par |

---

## 5. API REST

### Base URL
```
https://api.plataforma-ingles.com/api
```

### Autenticação
Todos os endpoints (exceto `/auth/*`) exigem header:
```
Authorization: Bearer <JWT_TOKEN>
```

### 5.1 Auth

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| POST | `/auth/register` | Cadastro de aluno | Não |
| POST | `/auth/login` | Login → retorna JWT | Não |
| GET | `/auth/me` | Dados do aluno logado | Sim |

**POST /auth/register — body:**
```json
{
  "name": "Leirisson",
  "email": "leirisson@email.com",
  "phone": "559293129862",
  "password": "senha123",
  "level": "B1"
}
```

**POST /auth/login — body:**
```json
{ "email": "leirisson@email.com", "password": "senha123" }
```

**Resposta de login:**
```json
{ "token": "eyJ...", "student": { "id": "...", "name": "Leirisson", "level": "B1" } }
```

### 5.2 Alunos (admin)

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/students` | Lista todos os alunos |
| GET | `/students/:id` | Perfil completo de um aluno |
| PATCH | `/students/:id` | Atualiza nível ou dados |
| DELETE | `/students/:id` | Remove aluno |

### 5.3 Conteúdo

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/content` | Lista conteúdo (filtros: `level`, `rule`, `type`) |
| GET | `/content/:id` | Conteúdo específico |
| POST | `/content` | Cria conteúdo (admin) |
| PATCH | `/content/:id` | Edita conteúdo (admin) |

### 5.4 Sessões

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/sessions` | Registra sessão (chamado pelo n8n) |
| GET | `/sessions/me` | Histórico de sessões do aluno |

**POST /sessions — body (enviado pelo n8n):**
```json
{
  "student_phone": "559293129862",
  "content_id": "uuid-opcional",
  "modality": "conversation",
  "correct": 8,
  "wrong": 2,
  "duration_min": 15
}
```

### 5.5 Pontos e Streak

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/streak/me` | Streak atual + histórico dos últimos 30 dias |
| GET | `/points/me` | Log de pontos do aluno |

### 5.6 Ranking

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/ranking/global` | Top 20 geral |
| GET | `/ranking/level/:lvl` | Ranking por nível (ex: `/ranking/level/B1`) |

**Resposta de ranking:**
```json
{
  "ranking": [
    { "position": 1, "name": "Leirisson", "level": "B1", "total_points": 450, "current_streak": 12 },
    { "position": 2, "name": "Ana", "level": "B2", "total_points": 380, "current_streak": 7 }
  ]
}
```

### 5.7 Dashboard

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/dashboard/me` | Resumo completo do aluno (streak, pontos, progresso por regra, top erros) |

---

## 6. Sistema de Pontuação

### 6.1 Tabela de Pontos

| Evento | Pontos |
|---|---|
| Completar qualquer sessão | +10 |
| Primeira sessão do dia | +5 |
| Sessão perfeita (0 erros) | +20 |
| Streak 3 dias consecutivos | +15 (bônus) |
| Streak 7 dias consecutivos | +40 (bônus) |
| Streak 14 dias consecutivos | +80 (bônus) |
| Streak 30 dias consecutivos | +150 (bônus) |

### 6.2 Regras de Streak

- Um dia é contado como "estudado" se houver ao menos 1 sessão registrada naquele dia (UTC-4 Manaus)
- Streak é calculado contando dias consecutivos a partir de hoje retroativamente
- Se o aluno não estudar um dia, o streak reseta para 0 (mas `longest_streak` é mantido)
- O bônus de marco (3, 7, 14, 30 dias) é creditado apenas uma vez por marco por ciclo

### 6.3 Atualização de Ranking

O ranking é recalculado automaticamente sempre que um aluno recebe pontos. Usa `RANK() OVER (ORDER BY total_points DESC)` para ranking global e `RANK() OVER (PARTITION BY level ORDER BY total_points DESC)` para ranking por nível.

---

## 7. Integração n8n

### 7.1 Fluxo Principal (mensagem recebida)

```
Webhook (Evolution API)
  → Edit Fields (extrai phone, messageType, mensagem, id)
  → IF fromMe = false (ignora mensagens do bot)
  → IF phone = aluno autorizado
  → Switch messageType:
      audioMessage → Whisper (transcrição) → AI Agent
      conversation → AI Agent
  → AI Agent (Claude professor, memória por sessão)
  → HTTP Request POST /api/sessions (registra na API)
  → Evolution API (envia resposta)
```

### 7.2 Fluxo Proativo (envio diário)

```
Schedule Trigger (todo dia às 8h)
  → Switch (dia % 3 → flashcard | quiz | tradução)
  → AI Agent (gera conteúdo)
  → Evolution API (envia para todos os alunos ativos)
```

### 7.3 Variáveis de Ambiente no n8n

| Variável | Descrição |
|---|---|
| `API_BASE_URL` | URL base da API Fastify |
| `API_JWT_TOKEN` | Token JWT para o n8n se autenticar na API |
| `ANTHROPIC_API_KEY` | Chave da API do Claude |
| `OPENAI_API_KEY` | Chave da API do Whisper |

---

## 8. Dashboard Web (React)

### 8.1 Telas planejadas para v1

| Tela | Rota | Descrição |
|---|---|---|
| Login | `/login` | Email + senha |
| Dashboard | `/` | Streak, pontos, progresso resumido |
| Progresso | `/progress` | Progresso por regra (1–16), heatmap de atividade |
| Ranking | `/ranking` | Ranking global + por nível |
| Histórico | `/history` | Sessões anteriores com erros e acertos |

### 8.2 Componentes do Dashboard

- **Streak card** — dias consecutivos atuais + maior streak
- **Pontos card** — total de pontos + posição no ranking
- **Heatmap** — grid de atividade dos últimos 90 dias (estilo GitHub)
- **Progresso por regra** — barra de progresso para cada uma das 16 regras
- **Top erros** — os 5 tipos de erro mais frequentes
- **Ranking preview** — top 5 do ranking global inline

---

## 9. Estrutura de Arquivos do Projeto

```
plataforma-ingles/
├── api/
│   ├── src/
│   │   ├── server.js          # Entry point Fastify
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── students.js
│   │   │   ├── content.js
│   │   │   ├── sessions.js
│   │   │   ├── ranking.js
│   │   │   └── dashboard.js
│   │   ├── services/
│   │   │   ├── points.js      # Lógica de pontos e streak
│   │   │   ├── ranking.js     # Atualização de ranking
│   │   │   └── auth.js        # JWT + bcrypt
│   │   └── db/
│   │       ├── index.js       # Conexão Postgres
│   │       └── schema.sql     # Schema completo
│   ├── .env.example
│   └── package.json
│
├── dashboard/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Progress.jsx
│   │   │   ├── Ranking.jsx
│   │   │   └── History.jsx
│   │   ├── components/
│   │   │   ├── StreakCard.jsx
│   │   │   ├── Heatmap.jsx
│   │   │   ├── RuleProgress.jsx
│   │   │   └── RankingTable.jsx
│   │   └── services/
│   │       └── api.js         # Cliente HTTP para a API
│   └── package.json
│
├── n8n/
│   └── workflow.json          # Export do workflow n8n
│
└── README.md
```

---

## 10. Variáveis de Ambiente

### API (`api/.env`)
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/ingles_db
JWT_SECRET=seu_segredo_jwt_aqui
JWT_EXPIRES_IN=7d
PORT=3000
NODE_ENV=production
```

### Dashboard (`dashboard/.env`)
```env
VITE_API_URL=https://api.plataforma-ingles.com/api
```

---

## 11. Roadmap

### v1 — MVP (atual)
- [x] Schema do banco definido
- [x] Endpoints REST especificados
- [x] Sistema de pontos e streak desenhado
- [x] Integração n8n → API → Postgres
- [ ] Implementar API Fastify completa
- [ ] Implementar auth (register/login/JWT)
- [ ] Implementar lógica de pontos e streak
- [ ] Corrigir workflow n8n (Whisper + fromMe filter)
- [ ] Dashboard React básico (streak, ranking, progresso)

### v2 — Melhorias
- [ ] Envio proativo diário automático
- [ ] Relatório semanal automático no WhatsApp
- [ ] Sistema de comandos por palavra-chave no n8n
- [ ] Tratamento de erros e fallback no workflow
- [ ] Indicador "digitando..." antes de responder
- [ ] Memória persistente com Postgres (substituir buffer)

### v3 — Expansão
- [ ] UI admin para gerenciar alunos e conteúdo
- [ ] Notificações de streak em risco (lembrete no WhatsApp)
- [ ] Exportação de relatório PDF por aluno
- [ ] Suporte a múltiplos idiomas/cursos

---

## 12. Decisões Técnicas

| Decisão | Escolha | Justificativa |
|---|---|---|
| Runtime | Node.js 20 LTS | Familiaridade, ecossistema rico |
| Framework API | Fastify | Mais rápido que Express, tipagem nativa |
| Banco | PostgreSQL | Suporte a JSONB, funções de janela para ranking |
| Auth | JWT + bcrypt | Stateless, simples para turma pequena |
| IA | Claude (Anthropic) | Melhor desempenho em explicações pedagógicas em PT-BR |
| Transcrição | OpenAI Whisper | Melhor precisão para português |
| Orquestrador | n8n self-hosted | Gratuito, visual, já em uso |
| Mensageria | Evolution API | Gratuito, self-hosted, compatível com n8n |
| Dashboard | React + Vite | Rápido para prototipar, ecossistema amplo |

---
