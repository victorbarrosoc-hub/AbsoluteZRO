# Maestro no ecossistema: Z, eventos, agenda e acesso (28/10/2026)

O que o funil, os números, a importação, a agenda por assinatura e o acesso por cliente do Maestro (migrations
`0014`–`0018` de `products/maestro/drizzle`) ligam com o resto da Absolute ZRO. A Z **lê** o Maestro desde 28/10/2026
(autorização do titular, "Z lendo a Maestro"); escrever pela Z e os eventos seguem desligados.

## Identidade e acesso por cliente

- As pessoas do Maestro são as contas Absolute ZRO da organização (claims `zro_org`/`zro_products`/`zro_release` do
  login único, gravadas em `maestro.members` a cada login; papel pela tabela fixa de `src/lib/papeis.ts`). Não existe
  cadastro de usuário no Maestro: convite e papel são no HUB (`/equipe`).
- O acesso por cliente (`maestro.acesso_restrito`, `maestro.acesso_clientes`) só restringe quem já é membro com papel
  `equipe` ou `leitura`. Se o HUB promover a pessoa a gestão, ela vê tudo no próximo login; se rebaixar, a restrição
  guardada volta a valer. A regra vale no banco (políticas restritivas `<tabela>_cliente`), também para a Z e o .ics.

## Z: o dia da produtora (ligado, só leitura)

- **Rota** `POST /api/zro/maestro/resumo` no Maestro, só leitura, com o **mesmo pedido servidor a servidor do Drive da
  Z** ([sobedesce-drive.md](sobedesce-drive.md)): `Authorization: Bearer <zro-pedido+jwt>` assinado pelo HUB com
  `assinarPedidoDeApp` (`aud` = `maestro-web`, ação `maestro.resumo`, 60 s, `jti` de uso único), conferido em
  `products/maestro/src/lib/zro/pedido.ts`. O Maestro só aceita as ações de `ACOES_ABERTAS` (hoje só
  `maestro.resumo`): uma ação de escrita é recusada mesmo com assinatura válida.
- **Quem**: o `sub` do pedido; a organização é a do último login dele no Maestro, só se esse login tinha acesso
  (`temAcesso`) e ele segue ativo. Senão `404 sem_vinculo` (neutro). Limite: 30 a cada 10 min por pessoa.
- **Resposta** (JSON, sem cache): `fonte: "Maestro"`, `organizacao`, `gerado_em` (ISO), `hoje`, `link` (a tela Hoje),
  `retornar_hoje[]` (nome, tipo pedido|cliente, data, nota), `vencendo[]` e `com_o_cliente[]` (card, cliente, prazo ou
  desde), `contagens` (pedidos novos, orçamentos aguardando, agenda de hoje, cards atrasados) e `dinheiro` (meta e
  faturado do mês, caixa, a receber e a pagar da semana, em centavos) **só para quem tem a área Financeiro** no
  Maestro (`maestro.pode`, `products/maestro/docs/permissoes.md`; a gestão não tem por padrão); `null` para os outros.
  `orcamentos_aguardando` é `null` para quem não tem a área Orçamentos. Tudo lido como a pessoa (`asUser`, RLS, áreas
  e acesso por cliente). Nada é guardado.
- **No HUB**: a ferramenta `ver_maestro` da Z (`packages/core/src/ia-maestro.ts`, `maestroParaIa`; ligada em
  `apps/hub-web/lib/ia/modelo.ts`). Antes de qualquer pedido, `authorize` com o produto `maestro`: gate de lançamento
  (hoje só a lista de acesso, ou seja, o titular) **e** o Maestro no plano da organização. Fechado ou fora do plano:
  nenhum pedido sai. A ferramenta e o parágrafo dela no sistema da Z só aparecem quando o retrato traz o Maestro como
  `contracted`. A resposta vira texto para o modelo com `fonte`, `citar_como` ("segundo o Maestro, às 14:02"), só os
  campos conhecidos (listas até 20, textos cortados), o link só se for a tela Hoje do Maestro configurado, e o dinheiro
  em reais **só se o Maestro mandou**; sem ele, a Z é avisada para não falar de valores. Toda leitura, recusa ou
  falha fica em `zro.audit_logs` (`ia.maestro.leitura`, alvo `maestro_leitura`, com `acao`, `resultado`, `erro` e se
  veio dinheiro; nada do conteúdo lido).
