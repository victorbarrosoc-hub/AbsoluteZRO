# Arquitetura do Absolute ZRO HUB

O HUB é uma **camada adicional** (PRD §12): conta central, permissões por assinatura, projeto canônico, eventos e
contratos. Os apps de cada marca continuam rodando nos ambientes deles, com login próprio, e não foram alterados.

## Contexto

```mermaid
flowchart LR
  pessoa([Pessoa / equipe]) -->|login único do HUB| hub[Absolute ZRO HUB\napps/hub-web]
  hub --> db[(Postgres NOVO\nRLS + papel zro_app)]
  worker[Worker\napps/worker] --> db
  provedor[[Provedor de pagamento\nainda não escolhido]] -.->|webhook assinado| hub
  subgraph Originais [Apps originais — só leitura, login próprio]
    cdf[Carro do Freela]
    tp[TPeasy]
    sd[SOBEDESCE desktop]
    sq[Synquei desktop]
    ns[NOSSOM]
  end
  cdf -.->|job JSON\ncarro-do-freela.job/1| hub
  tp <-.->|backup JSON v1| hub
  sd -.->|descargas.jsonl v1\n+ SOBEDESCE_copia_*.xxh64| hub
  hub -.->|prévia de organização\n(dry-run)| sq
  hub -.->|link externo| ns
```

Linhas tracejadas são arquivos que a pessoa leva de um lado para o outro ou links: nenhum app original chama o HUB
nem é chamado por ele. Isso é deliberado na Fase 1/2 (PRD §5.3, §6.2 estratégia c/d).

## Componentes

```mermaid
flowchart TB
  subgraph web [apps/hub-web — Next.js 16]
    pages[Páginas RSC] --> actions[Server Actions]
    api[/api/v1 rotas/]
  end
  actions --> core
  api --> core
  pages --> core
  subgraph pk [packages]
    core[core\nauthorize, organizações, projetos,\neventos, fila]
    integrations[integrations\nSOBEDESCE, Synquei, TPeasy,\nCarro, handlers, rotas]
    billing[billing\nentitlements, quotas,\nwebhooks, console]
    auth[auth\nscrypt, sessões, limites]
    contracts[media-contracts\nschemas zod → JSON Schema]
    obs[observability\nlogs sem PII, auditoria]
    dbp[db\nasUser / asSystem, migrate]
    ui[ui\ntokens e componentes]
  end
  integrations --> core
  core --> billing
  core --> auth
  core --> contracts
  integrations --> contracts
  billing --> dbp
  auth --> dbp
  core --> dbp
  worker[apps/worker] --> integrations
```

## Autorização (PRD §5.2)

```mermaid
sequenceDiagram
  participant C as Cliente
  participant R as Rota / Server Action
  participant A as authorize()
  participant DB as Postgres (zro_app + RLS)
  C->>R: pedido + cookie zro_session
  R->>A: need = { roles, project, product, feature, quota }
  A->>DB: 1 sessão válida (hash do token)
  A->>DB: 2 organização ativa da sessão (não do cliente)
  A->>DB: 3 vínculo ativo + papel
  A->>DB: 4 can_view/can_edit_project (como zro_app)
  A->>DB: 5-6 entitlement vigente + feature (produto lançado)
  A->>DB: 7 quota disponível (consumo atômico na execução)
  A-->>R: Actor ou DomainError (401/403/404/409/429)
  R->>DB: operação em asUser (RLS confere de novo)
```

Defesa em profundidade: mesmo que uma checagem do servidor falhe, as políticas RLS de `0002_rls.sql` exigem
`org_id = organização ativa` **e** vínculo ativo do usuário, com o papel `zro_app` (sem dono, sem BYPASSRLS).

## Eventos e fila (PRD §7.3)

```mermaid
flowchart LR
  imp[Importar descarga\nSOBEDESCE] -->|mesma transação| ev1[(workflow_events\ningest.completed)]
  imp --> ev2[(workflow_events\nmedia.manifest.ready)]
  ev2 -->|rota + entitlement| run[(workflow_runs\nsynquei.organization-plan)]
  run -->|SKIP LOCKED| w[Worker]
  w -->|ok| ok[succeeded\netapa Synquei = requer revisão]
  w -->|falha temporária| q[queued + backoff]
  q -->|tentativas esgotadas| dlq[dead_letter]
  w -->|efeito externo incerto| rev[requires_review\nnunca repete sozinho]
  w -->|sem assinatura| blk[blocked\netapa = bloqueado por assinatura]
  dlq & rev & blk -->|pessoa com permissão| rep[reprocessar\nnova execução ligada]
```

- `idempotency_key` única por organização no evento; reprocessar a mesma execução duas vezes devolve a mesma nova.
- Rotas sem ciclo (teste `findEventCycle`). Eventos sem consumidor (ex.: `edit.timeline.ready`) ficam registrados no
  projeto: o HUB não finge processá-los.

## Dados

Modelo completo em [data-model.md](data-model.md). Ameaças e mitigação em [threat-model.md](threat-model.md).

## Deploy alvo (aguardando autorização)

HUB na Vercel (projeto novo, raiz `apps/hub-web`), Postgres em projeto Supabase **novo** (só o banco, Data API sem
acesso às tabelas do schema `zro`), worker em processo Node contínuo (Railway/Fly/VM ou cron serverless que chama
`runOnce`). Passos em [../operations/deployment-checklist.md](../operations/deployment-checklist.md).
