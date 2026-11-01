Ícones oficiais de cada produto **no ar**, copiados das cópias controladas em `products/<produto>/source`
(commits em cada `SOURCE_MANIFEST.md`). Cada marca mantém a própria identidade (PRD §3).
`relay.svg` é o ícone do Relay (ADR 0030; fonte em `products/relay/marca/relay-icone.svg`).
Os ícones dos apps que ainda não lançaram ficam fora de `public/`, em `apps/hub-web/marca-fechada` (revisão de
01/11/2026), e só saem pela rota `/marca/<produto>` para quem o produto existe. Lançou? O ícone volta para cá e entra no
`ICONES_PUBLICOS` de `packages/ui/src/index.tsx`.
