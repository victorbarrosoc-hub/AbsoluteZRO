# ADR 0033 — Laboratório da Z: voz, ditado, anexos e configuração, só para o admin

**Status:** aceita (30/10/2026, pedido do titular; pontos em aberto no fim)

## Contexto

O titular quer a Z como uma IA conversacional "no mesmo jeito que o ChatGPT": falar e ouvir (voz ao vivo), ditar no
campo, mandar qualquer arquivo (foto, vídeo, documento) e um painel para configurar a personalidade dela. "A Z é uma
mulher, estilo a Sol do ChatGPT." Tudo isso custa por uso e só vai para os clientes quando os planos estiverem sendo
comprados. Até lá, um **modelo teste** no perfil de administrador, para ele aperfeiçoar a Z. Ele já tem ElevenLabs
(plano Creator) e pôs `ELEVENLABS_API_KEY` no projeto `absolutezro` da Vercel.

## Decisão

- **Onde**: console, `/admin/laboratorio` (Testar) e `/admin/laboratorio/configurar`. Só o papel **admin** da
  plataforma (o suporte não vê): `notFound()` no layout e em cada página, `adminDoLab()` (`requirePlatformAdmin`) em
  toda rota `/api/v1/admin/z-lab/*` e em toda função do core. A Z dos clientes não muda: sem versão publicada (e com
  a trava desligada), ela segue o texto do código. A Z continua sem aba principal.
- **Banco** (migração `0036_laboratorio_z.sql`): `z_lab_config` (teto por dia), `z_lab_uso` (cada chamada paga, chave
  única de idempotência), `z_rascunho`, `z_versoes` (imutáveis por gatilho), `z_publicacao`, `z_conhecimento` e
  `z_recursos`. RLS ligado e forçado; política `zro.is_platform_admin()` (papel admin, conta ativa, e-mail confirmado).
  Quem não é admin não vê uma linha. Os clientes leem só `zro.z_config_publicada()` (a versão publicada, e só com a
  trava `publicar_config` ligada).
- **Custo**: antes de qualquer chamada paga, `conferirTeto`: **sem teto = bloqueado** (regra das quotas); passou do
  teto do dia (fuso de Fortaleza) = bloqueado até o dia seguinte ou até subir o teto. Depois, `registrarUso` com tokens,
  caracteres e segundos e o custo estimado (tabela pública: Claude por modelo; ElevenLabs Creator: Flash/Turbo US$ 0,04
  e Multilingual/v3/v4 US$ 0,08 por mil caracteres, Scribe v2 US$ 0,22/h, Scribe v2 Realtime US$ 0,39/h; Voice Design
  estimado como três amostras do texto a US$ 0,08 por mil). Entra nos Custos do console ("Laboratório da Z").
- **Voz como a do ChatGPT**: mãos livres (escuta ao vivo pelo WebSocket do **Scribe v2 Realtime**, com VAD da própria
  ElevenLabs e token de uso único pedido pelo HUB, então a chave nunca vai para o navegador) ou segure para falar
  (grava e transcreve com **Scribe v2**, mais barato). A resposta do Claude chega em streaming e cada frase fechada já
  vira voz (**`/v1/text-to-speech/{voz}/stream`**, PCM 24 kHz, modelo **Flash v2.5** por padrão, o de menor latência
  com português), tocada enquanto chega. Falar por cima corta a Z (barge-in). Legenda ao vivo e o tempo de cada etapa
  (escuta, primeira palavra, primeira voz). O modelo do Claude é escolhido na hora (o da Z hoje ou um mais rápido).
- **A Z é uma mulher**: a personalidade proposta no rascunho (`Z_IDENTIDADE_LAB`) fala de si no feminino ("estou
  pronta", "fiquei curiosa"), calorosa, leve e direta, nunca robótica. A lista de vozes abre filtrada nas femininas em
  português do Brasil da conta; se nenhuma servir, o **Voice Design** (`/v1/text-to-voice/design` e
  `/v1/text-to-voice`) cria uma a partir de uma descrição editável ("mulher brasileira, voz calorosa, natural e leve,
  fala clara, ritmo tranquilo, sorriso na voz"), salva na conta **só depois da confirmação**. Não dizemos que é a voz
  de outro produto nem imitamos pessoa real.
- **Anexos**: imagem e PDF pelos **arquivos da Anthropic** (leitura nativa, validade de 24 h, apagados ao recomeçar a
  conversa); Word, Excel e PowerPoint viram texto no servidor (ZIP só leitura, limites de partes, tamanho e proporção
  contra bomba, sem macro, sem entidade externa); texto e CSV em UTF-8. O tipo vem do conteúdo, nunca só da extensão.
  Áudio e vídeo: o navegador tira o som e manda em pedaços para o Scribe v2; do vídeo saem quatro quadros-chave. Até
  4 MB por arquivo no servidor (limite da função), 300 MB e 30 min para áudio e vídeo. Nada é guardado no HUB; os
  dados vão só para a Anthropic e a ElevenLabs.
- **Configurar**: quem a Z é, tom (próxima ↔ formal, curta ↔ detalhada), regras e limites, instrução por plataforma,
  textos de referência (dados, nunca instruções, no cache), voz e saudação, modelo e tamanho da resposta, teto por
  dia. "Salvar versão" = número imutável com nota; "Diferenças" e "Comparar" (rascunho × versão ou padrão, lado a
  lado, no Testar); "Restaurar"; "Publicar para os clientes" desligado até a trava `publicar_config` (confirmação e
  auditoria).
- **Liberação por plano**: `z_recursos` (voz, ditado, anexos, publicar a configuração), tudo desligado; ligar pede
  confirmação e fica em `audit_logs` (`z_lab.recurso`). `zro.z_recurso_liberado(recurso, org)` já responde para a Z dos
  clientes quando ela ganhar essas funções.
- **Microfone**: o `Permissions-Policy` do HUB segue `microphone=()` em tudo, menos em `/admin/laboratorio`
  (`microphone=(self)`); o link do console abre a tela num carregamento novo para valer.
- **Chaves**: `IA_ANTHROPIC_KEY` (a de sempre) e `ELEVENLABS_API_KEY`, só no servidor. Faltou, a tela mostra
  "Conecte a chave" com o nome da variável; nunca há campo de chave na interface nem chave no log. Os endereços falsos do
  e2e (`ZRO_ANTHROPIC_URL`, `ZRO_ELEVENLABS_URL`, `ZRO_ELEVENLABS_WS_URL`) são ignorados em produção.

## Consequências

- O custo de um minuto de voz fica por volta de **US$ 0,07** com o modelo da Z hoje e **US$ 0,03** com o mais rápido
  (escuta aberta o minuto todo, a Z falando metade, quatro respostas; `custoMinutoDeVoz`). O teto do dia segura
  qualquer surpresa.
- A conversa do laboratório não fica guardada (o navegador manda o histórico a cada turno).
- Levar para os clientes é ligar o recurso por plano; a tela dos clientes ainda precisa ganhar voz, ditado e anexos
  (o painel `<zro-ia>`), lendo `z_recurso_liberado`.

## Em aberto

- Migração `0036` em produção (no deploy, com autorização) e o primeiro teste com as chaves reais.
- Preços conferidos na tabela pública em 30/10/2026; se o plano da ElevenLabs mudar, ajustar `Z_VOZ_MODELOS` e os
  preços do Scribe em `packages/core/src/z-lab.ts`.
