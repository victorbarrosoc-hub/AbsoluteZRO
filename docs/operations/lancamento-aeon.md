# Lançamento do AEON — o que vira no dia

Tudo pronto no ramo `claude/ai-edit-primeiro-recorte` e **nada aberto**: o site segue fechado (`RELEASE` ausente) até o
titular mandar. Abrir pede os dois lados (PRD §5–§6): o HUB diz `released` e o projeto Vercel `aeon` tem
`RELEASE=released`. Mesmo modelo do Carro do Freela ([lancamento-carro.md](lancamento-carro.md)).

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

## No dia (nesta ordem)

1. **Build novo do app de desktop** (Release `ai-edit-app-desktop`): Actions › `ai-edit-desktop.yml` › Run workflow
   na `main` com `publicar` ligado, depois do merge do passo 2. É o que leva velocidade, fluxo óptico e estabilização
   para quem já tem o app (ele mostra "Versão nova · Atualizar").
2. **Mesclar o PR do ramo na `main`**. O projeto `aeon` publica a `main` ainda **fechada** (sem `RELEASE`).
3. **Vercel, projeto `aeon`** (Production): `RELEASE` = **`released`** e um deploy novo (a variável só vale no build).
   Log do build: `publico/ pronto (released): index.html, …, app, src, presets`.
4. **HUB**: Administração › Lançamento › AEON em **Lançado**, com os canais web, api, sso, desktop e download ligados
   (mesma tela que abriu o Carro; não precisa migration). A página Downloads do HUB passa a mostrar o AEON.

## Conferir (com uma conta comum, fora da lista de acesso)

- `https://aeon.absolutezro.com/` — "Baixar o AEON" no topo, a seção Baixar com Mac, Windows e Navegador; nada de "Em
  desenvolvimento"; o teste ao vivo e a montagem tocando.
- `https://aeon.absolutezro.com/baixar/mac` → 302 para o `.dmg` do Release; `/baixar/windows` → o `.exe`.
- `https://aeon.absolutezro.com/app/` → o editor (entra com a conta).
- `curl -fsSL https://aeon.absolutezro.com/instalar.sh | bash` instala no Mac.
- No app de desktop antigo: "Versão nova · Atualizar".

## Reversão

1. HUB: Administração › Lançamento › AEON em "Em desenvolvimento", canais desligados.
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
