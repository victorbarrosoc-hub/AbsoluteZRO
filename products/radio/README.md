# Rádio do set (nome a definir)

> **Mora no HUB** (titular, 05/11/2026): no ar em **absolutezro.com/radio**, com a conta e o banco do HUB. Esta pasta é
> a fonte: o núcleo (`api/_nucleo.js`) e o app (`app/`) vão para o HUB por `node scripts/para-o-hub.mjs` (cópia em
> `apps/hub-web/lib/radio`, conferida por `tests/integration/radio.test.ts`). Mudou algo aqui, rode o gerador.

Voz por botão (push-to-talk) para a equipe da diária, no navegador do celular. Fase 1 da
[ADR 0042](../../docs/decisions/0042-radio-do-set.md): **sem integração com as outras plataformas** (pedido do titular,
05/11/2026); a equipe entra pelo código ou pelo QR. Não lançado: fechado no gate, fora do catálogo do HUB, sem deploy.

## O que faz

Intercom no modelo dos headsets de set (Hollyland Solidcom C1 Pro), no navegador do celular:

- **Diária** com código de 6 letras, QR e link (`?d=CODIGO`). Quem cria fica na Direção; quem entra escolhe o setor.
- **Uma faixa por canal:** Geral e os setores (Direção, Produção, Câmera, Som, Luz, Arte, Elenco), cada uma com cor,
  ícone, medidor ao vivo e quem está no ar. Em cada faixa: **Ouvir** (liga e desliga o canal) e **Falar** (o destino).
  Começa ouvindo Geral e o próprio setor, falando no Geral.
- **TALK:** um toque abre o microfone e trava (fala aberta, full duplex: várias pessoas ao mesmo tempo); segurar fala
  só enquanto aperta (push-to-talk); outro toque fecha. A barra de espaço faz o mesmo no computador.
- **Todos** (Direção e quem criou): fala para todos os canais, inclusive para quem desligou o Geral.
- **Avisos de set** (Silêncio, Ação, Corta, Intervalo) no topo para a Direção; tela inteira, toque e vibração para
  todos. **Tela de cue** preta para o elenco. Tela ligada (Wake Lock) com o rádio aberto.

## Como funciona

- **Voz de aparelho para aparelho** (WebRTC em malha, `app/rtc.js`). O servidor só leva a oferta e a resposta de cada
  par (`api/radio/batida.js`, a cada ~1 s) e grava os avisos. **Nenhuma voz passa nem fica no servidor.**
- Roteamento sem vazamento: cada aparelho diz pelo canal de dados o que escuta; com o TALK aberto, o microfone entra
  só nas conexões de quem escuta o destino. Quem desligou o canal não recebe nem um byte da fala. O medidor de cada
  faixa vem do nível que quem fala manda (10 vezes por segundo), não do áudio.
- **Gate** (raiz `CLAUDE.md`): a página (`api/pagina.js`) e os scripts (`api/recurso.js`) só saem para a sessão com
  `radio` na claim `zro_release` (admin da plataforma ou lista de acesso do HUB). Fora disso, "Página indisponível.";
  nada do app fica no site estático (`publico/` só tem as fontes e o robots).
- **Login único** (`api/zro/*`, cópia do Rift, cookies `rd_*`, cliente `radio-web`). Sem `ZRO_CLIENT_ID` e
  `ZRO_CLIENT_SECRET`, só a página neutra.
- **Banco** `radio` (`db/migrations/`, `npm run migrar` com `RADIO_DATABASE_URL`): diárias, membros, presença, sinais
  (apagados ao ler) e avisos, com RLS por diária. Rotas sempre por `comoPessoa` (papel `radio_app`).

## Limites honestos

- **iPhone: só com o app aberto e a tela ligada.** Tela bloqueada pede app nativo (PushToTalk), que é a fase 2.
- **TURN da Cloudflare** (a ponte para redes que não se alcançam direto, como 4G com CGNAT): liga com
  `CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN` no servidor (projeto Vercel `absolutezro`); `/ice` entrega
  credenciais de 6 h. Sem a chave, só STUN: a lista da equipe mostra "conectando" para quem não ligou.
- Malha: bom até ~10 pessoas por diária. Mais que isso pede servidor de mídia (SFU), decisão do titular (ADR 0042).

## Testar

- `npm test`: banco num Postgres de verdade (migração, gate, RLS, quem avisa) e a voz de ponta a ponta em três Chromium
  com microfone falso (o áudio chega, a Equipe isola por função, o Geral chega a todos, o aviso aparece).
- `npm run dev` com `RADIO_DATABASE_URL` → http://localhost:8091 em **modo local**: sem login, cada navegador escolhe um
  nome. Só liga com `RADIO_LOCAL=1`, sem o login configurado e em localhost; nunca em produção.

## App separado (parado)

O site próprio (radio.absolutezro.com, projeto Vercel `radio`) está parado na página neutra: sem `ZRO_CLIENT_SECRET` e
`RADIO_DATABASE_URL`. Ele continua servindo para o modo local e para os testes desta pasta.
