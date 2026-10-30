# Lançamento do Carro do Freela — o que vira no dia

Preparado em 30/10/2026 (o titular autorizou preparar: "pode fazer o restante"). **Nada disto roda antes do OK final do
titular.** Nenhum e-mail sai (e-mail só quando ele pedir) e não há app de computador. Tudo é reversível sem apagar dado.

## O que o ramo `claude/carro-lancamento` traz

- **O site real** (ramo `claude/carro-no-ar`, mesclado aqui): o domínio serve `build.js --real` — nenhum dos 109 perfis
  fictícios, nada semeado; a busca vem da comunidade da Absolute ZRO (`GET /api/v1/pessoas`, migration `0038`) e a
  agenda do banco do Carro (`carro_do_freela.agenda_dias`, migração `0002_comunidade` do Carro).
- **Acabamento do site real** (este ramo): sem "Prévia" no menu, no rodapé nem no "Recomeçar do zero"; sem Planos,
  Aprender, Passar o carro e Orçamento (preço, moeda e WhatsApp do protótipo); a escada de planos do protótipo não
  tranca nada (o plano é o da conta Absolute ZRO); o guia de entrada mostra só o que funciona (agenda, perfil, busca);
  nada de "de graça"; nenhum aviso simulado (a "plataforma viva" do protótipo); Google Agenda e lembrete no WhatsApp (botões sem integração) fora; o convite "quando a plataforma
  abrir" e a contagem de passos não falam mais com o Supabase do app original; a Z da página inicial diz "No Carro do
  Freela" com o produto aberto; a família no menu só com o que está no ar (sem NOSSOM e Revela).
- **HUB**: migration `infra/migrations/0041_carro_lancamento.sql` — catálogo `active` no subdomínio
  (`https://carro.absolutezro.com`, `sso_start_url` `…/api/zro/entrar`), descrição nova, gate `released` com **web,
  api e sso** abertos (**desktop e download fechados**), entitlement para quem tem assinatura vigente sem o Carro.
  Planos não mudam: o Carro já está no grátis vigente (com os 50 créditos de IA), no Completo, no Pro e nos avulsos.
  Página inicial, `/baixar` e a Z mudam sozinhas pelo gate (`lib/divulgacao.ts`); `/baixar` leva ao subdomínio (navegador
  e Tela de Início); a foto dos aparelhos é do site real; o evento `freela.inventario.atualizado` (rota desligada) não
  aparece no fluxo da página.

## Antes (no ramo, já conferido)

- [x] Raiz: `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build && npm run test:e2e`.
- [x] Carro (`products/carro-do-freela`, como `.github/workflows/carro-testes.yml`): `npm run test:api`,
      `npm run test:banco`, `npm run build:vercel`, `npm test`, `node --test test/api/banco-tela.test.js`,
      `node src/blindar.js .vercel/output/static`.
- [x] `node scripts/scan-secrets.mjs`.

## No dia (nesta ordem)

1. **Vercel, projeto `carrodofreela-app`** (Production), sem redeploy ainda: conferir as variáveis (só os nomes; os
   valores ficam na Vercel):

   | Nome                                            | No lançamento                                                                                                                      |
   | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
   | `CARRO_RELEASE`                                 | **`released`** (hoje ausente = fechado). Sozinha não abre nada: o HUB também precisa dizer `released`                              |
   | `ZRO_CLIENT_ID`                                 | já existe (`carrodofreela-web`)                                                                                                    |
   | `ZRO_CLIENT_SECRET`                             | já existe (sensível)                                                                                                               |
   | `CARRO_DATABASE_URL`                            | já existe (sensível; é ela que migra o banco do Carro no build de produção — a `0002_comunidade` entra no próximo build da `main`) |
   | `ZRO_ISSUER`                                    | opcional; sem ela o padrão do código é `https://absolutezro.com`                                                                   |
   | `CARRO_SUPABASE_URL`, `CARRO_SUPABASE_ANON_KEY` | **podem sair**: o site real não usa (são do projeto Supabase do app original)                                                      |
   | `CARRO_WEB3FORMS_KEY`                           | opcional (suporte pelo balão)                                                                                                      |
   | `CARRO_SYNC_ATIVO`, `CARRO_SYNC_URL`            | **continuam ausentes** (a sincronia do inventário com o Maestro está desligada)                                                    |

   ⚠️ Trocar `CARRO_RELEASE` antes do passo 2 não muda o que está no ar: a variável só vale no próximo build, e o
   próximo build já é o do site real.