- **Configuração**: sem segredo novo. O HUB usa a chave do login único (a mesma do Drive) e, opcionais,
  `ZRO_MAESTRO_URL` (padrão `https://maestro.absolutezro.com`) e `ZRO_MAESTRO_CLIENT_ID` (padrão `maestro-web`) no
  projeto Vercel `absolutezro`. O Maestro confere pela JWKS do emissor (`ZRO_ISSUER`, padrão
  `https://absolutezro.com`) e precisa de `ZRO_CLIENT_ID=maestro-web` e `ZRO_CLIENT_SECRET` (já usados pelo login) no
  projeto Vercel `maestro`; sem eles a rota responde `503 sem_config`.
- **Próximo passo (fora deste corte)**: escrever pela Z (criar pedido, registrar despesa, marcar contato) com a ação
  exata mostrada antes e o "sim" da pessoa conferido no core (como `pedirAoComputadorAuditado`), cada ação nova em
  `ACOES_ABERTAS` do Maestro só com decisão do titular, e a cota/plano da Z no Maestro.

## Eventos (desenho; o Maestro ainda não publica no HUB)

O Maestro não publica eventos no HUB hoje (o vínculo do projeto é por `link_status` e a API de projetos da etapa 3).
Quando publicar, pelo envelope `zro-event-envelope` v1 e `publishEvent` com `idempotency_key`:

| Evento (proposto)          | Quando                                                             | `idempotency_key`               | Payload mínimo                                  |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------- | ----------------------------------------------- |
| `maestro.pedido.ganho`     | o pedido chega a "Ganho" (aceite pelo link ou aprovação da equipe) | `maestro.pedido.ganho:<pedido>` | org, pedido, orçamento (número e versão), valor |
| `maestro.orcamento.aceito` | `orcamento_link_aceitar` grava o termo                             | `maestro.orcamento:<id>:aceite` | org, orçamento, versão, total, hash do termo    |
| `maestro.projeto.criado`   | o projeto nasce (aceite, aprovação, tela ou importação)            | `maestro.projeto:<id>:criado`   | org, projeto, código, cliente (id), origem      |

Sem nome de cliente, e-mail, WhatsApp ou valor de pagamento de freela. Nenhum entra em `ROUTES` antes de existir quem
consome; `findEventCycle` precisa continuar passando.

## Agenda por assinatura (.ics)

- `GET /api/agenda/<token>.ics` (endereço secreto por pessoa; só o sha256 no banco) e `GET /api/agenda/minha` (com a
  sessão). RFC 5545, `TZID=America/Sao_Paulo`. Itens: agenda (diárias, entregas, reuniões), escala dos freelas, prazos
  dos cards, vencimento dos links de aprovação e retornos do funil, só o que a pessoa vê.
- **Não duplica o HUB**: o "Hoje"/agenda do HUB não lê a agenda do Maestro nem o feed; quem quiser os dois assina o
  .ics no calendário do celular. Sincronia de duas vias com o Google Agenda não existe (pede OAuth e autorização).

## Importar planilha

- Freelas importados aceitam a coluna opcional "Conta Absolute ZRO" (`zro_sub`, uuid): é o elo com a conta do freela
  que o inventário do Carro do Freela usa (`freela.inventario/1`, [maestro-carro-do-freela.md](maestro-carro-do-freela.md)).
  Sem ela, o freela fica só com o cadastro local.
- Equipamentos importados entram no inventário **da produtora** (`maestro.equipamentos`, `dono = 'produtora'`). O kit do
  freela (`freela_equipamentos`) não é importado por planilha: o que a produtora cadastra lá é `origem = 'maestro'` e o
  que vem do Carro do Freela continua só leitura.
