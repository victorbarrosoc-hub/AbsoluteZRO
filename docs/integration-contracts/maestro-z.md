# Maestro no ecossistema: Z, eventos, agenda e acesso (28/10/2026)

O que o funil, os números, a importação, a agenda por assinatura e o acesso por cliente do Maestro (migrations
`0014`–`0018` de `products/maestro/drizzle`) ligam com o resto da Absolute ZRO, e o que está **pronto e desligado**.

## Identidade e acesso por cliente

- As pessoas do Maestro são as contas Absolute ZRO da organização (claims `zro_org`/`zro_products`/`zro_release` do
  login único, gravadas em `maestro.members` a cada login; papel pela tabela fixa de `src/lib/papeis.ts`). Não existe
  cadastro de usuário no Maestro: convite e papel são no HUB (`/equipe`).
- O acesso por cliente (`maestro.acesso_restrito`, `maestro.acesso_clientes`) só restringe quem já é membro com papel
  `equipe` ou `leitura`. Se o HUB promover a pessoa a gestão, ela vê tudo no próximo login; se rebaixar, a restrição
  guardada volta a valer. A regra vale no banco (políticas restritivas `<tabela>_cliente`), também para a Z e o .ics.

## Z: o dia da produtora (pronto, desligado)

- **Rota** `POST /api/zro/maestro/resumo` no Maestro, só leitura, com o **mesmo pedido servidor a servidor do Drive da
  Z** ([sobedesce-drive.md](sobedesce-drive.md)): `Authorization: Bearer <zro-pedido+jwt>` assinado pelo HUB com
  `assinarPedidoDeApp` (`aud` = `maestro-web`, ação `maestro.resumo`, 60 s, `jti` de uso único), conferido em
  `products/maestro/src/lib/zro/pedido.ts`.
- **Quem**: o `sub` do pedido; a organização é a do último login dele no Maestro, só se esse login tinha acesso
  (`temAcesso`) e ele segue ativo. Senão `404 sem_vinculo` (neutro). Limite: 30 a cada 10 min por pessoa.
- **Resposta** (JSON, sem cache): `fonte: "Maestro"`, `organizacao`, `gerado_em` (ISO), `hoje`, `link` (a tela Hoje),
  `retornar_hoje[]` (nome, tipo pedido|cliente, data, nota), `vencendo[]` e `com_o_cliente[]` (card, cliente, prazo ou
  desde), `contagens` (pedidos novos, orçamentos aguardando, agenda de hoje, cards atrasados) e `dinheiro` (meta e
  faturado do mês, caixa, a receber e a pagar da semana, em centavos) **só para administração e gestão**; `null` para
  os outros. Tudo lido como a pessoa (`asUser`, RLS e acesso por cliente). Nada é guardado.
- **Para ligar** (estudo MakersHub §4.5, espera decisão do titular sobre cota e plano da Z): a ferramenta só leitura
  na Z do HUB (`packages/core/src/ia*.ts`, no molde de `ia-drive.ts`), com o texto devolvido como dado, a fonte e a
  hora, e o teste ponta a ponta. Escrever pela Z (criar pedido, marcar contato) fica para depois, sempre com
  confirmação explícita.

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
