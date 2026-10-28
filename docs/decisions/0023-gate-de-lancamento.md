# ADR 0023 — Gate de lançamento: fechado é fechado, no servidor, por conta e por canal

Data: 28/10/2026 · PRD "integração, controle de acesso e lançamento progressivo" (27/10/2026) §5–§6, §11 e o adendo do
Carro do Freela · Decisão do proprietário: SOBEDESCE, Synquei e TPeasy lançados; NOSSOM, Revela (`finishing`), AEON
(`ai-edit`) e Carro do Freela fechados, com uma única conta autorizada (a dele).

## Contexto

O HUB só tinha um eixo de disponibilidade: `zro.products.stage`. Ele decide entitlement e agrupamento do catálogo, mas
não diz se um produto está aberto ao público nem por onde (web, desktop, API, download, login único). Com AEON e Revela
`active` desde a migration 0013 e o plano grátis v2 listando NOSSOM e Carro, **toda organização nova recebia
entitlement das sete ferramentas** e **qualquer conta logada obtinha código, tokens e `userinfo` em qualquer cliente
de produto** (`trusted`), porque o login único não olhava produto. Cada app aplicava `zro_products` do seu jeito; a
Revela não bloqueava nada. O PRD exige um controle central, server-side e deny-by-default, separado de autenticação
(quem é), entitlement (o que contratou) e papel (o que pode fazer), com canal explícito.

## Decisão

1. **Fonte única no banco** (migration `0018_release_gate.sql`): `zro.product_release` (uma linha por produto: `state`
   em `development | internal_beta | private_beta | public_beta | released | retired`, canais booleanos
   `web/desktop/api/download/sso` abertos ao público, nota, quem mudou) e `zro.product_release_access` (contas
   autorizadas por produto enquanto fechado: `user_id`, `kind` `owner | internal | tester`, canais, motivo, validade,
   revogação). A regra é uma função só, `zro.release_allows(produto, pessoa, canal)`: released/public_beta → canal
   aberto ao público (ou conta listada naquele canal); retired → ninguém; qualquer outro estado **ou sem linha** → só
   conta listada, vigente, no canal. Anônimo nunca entra em produto fechado. RLS: estado legível por `zro_app`
   (é público: as telas mostram "Em desenvolvimento"), lista só do sistema; escrita só do sistema. Auditoria por
   trigger, só-inclusão, em toda mudança (inclusive feita no SQL Editor).
2. **Por conta, nunca por e-mail nem por papel.** A lista guarda `zro.users.id`. Admin da plataforma **não** entra em
   produto fechado só por ser admin (o adendo do Carro exige exatamente isso: outros administradores ficam de fora).
   A conta do proprietário entra em produção na publicação, pelo console ou pelo SQL Editor; nunca pela migration,
   nunca no código (o repositório é público). A migration só traz o exemplo comentado.
3. **Um lugar lê a regra para todos.** `@zro/billing` `release.ts`: `releaseState(tx)` (cache de processo de 30 s;
   estados mudam raramente) e `releaseAllows(tx, produto, pessoa, canal)` por pedido, sem cache, para revogação valer
   na hora. `checkEntitlement` recebe `who` (pessoa + canal) e recusa `product_closed` antes de olhar o plano;
   `productAccessFor` devolve `access: 'closed'` e `release` por produto (a pessoa é a passada ou a da transação
   `asUser`); `authorize()` passa a pessoa e o canal do pedido (token de app = `api`, sessão do HUB = `web`) e tem
   `need.release` para o gate sem entitlement (a Z chamada de dentro de um app). Erro: `DomainError('product_closed',
'Este app ainda está em desenvolvimento.')`, 403, `details.closed = true`, `upgrade = false` (contratar não resolve).
4. **Login único nega emissão.** `/oauth/authorize` de cliente de produto fechado para conta fora da lista **não emite
   código**: mostra "Em desenvolvimento" (200) e grava `release.denied` (cliente, canal; nada privado); com
   `prompt=none`, `error=access_denied`. A troca de código reconfere; o refresh devolve `invalid_grant` "Este app
   ainda está em desenvolvimento."; `userinfo` e Bearer (`authenticateAccessToken`, canal `api`) respondem 401. Clientes
   de desktop (`aeon-desktop`) seguem a mesma regra pelo `product_id`. Claim nova **`zro_release`**
   (`{ produto: released | allowed | closed }`) no id_token, no access token e no `userinfo`; `zro_products` só traz
   produtos contratados **e** abertos para a pessoa. Sessões de antes do gate: `npm run db:release:revoke` (prévia por
   padrão, `--apply` com motivo e auditoria) revoga refresh tokens e consentimentos dos clientes fechados para quem
   não está na lista.
5. **Produtos consultam de duas formas**, ambas no servidor deles: a claim `zro_release` (tela certa sem perguntar ao
   HUB) e a emissão negada (nem token antigo nem app modificado contornam). Cada produto fechado ainda leva um
   `RELEASE=closed` local, que vale mesmo com o HUB fora do ar (tarefa das pastas dos produtos).
6. **Tela única "Em desenvolvimento"**: símbolo da Absolute ZRO pequeno, ícone e nome do app, "Em desenvolvimento."
   em Figtree Light × ExtraBold, uma linha de apoio e "Voltar ao HUB" em vidro escuro; sem "Tenho interesse", sem dado
   interno. No HUB é `EmDesenvolvimento` (`/em-desenvolvimento/<produto>` e dentro do `/oauth/authorize`); a versão
   estática para os sites fica em `docs/integration-contracts/em-desenvolvimento.html`.
7. **Console**: Administração › Lançamento (estado e canais por produto, com motivo) e Acesso interno (conceder ou
   revogar por pessoa escolhida na lista de contas, tipo, canais, validade; revogar também encerra as sessões da pessoa
   nos apps daquele produto), só `requirePlatformAdmin`; auditoria na mesma tela.

## Consequências

- Estado inicial: `sobedesce`, `synquei`, `tpeasy` = `released` com todos os canais; `nossom`, `ai-edit`, `finishing`,
  `carro-do-freela` = `development` sem canal. Produto novo (`maestro`) nasce sem linha = fechado.
- Plano grátis fica como está: o entitlement dos fechados existe, mas nunca aparece como "Contratada" nem abre nada.
  A Z continua igual nos lançados; dentro de um app fechado responde 403 `product_closed` e o guia que ela recebe só
  cita as plataformas abertas para a pessoa.
- Cópias já instaladas (AEON build 8+, NOSSOM 0.2.2) não podem ser apagadas das máquinas; o que o servidor controla é
  não emitir, não renovar e não aceitar token (PRD §6.3).
- O que fica para as pastas dos produtos e para a interface do HUB (outros agentes): `RELEASE=closed` e as telas dos
  quatro fechados; homepage, `/baixar`, desktop e navegação lendo `release` do catálogo.

## Como reverter

Sem apagar nada. Abrir um produto = mudar a linha dele (console ou `update zro.product_release set state = 'released',
web = true, desktop = true, api = true, download = true, sso = true where product_id = '…'`), lido pelo HUB em até 30 s
sem redeploy. Fechar de novo = o inverso. Tirar o gate inteiro = nova migration (`drop function zro.release_allows;
drop table …`), nunca editar a 0018. Tokens e consentimentos revogados não voltam: a pessoa entra de novo no app.
