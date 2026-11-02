# ADR 0040 — A Z: modelo por plano, custo real e teto diário

**Status:** aceita (02/11/2026, decisão do titular; adendo à [ADR 0039](0039-planos-zero-orbita-absoluto.md))

## Contexto

O chat de produção da Z gravava tokens só em `zro.ia_mensagens` e gastava 1 crédito; não gravava em `zro.z_lab_uso`, e
o painel /admin/custos mostrava zero. A Z respondia sempre com o Opus 5.5 (cerca de US$ 0,024 por resposta), mesmo no
plano grátis. Sem teto em dólar, só a franquia por mensagens segurava o gasto.

## Decisão

**Modelo por plano** (`packages/core/src/z-plano.ts`, o único lugar com os ids e o mapa):

| Nível      | Modelo                               |
| ---------- | ------------------------------------ |
| Zero       | Haiku 5.5 (`claude-haiku-5-5`)       |
| Órbita     | Sonnet 5.5 (`claude-sonnet-5-5`)     |
| Absoluto   | Sonnet 5.5                           |
| Indefinido | Sonnet 5.5 (a resposta nunca quebra) |

**Qual nível vale** (vem de `zro.niveis_efetivos`, ADR 0039; legado = Absoluto, teste de 15 dias = Absoluto, concessão =
o nível concedido, admin = Absoluto):

- **Z do HUB** (conversa sem plataforma): o **maior** nível da pessoa entre os apps.
- **Z chamada de dentro de um app**: o nível da pessoa **naquele app** (produto de origem da conversa, que vem do token,
  nunca do corpo). Se o app não tem linha de nível, vale o maior entre todos.
- Falha ao ler o nível ou sem nenhum: modelo Sonnet, gravado com nível nulo.

A franquia de mensagens (`zro.ai_credits`) continua da organização, como na 0039; só o modelo segue o nível.

**Administração da plataforma** (`platform_role = admin`) segue usando a versão publicada no Laboratório (modelo e
tamanho da resposta). Para clientes, o modelo é o do plano; o tamanho da resposta publicado ainda vale. O Laboratório e o
Rift continuam em `IA_MODELO` (padrão Opus 5.5).

**Custo real** (migração `0056`): cada resposta do chat grava uma linha em `zro.z_lab_uso` (`servico='claude'`, modelo,
tokens de entrada/saída/cache, `custo_usd` por `custoIaUsd`, chave `claude:<perguntaId>`, idempotente) com as colunas
novas `org_id`, `produto`, `nivel` e `origem='chat'`. O registro vem primeiro em `concluirTurno`, em try/catch (falhar
não derruba a resposta). O uso é acumulado fora do try (`executarTurno`, `apps/hub-web/lib/ia/turno-producao.ts`): se o
stream abortar ou der erro depois de gastar tokens, o `finally` grava o que o provedor já contou (inclusive o parcial da
volta interrompida). A linha entra como sistema (`asSystem`): a RLS da tabela segue só da administração, e pessoa comum
não lê nem grava (teste de isolamento). O teto do Laboratório (`z_lab_config`) passa a ignorar `origem='chat'`.

**Teto diário em dólar do chat de clientes** (dia no fuso de Fortaleza, como os Custos), conferido em `iniciarTurno`
antes de criar conversa ou chamar o modelo:

- Por pessoa: **US$ 1,00/dia** (cerca de 80 respostas do Sonnet). Global: **US$ 20,00/dia** (cerca de 1.600).
- `Z_TETO_USUARIO_DIA_USD` e `Z_TETO_GLOBAL_DIA_USD` trocam os valores. Ausente ou inválido usa o padrão (nunca "sem
  teto"); `0` bloqueia tudo. Bloqueia ao **chegar** ao teto (`>=`), como o do Laboratório.
- Bateu: 429 `quota_exceeded` com "Você conversou bastante com a Z hoje. Ela volta amanhã." (por pessoa) ou "A Z está com
  muita procura hoje. Tente de novo amanhã." (global). Sem valores em dólar na mensagem. Nada é gasto: nem crédito, nem
  conversa nova. A franquia por mensagens e as recargas não mudam.

**Painel** (/admin/custos › Z dos clientes): hoje (com o teto), mês, respostas e custo médio, por modelo e por nível,
lendo `z_lab_uso` com `origem='chat'`.

**Preços** (`IA_PRECOS`, por milhão de tokens, US$): Opus 5.5 4/20, Sonnet 5.5 2/10, Haiku 5.5 0,10/0,50 (conferidos na
tabela da API em 06/10/2026; o Haiku cobra 0,50/2,50 só em prompts acima de 100 mil tokens, o que o chat não atinge).
O id com data que o provedor devolver usa o preço do prefixo.

## Consequências

- Resposta do plano Zero custa cerca de 1/20 do que custava no Opus; Órbita e Absoluto, cerca de metade.
- O gasto de uma resposta interrompida antes do fim da volta é o que o provedor tinha contado até ali (mínimo).
- Trocar de versão de modelo é mudar `IA_MODELOS` e `IA_PRECOS` em um lugar.
- Conta legada (Absoluto) responde com Sonnet: o mesmo plano que tinha, com modelo mais barato.