2. **Mesclar o PR deste ramo na `main`** (um PR só: site real + 0038 + 0041). Isso dispara os dois projetos:
   - **`absolutezro` (HUB)**: o build roda o runner e aplica a `0038_comunidade` e a `0041_carro_lancamento` (se a
     0040 de outro ramo ainda não entrou, não importa: o runner aceita fora de ordem). A página inicial, `/baixar`,
     `/ferramentas` e a Z passam a mostrar o Carro em até 30 s.
   - **`carrodofreela-app`**: o build migra o banco do Carro (`0002_comunidade`) e gera o site real **aberto**
     (log: `lançamento: ABERTO AO PÚBLICO` e `index.html — FASE=1 · real, sem perfil fictício · ABERTO`).
3. **DNS**: nada a fazer. `carro.absolutezro.com` já resolve e responde 200 pela Vercel (conferido em 30/10/2026,
   servindo a `main` fechada); `carrodofreela.com.br` e `carrodofreela-app.vercel.app` continuam valendo, com o
   retorno do login cadastrado nos três (0037).

## Conferir (com uma conta comum, fora da lista de acesso)

- `https://carro.absolutezro.com/` — topo "Quem está livre, na data certa.", "Quero contratar" e "Sou freela"; nada de
  "Prévia", "Beta", "grátis", AEON, Revela ou NOSSOM.
- `https://carro.absolutezro.com/api/zro/eu` sem sessão → `401 {"erro":"sem_sessao","release":"released"}`.
- Entrar → "Continuar com Absolute ZRO" → volta logado; Agenda marca um dia (no Supabase:
  `select count(*) from carro_do_freela.agenda_dias;`); Achar alguém lista quem tem o @ confirmado.
- `https://absolutezro.com/` — o Carro na faixa do ecossistema (primeiro, com o ícone dele), no fluxo ("Equipe", 2 de 7)
  e em "Conheça de perto"; `https://absolutezro.com/baixar` → Carro do Freela → `carro.absolutezro.com`.
- Quem entrou no Carro antes do lançamento entra de novo uma vez (o login passa a pedir `zro.pessoas`).

## Reversão

1. Fechar o gate: Administração › Lançamento › Carro do Freela em "Em desenvolvimento", canais desligados (ou, no SQL
   Editor, `update zro.product_release set state = 'development', web = false, desktop = false, api = false,
download = false, sso = false where product_id = 'carro-do-freela'`). Vale em até 30 s, sem redeploy; a lista de
   acesso (a conta do titular) volta a valer, e as páginas públicas param de divulgar.
2. Tirar `CARRO_RELEASE` do `carrodofreela-app` e publicar de novo (o site volta a nascer fechado).
3. Planos e entitlements ficam (inertes com o gate fechado). Nunca editar a 0041; mudança é migration nova.

## O que fica para depois (decisão do titular)

- **Propostas, Jobs, Feed e Brechó ainda moram no aparelho** (localStorage): no site real eles nascem vazios e
  funcionam para a própria pessoa, mas nada chega a outra conta. A consulta de um contratante não chega ao freela. Ou
  ganham servidor (como a agenda), ou saem do menu do site real até lá.
- **A agenda do Carro e a do Maestro são duas**: o dia que o freela marca no Carro (`carro_do_freela.agenda_dias`) não
  aparece na escala do Maestro, e o inverso também não. A pessoa é a mesma nos dois (`sub` da Absolute ZRO =
  `maestro.freelas.zro_sub`), sem cadastro duplicado; falta ligar as agendas.
- **Inventário Carro → Maestro** pronto e desligado (`CARRO_SYNC_ATIVO`, rota `freela.inventario.atualizado`, endpoint
  do HUB ainda não existe).
- O Carro continua com `X-Robots-Tag: noindex, nofollow` (não aparece no Google). Tirar é uma linha em
  `src/seguranca.js` e uma decisão.
- O Carro abre no tema escuro (identidade dele); o padrão da Absolute ZRO é o claro.
