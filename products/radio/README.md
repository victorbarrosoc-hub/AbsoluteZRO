# RADION — Stay connected.

> O rádio do set (ADR 0042, [revisão de 06/11/2026](../../docs/decisions/0042-radio-do-set.md)). Mora em
> **radion.absolutezro.com** (este app, projeto Vercel `radion`, Root Directory `products/radio`) e, até o domínio
> ligar, também em **absolutezro.com/radio** (o HUB serve uma cópia gerada: `node scripts/para-o-hub.mjs`, conferida por
> `tests/integration/radio.test.ts`). Mudou o núcleo ou o app, rode o gerador. Não lançado: fechado no gate.

Voz por botão (push-to-talk) para a equipe da diária, no navegador do celular e do computador.

## O que faz

- **Diária** com código de 6 letras, QR e link (`?d=CODIGO`). Quem cria é o **dono** e fica na Direção; quem entra
  escolhe o setor.
- **Um canal por setor:** Geral, Direção, Produção, Câmera, Som, Luz, Arte, Elenco, cada um com cor, ícone, medidor ao
  vivo e o responsável. **Ouvir** liga e desliga o canal; **Falar** escolhe o destino.
- **TALK:** um toque trava aberto (full duplex), segurar fala só enquanto aperta; outro toque fecha. Barra de espaço no
  computador. **Todos** (dono e Direção) fala em todos os canais.
- **Papéis:** dono (pode tudo), responsável (um por setor, escolhido pelo dono), equipe (fala no próprio setor e ouve o
  Geral), convidado (só ouve). Ninguém silencia o dono nem a Direção.
- **Silêncio:** silenciar uma pessoa (5 min, 15 min ou até reativar), o setor (responsável) ou o set (dono); no
  **Gravando**, só a Direção e o Som falam até o **Corta**; quem foi silenciado vê quem foi e **pede a palavra**;
  "silenciar só para mim" fica no aparelho. Histórico (quem silenciou quem e quando; a voz nunca) para o dono.
- **Avisos de set** (Gravando, Corta, Silêncio, Intervalo) para todos ou um setor; o responsável manda só para o setor
  dele. Tela inteira, som e vibração; **tela de cue** preta para o elenco.
- **Ecossistema:** login único da Absolute ZRO, o **Set** (pílula no topo e item na lateral) e o balão **Apps Absolute
  ZRO** com as plataformas no ar.
- **Página inicial** (`app/site.html`) com telas de verdade (`node scripts/telas-do-site.mjs`): prévia em `/sobre` para
  quem tem acesso; para todos só no lançamento (`RADION_SITE_ABERTO=1`).

## Como funciona

- **Voz de aparelho para aparelho** (WebRTC em malha, `app/rtc.js`), cifrada (DTLS-SRTP). O servidor só leva a oferta e
  a resposta de cada par (`api/radio/batida.js`, a cada ~1 s), os papéis, os silêncios e os avisos. **Nenhuma voz passa
  nem fica no servidor.** TURN da Cloudflare para redes que não se alcançam direto (`/ice`).
- **Poderes no banco** (`db/migrations/0001_poderes.sql`): `radio.moderar`, `radio.avisar` e `radio.silenciados`
  conferem quem pode o quê; o papel `radio_app` não escreve silêncio, mão, histórico, papel nem setor direto. Os outros
  aparelhos veem cada pessoa por um apelido da diária, nunca pelo sub da conta.
- **Quem impõe o silêncio é o aparelho:** o servidor diz quem está silenciado; o aparelho dele fecha o microfone e os
  outros não tocam a voz dele. Um aparelho adulterado poderia furar; fechar isso de vez pede servidor de mídia.
- **Gate** (raiz `CLAUDE.md`): a página (`api/pagina.js`) e os arquivos (`api/recurso.js`) só saem para a sessão com
  `radio` na claim `zro_release` (admin da plataforma ou lista de acesso do HUB). Fora disso, "Página indisponível.".
- **Login único** (`api/zro/*`, cookies `rd_*`, cliente `radio-web`, escopos com `zro.set`) e o repasse do Set
  (`api/zro/set.js`, cópia do Relay).
- **Marca:** `node scripts/marca.mjs` gera `app/marca/` (símbolo, ícones, favicon e os PNG do iPhone). Figtree no
  texto e no logotipo, o nome em ExtraBold 800 (`fontes/`).

## Ligar o radion.absolutezro.com (titular)

1. Console da Absolute ZRO › Apps: cadastrar o cliente **`radio-web`** (confidencial, produto `radio`), com o retorno
   `https://radion.absolutezro.com/api/zro/callback`. O segredo aparece uma vez.
2. Projeto Vercel `radion`: `ZRO_CLIENT_SECRET` (o segredo acima; `ZRO_CLIENT_ID=radio-web` já está), `RADIO_DATABASE_URL`
   (papel `radio`, pooler de transação do AbsoluteZRO-SP), `CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN`.
3. Domínio `radion.absolutezro.com` no projeto `radio`.
4. A migração `0001_poderes.sql` no schema `radio` (`npm run migrar` com o papel dono) antes do primeiro deploy.

## Limites honestos

- **iPhone: só com o app aberto e a tela ligada.** Tela bloqueada pede app nativo (PushToTalk), que é outra fase.
- Malha: bom até ~10 pessoas por diária. Mais que isso pede servidor de mídia (SFU), decisão do titular (ADR 0042).

## Testar

- `npm test`: banco num Postgres de verdade (migrações, gate, RLS, poderes), login e Set contra a Absolute ZRO falsa e
  a voz de ponta a ponta em três Chromium com microfone falso (setor, TALK, Todos, avisos, Gravando e Corta, silenciar e
  pedir a palavra).
- `npm run dev` com `RADIO_DATABASE_URL` → http://localhost:8091 em **modo local**: sem login, cada navegador escolhe um
  nome. Só liga com `RADIO_LOCAL=1`, sem o login configurado e em localhost; nunca em produção.
