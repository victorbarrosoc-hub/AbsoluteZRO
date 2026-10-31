# Lançamento do AEON — o que vira no dia

**31/10/2026: no ar na web** (titular: "pode subir no web, não faz a versão de computador ainda"). Os dois lados (PRD
§5–§6): no HUB, a migration `0043_aeon_web.sql` (gate `released` com web, api e sso; desktop e download fechados); no
projeto Vercel `aeon`, `RELEASE=released` sem `RELEASE_DESKTOP`. O app de computador abre depois, com uma migration
própria (desktop e download) e `RELEASE_DESKTOP=released` no `aeon`. Mesmo modelo do Carro do Freela
([lancamento-carro.md](lancamento-carro.md)).

| Estado               | Site (`aeon`)                | HUB (gate)                  | A página                                                                                 |
| -------------------- | ---------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| Fechado              | sem `RELEASE`                | `development`               | "Em desenvolvimento"; `/baixar/*` volta para ela                                         |
| **Só na web (hoje)** | `RELEASE=released`           | `released`, web + api + sso | "Abrir o AEON" (`/app/`); Mac e Windows "Em breve", sem link; `/baixar/*` volta à página |
| Com o computador     | + `RELEASE_DESKTOP=released` | + desktop + download (nova) | "Baixar o AEON"; Mac, Windows, navegador e Terminal; `/baixar/*` vai ao Release          |

## O que já está pronto (conferido em 31/10/2026)

- **Página do lançamento** (`products/ai-edit/lancamento/pagina.html`): com `RELEASE=released`,
  `scripts/publicar-site.mjs` troca os trechos marcados do `index.html` — "Baixar" na barra, no menu, no topo ("Baixar o
  AEON") e no fim; a seção `#baixar` (Mac, Windows, navegador e o Terminal, os mesmos destinos do HUB em Downloads) no
  lugar de "Em desenvolvimento"; a Z "No AEON"; "Quanto custa?" (vem na conta Absolute ZRO, inclusive na grátis,
  migration `0013`); a descrição sem "em desenvolvimento". Fechado, nada disso sai do `index.html` publicado
  (`test/fechado.test.js`).
- **`/baixar/mac` e `/baixar/windows`** (`api/baixar.js`): fechado volta para `/#em-desenvolvimento`; aberto vai para
  `AEON-mac-universal.dmg` e `AEON-windows-setup.exe` do Release `ai-edit-app-desktop`. O atualizador do app manda
  para `aeon.absolutezro.com/#baixar`, que só existe na página aberta.
- **Família no subdomínio** (`src/familia.js`): SOBEDESCE, Synquei, NOSSOM, Relay (novo), Revela, TPeasy, Carro e
  Maestro em `<app>.absolutezro.com`, todos respondendo 200 em 31/10/2026.
- **Motores**: velocidade com curva contínua, câmera lenta com fluxo óptico e estabilização por imagem
  ([validation.md](../validation.md), "AEON: motores de câmera lenta e estabilização").

## Na web (31/10/2026, nesta ordem)

1. **Vercel, projeto `aeon`** (Production): `RELEASE` = **`released`** (sem `RELEASE_DESKTOP`).
2. **Mesclar o PR do ramo na `main`**: o HUB (`absolutezro`) aplica a `0043_aeon_web.sql` no build; o `aeon` publica
   a página só na web (log: `publico/ pronto (released, só na web): …, app, src, presets`).
3. Conferir abaixo.

## Depois: o app de computador (quando o titular pedir)

1. Build novo do app (Release `ai-edit-app-desktop`): Actions › `ai-edit-desktop.yml` › Run workflow na `main` com
   `publicar` ligado. Leva velocidade, fluxo óptico e estabilização a quem já tem o app ("Versão nova · Atualizar").
2. Migration nova no HUB com desktop e download ligados para o `ai-edit` (como a 0042 fez com o Relay e o Carro).
3. `RELEASE_DESKTOP=released` no projeto `aeon` e um deploy novo: a página troca para "Baixar o AEON".

## Conferir (com uma conta comum, fora da lista de acesso)

- `https://aeon.absolutezro.com/` — "Abrir o AEON" no topo, a seção Começar com o navegador e Mac/Windows "Em breve";
  nada de "Em desenvolvimento"; o teste ao vivo e a montagem tocando.
- `https://aeon.absolutezro.com/app/` → entra com a conta e abre o editor.
- `/baixar/mac` e `/baixar/windows` → 302 para `/#baixar` (nada de instalador ainda); `instalar.sh` só dá o recado.
- `https://absolutezro.com/` — o AEON na faixa do ecossistema e em Downloads só com o navegador.

## Reversão

1. HUB: Administração › Lançamento › AEON em "Em desenvolvimento", canais desligados (nunca editar a 0043; mudança é
   migration nova).
2. Vercel: tirar `RELEASE` do projeto `aeon` e publicar de novo (o site volta a nascer fechado, com "Em
   desenvolvimento" e `/baixar/*` voltando para a página).
3. O app de desktop já instalado continua pedindo a conta; com o HUB fechado, só a lista de acesso entra.

## Antes de abrir (decisão do titular)

- **Patentes**: a estabilização usa suavização gaussiana e zoom fixo (sem caminho L1 nem recorte dinâmico, que têm
  patente ativa do Google: US8531535B2, US9554043B2). O modo giroscópio, quando vier, cai perto de US9071756B2
  (suavização de giro limitada pela borda, hoje da Insta360). Vale uma revisão de patentes antes de lançar o giroscópio.
- **Modelo do fluxo óptico**: RIFE 4.25 (Practical-RIFE, MIT, código e pesos), treinado no Vimeo-90K; a licença dos
  pesos é a do autor. Baixa do Hugging Face na hora (commit e SHA-256 fixos, `src/modelos.js`); se o repositório sumir,
  o fluxo para e a câmera lenta sai com o quadro mais próximo (o app avisa). Hospedar uma cópia própria resolve.
