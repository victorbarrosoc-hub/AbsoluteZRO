# Rádio do set (nome a definir)

Voz por botão (push-to-talk) para a equipe da diária, no navegador do celular. Fase 1 da
[ADR 0042](../../docs/decisions/0042-radio-do-set.md): **sem integração com as outras plataformas** (pedido do titular,
05/11/2026); a equipe entra pelo código ou pelo QR. Não lançado: fechado no gate, fora do catálogo do HUB, sem deploy.

## O que faz

- **Diária**: quem cria é o dono (Direção) e ganha um código de 6 letras, com QR e link (`/?d=CODIGO`).
- **Canais**: Geral (todos) e Equipe (quem tem a mesma função: Direção, Produção, Câmera, Som, Luz, Arte, Elenco).
- **Segure para falar** (ou a barra de espaço no computador), com o "câmbio" sonoro de começo e fim.
- **Avisos de set** (Silêncio, Ação, Corta, Intervalo): só o dono e quem está na Direção mandam; aparecem na tela
  inteira de todos, com toque e vibração.
- **Tela de cue**: preta, sem brilho, para o elenco.
- Mantém a tela ligada (Wake Lock) enquanto o rádio está aberto.

## Como funciona

- **Voz de aparelho para aparelho** (WebRTC em malha, `app/rtc.js`). O servidor só leva a oferta e a resposta de cada
  par (`api/radio/batida.js`, a cada ~1 s) e grava os avisos. **Nenhuma voz passa nem fica no servidor.**
- Roteamento sem vazamento: o transceptor de cada conexão nasce mudo; ao segurar, o microfone entra só nas conexões de
  quem deve ouvir. Quem não está no canal não recebe nem um byte da fala.
- **Gate** (raiz `CLAUDE.md`): a página (`api/pagina.js`) e os scripts (`api/recurso.js`) só saem para a sessão com
  `radio` na claim `zro_release` (admin da plataforma ou lista de acesso do HUB). Fora disso, "Página indisponível.";
  nada do app fica no site estático (`publico/` só tem as fontes e o robots).
- **Login único** (`api/zro/*`, cópia do Rift, cookies `rd_*`, cliente `radio-web`). Sem `ZRO_CLIENT_ID` e
  `ZRO_CLIENT_SECRET`, só a página neutra.
- **Banco** `radio` (`db/migrations/`, `npm run migrar` com `RADIO_DATABASE_URL`): diárias, membros, presença, sinais
  (apagados ao ler) e avisos, com RLS por diária. Rotas sempre por `comoPessoa` (papel `radio_app`).

## Limites honestos

- **iPhone: só com o app aberto e a tela ligada.** Tela bloqueada pede app nativo (PushToTalk), que é a fase 2.
- **Sem servidor TURN**: funciona na mesma rede e na maioria das redes; em 4G com CGNAT algumas conexões não abrem. A
  lista da equipe mostra "conectando" para quem não ligou, sem fingir.
- Malha: bom até ~10 pessoas por diária. Mais que isso pede servidor de mídia (SFU), decisão do titular (ADR 0042).

## Testar

- `npm test`: banco num Postgres de verdade (migração, gate, RLS, quem avisa) e a voz de ponta a ponta em três Chromium
  com microfone falso (o áudio chega, a Equipe isola por função, o Geral chega a todos, o aviso aparece).
- `npm run dev` com `RADIO_DATABASE_URL` → http://localhost:8091 em **modo local**: sem login, cada navegador escolhe um
  nome. Só liga com `RADIO_LOCAL=1`, sem o login configurado e em localhost; nunca em produção.

## Para publicar (pede autorização do titular)

1. Nome e domínio `<nome>.absolutezro.com` (ADR 0025); trocar "Rádio do set" em `app/app.html` e `SITE` em `api/_zro.js`.
2. Migration nova no HUB: produto no catálogo, fechado (`development`), e o cliente OIDC `radio-web`.
3. Schema `radio` e papéis `radio`/`radio_app` no Supabase `AbsoluteZRO`; `npm run migrar`.
4. Projeto Vercel (Root Directory = esta pasta) com `ZRO_CLIENT_ID`, `ZRO_CLIENT_SECRET` e `RADIO_DATABASE_URL`.
