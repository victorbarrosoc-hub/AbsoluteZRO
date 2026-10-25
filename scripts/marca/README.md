# Marca: OG e ícones

Arte de base gerada no Higgsfield (25/10/2026) a partir do símbolo e das fotos oficiais em
`apps/hub-web/public/brand`. O anel é o mesmo símbolo do wordmark, só que redesenhado em 2048 px.

- `anel-fonte.png`: o anel em alta, base de todos os ícones.
- `og-fundo.jpg`: fundo do OG (eclipse sobre o horizonte).
- `icones.py`: gera `out/` com o ícone do iPhone/Safari (180), PWA (192, 512, maskable), favicon, Mac (grid da
  Apple, 824 em 1024 com sombra) e Windows (`icon.ico` com 16–256, traço reforçado até 48 px).
  `python3 scripts/marca/icones.py` (precisa de Pillow e numpy).
- `og.html`: o OG em 1200×630. Abra no Chromium/Playwright e capture 1200×630.

Onde cada arquivo vai: `apps/hub-web/app/{apple-icon.png,icon.png,favicon.ico,opengraph-image.jpg,twitter-image.jpg}`,
`apps/hub-web/public/icons/*` (manifest) e `apps/hub-web/public/brand/app-icon-*.png` (apps de desktop).
