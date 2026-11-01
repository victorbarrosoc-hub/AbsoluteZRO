# ADR 0037 — Higgsfield nas Conexões: criar imagem e vídeo com os créditos da pessoa

**Status:** aceita (01/11/2026, pedido do titular)

## Contexto

O titular pôs o acesso da Higgsfield no Rift Motion (gerar animações com IA direto na plataforma) e pediu o mesmo no
AEON: gerar imagens e cenas direto para a Mídia, mostrar quanto crédito a pessoa tem e quanto já usou, três opções de
gasto para escolher, e telas (imagens) antes do vídeo para gastar menos vendo o que vai ser feito. O Rift guardava a
conexão no banco dele (`rift.conexoes`); com dois apps, isso viraria dois logins na Higgsfield para a mesma pessoa,
contra o comportamento de ecossistema (uma conta, os apps se reconhecem, nada duplicado) e o molde da ADR 0026.

## Decisão

- **A Higgsfield é uma Conexão do HUB**, como o Google Agenda (ADR 0026): a pessoa conecta uma vez em `/conexoes` e os
  apps usam por ali. Só a porta "conta" (OAuth com PKCE S256 no login da Higgsfield, registro dinâmico do HUB pela
  RFC 7591, sem segredo), com os créditos do plano da própria pessoa. Nada de chave de API guardada.
- **Guarda** (`infra/migrations/0051_higgsfield.sql`): a conexão é uma linha de `zro.conexoes` (provedor `higgsfield`,
  tokens só cifrados com `ZRO_CONEXOES_KEY`, coluna `cliente` com o client_id), o mesmo "Usado por" de
  `zro.conexao_apps`, `zro.apps_oauth_externos` (o registro do HUB na Higgsfield, só o sistema lê) e `zro.ia_geracoes`
  (cada pedido de um app: saída, modelo, opção, custo informado antes, estado e resultados; RLS por pessoa, sem apagar).
- **API para os apps** (escopo de família `zro.higgsfield`, só os apps de `APPS_COM_HIGGSFIELD`: AEON e Rift Motion):
  `GET /api/v1/higgsfield` (saldo, plano, gasto do mês pelo extrato da Higgsfield, o que o app usou no mês e o preço
  agora das telas 1/2/4 e das três opções) e `POST|GET /api/v1/higgsfield/gerar` (envio da referência, telas, animar,
  andamento). As três opções são as do Rift: Rápido (`grok_video_v15_lite`), Equilibrado (`kling2_6`) e Máxima qualidade
  (`kling3_0` pro); as telas, `gpt_image_2_5` flare baixa. Sem som: o som vem do editor e da NOSSOM.
- **Não fingir saldo nem preço**: todo número vem da Higgsfield na hora (`get_cost`, `balance`, `transactions`). Sem
  preço ou sem saldo informados, ou saldo que não cobre, não gera (503 / 429 `quota_exceeded` com a frase). Gerar só
  quando a pessoa toca; o vídeo pergunta antes, com o preço. Um pedido que pode ter saído nunca se repete sozinho.
- **O arquivo não passa pelo HUB**: a referência vai do navegador direto para o envio pré-assinado da Higgsfield e o
  resultado volta da CDN dela (CORS aberto, conferido em 01/11/2026). O HUB só segura a credencial e o registro.
- **O cartão em `/conexoes` só aparece se algum app que usa a Higgsfield existe para a pessoa** (gate da migration
  0049): hoje AEON e Rift Motion estão fechados, então só a conta `admin` vê.
- **No AEON**: "Criar com IA" na Mídia e no player (a partir do quadro atual), repasse `/api/zro/higgsfield*` com o
  token da sessão, resultado na Mídia (imagem como clipe parado de 5 s, vídeo como veio), guardado no disco do
  navegador. Só na web por enquanto. É exceção explícita ao "custo zero" do AEON (ADR 0020): o custo é do plano da
  própria pessoa, nunca da Absolute ZRO.

## Consequências

- O Rift Motion troca a conexão própria pela do HUB (mesma API, mesmas opções); a sessão do Rift foi avisada.
- Em produção precisa da migration `0051` no deploy e de `ZRO_CONEXOES_KEY` (já existe pelo Google Agenda). Não testado
  contra a Higgsfield de verdade a partir do HUB: o registro dinâmico e o MCP seguem o que o Rift usa.
- Trocar `ZRO_CONEXOES_KEY` obriga a conectar de novo (como o Google Agenda).
