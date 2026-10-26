# Absolute ZRO HUB

**Da oportunidade à entrega. Um só fluxo.** Conta central, permissões por assinatura, o plano completo **Ciclo do O**
e a camada de projeto que liga Carro do Freela, TPeasy, SOBEDESCE, Synquei, NOSSOM e as futuras AI Edit e Revela.

- Especificação: [PRD.md](PRD.md) (referência principal).
- Regras permanentes para agentes: [CLAUDE.md](CLAUDE.md).
- Arquitetura: [docs/architecture/overview.md](docs/architecture/overview.md) · Inventário das origens:
  [docs/architecture/source-inventory.md](docs/architecture/source-inventory.md) · Decisões: [docs/decisions](docs/decisions).
- O que está pronto e o que falta: [docs/roadmap.md](docs/roadmap.md) · Evidências de teste: [docs/validation.md](docs/validation.md).
- Deploy: [docs/operations/deployment-checklist.md](docs/operations/deployment-checklist.md).

> **Deploy autorizado em 25/10/2026** para https://absolutezro.com (projeto Vercel `absolutezro`, projeto
> Supabase novo `AbsoluteZRO`). Passo a passo e primeira conta de administração em
> [docs/operations/deployment-checklist.md](docs/operations/deployment-checklist.md).

## O que existe

| Parte             | Onde                                     | Estado                                                                                                                                                      |
| ----------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portal (HUB)      | `apps/hub-web` (Next.js 16.4, React 19)  | Funcional: landing, planos, conta, organizações, equipe, projetos, Ciclo do O, ferramentas, arquivos, atividades, assinatura, perfil, console da plataforma |
| Worker da fila    | `apps/worker`                            | Funcional: retries com backoff, dead-letter, revisão para despacho ambíguo                                                                                  |
| Banco novo        | `infra/migrations`                       | Postgres com RLS em todas as tabelas; catálogo inicial neutro                                                                                               |
| Domínio           | `packages/*`                             | `db`, `auth`, `billing`, `core`, `media-contracts`, `integrations`, `observability`, `ui`                                                                   |
| Produtos copiados | `products/<produto>/source`              | Cópias controladas com `SOURCE_MANIFEST.md` (origem e commit). Não fazem parte do build do HUB                                                              |
| Futuros           | `products/ai-edit`, `products/finishing` | Só contratos e scaffolds. Nenhuma IA ou grading de fachada                                                                                                  |

Integrações reais hoje: **SOBEDESCE → HUB** (resumo `descargas.jsonl` v1 + relatórios `SOBEDESCE_copia_*.xxh64`),
**HUB → Synquei** (prévia de organização, sem mover arquivos), **TPeasy ↔ HUB** (backup JSON do próprio TPeasy) e
**Carro do Freela → HUB** (contrato proposto `carro-do-freela.job/1`). Login único vale **para o HUB**; os apps
originais continuam com login próprio (SSO federado é Fase 3 e exige mudar cada original, com autorização).

## Rodar local

Requisitos: Node 22, Postgres 15+ local (ou Docker) e npm 11 (`npx -y npm@11.6.2` funciona sem instalar).

```bash
npx -y npm@11.6.2 install
cp .env.example apps/hub-web/.env.local        # ajuste DATABASE_URL
createdb zro_dev                               # ou: psql -c 'create database zro_dev'
DATABASE_URL=postgres://postgres:postgres@localhost:5432/zro_dev npm run db:migrate
DATABASE_URL=postgres://postgres:postgres@localhost:5432/zro_dev npm run db:seed:demo   # opcional, dados [DEMO]
npm run dev                                    # http://localhost:3000
DATABASE_URL=... npm run worker                # outra aba: processa a fila
```

Com o seed de demonstração: `dono@demo.absolutezro.local` e `admin@demo.absolutezro.local`, senha `demo-absolute-zro`
(ou `ZRO_DEMO_PASSWORD`). Sem provedor de e-mail, links de confirmação, convite e nova senha aparecem na tela e no log
(só fora de produção).

## Comandos

| Comando                                                       | O que faz                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm test`                                                    | Unitários e integração (Vitest) num Postgres real; recria o banco `zro_test`                    |
| `npm run test:e2e`                                            | Playwright contra o build de produção local (`npm run build` antes); usa o banco `zro_e2e_test` |
| `npm run lint` · `npm run format:check` · `npm run typecheck` | Qualidade                                                                                       |
| `npm run build`                                               | Build de produção do HUB                                                                        |
| `npm run db:migrate`                                          | Aplica `infra/migrations` no `DATABASE_URL` (só banco novo)                                     |
| `npm run contracts:export`                                    | Regenera os JSON Schemas em `docs/integration-contracts/schemas`                                |
| `node scripts/scan-secrets.mjs`                               | Varredura de segredos nos arquivos versionados                                                  |
| `node scripts/check-originals.mjs <clones…>`                  | Prova que os originais seguem no commit copiado e com `git status` limpo                        |
| `node scripts/snapshot-product.mjs <produto> <clone>`         | Atualiza a cópia de um produto (só leitura na origem)                                           |

## Ambientes

`ZRO_ENV=development | staging | production`. Em produção: cookie `Secure`, HSTS, seed bloqueado e envio de e-mail
indisponível até existir provedor (a interface diz isso, não finge que enviou). Cada ambiente com banco próprio.

## Limitações conhecidas

- Provedor de pagamento, preços, teste grátis e limites dos planos **não definidos** (catálogo neutro). Liberação hoje
  é por concessão no console, auditada. O webhook genérico assinado está pronto para receber o provedor escolhido.
- Operação medida sem limite configurado fica **bloqueada** (nada é ilimitado por omissão).
- Sem provedor de e-mail; 2FA ainda não implementado.
- O repositório é **público** e contém cópias de TPeasy e Carro do Freela, que eram privados (cópia autorizada pelo
  titular). Chaves e referências de produção dos originais foram trocadas por marcadores.
