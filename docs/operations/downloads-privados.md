# Downloads com repositórios privados

Desde 25/10/2026 os repositórios antigos (nossom, synquei, baixadordodrive, tpeasy, carrodofreela-app) estão
privados e arquivados, e o AbsoluteZRO também vai ficar privado. Os instaladores (DMG/EXE) continuam nos GitHub
Releases desses repositórios, mas o visitante não consegue mais abrir um link `github.com/.../releases/download/...`.

## Como o download funciona

Nenhuma página, instalador de uma linha ou app de desktop aponta para o GitHub direto. Tudo passa pela rota
`/baixar` do site do próprio app, que:

1. lê o Release pela API do GitHub com `GITHUB_TOKEN`;
2. pede o arquivo à API de assets (`Accept: application/octet-stream`) sem seguir o redirecionamento;
3. manda o visitante (302) para o endereço assinado e temporário que o GitHub devolveu. O arquivo não passa pela Vercel.

Sem token e com repositório público, a rota usa o link normal. `/baixar/diag` diz por que o download não sai (sem
token, token recusado, sem acesso, Release ausente) sem mostrar o token.

| App       | Rotas                                                                             | Fontes, na ordem                                                                   | Código                                                                   |
| --------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| SOBEDESCE | `/baixar/mac`, `/baixar/windows`, `/baixar/versao`                                | AbsoluteZRO `sobedesce-versao-de-teste`; reserva baixadordodrive `versao-de-teste` | `products/sobedesce/web/src/lib/release.ts`                              |
| Synquei   | `/baixar/mac`, `/baixar/windows`, `/baixar/versao`, `/baixar/diag`                | AbsoluteZRO `synquei-app-desktop`; reserva synquei `app-desktop`                   | `products/synquei/api/baixar.js`                                         |
| NOSSOM    | `/baixar/mac-arm64`, `/baixar/mac-x64`, `/baixar/windows`, `/baixar/diag`         | AbsoluteZRO `nossom-v<versão>`; reserva nossom `desktop-v0.2.2`                    | `products/nossom/lib/desktop-releases.ts`, `products/nossom/app/baixar/` |
| NOSSOM    | `/baixar/atualizacoes/<arquivo>` (atualização automática assinada, quando houver) | AbsoluteZRO `nossom-atualizacoes`                                                  | idem                                                                     |

O HUB (`apps/hub-web/lib/downloads.ts`) aponta para essas rotas dos sites; `tests/integration/downloads.test.ts`
recusa qualquer link para `github.com`.

Instaladores de uma linha (`instalar.sh`/`instalar.ps1`) e os atualizadores do SOBEDESCE e do Synquei já leem
`<site>/baixar/versao` e baixam `<site>/baixar/<sistema>?build=N`. O NOSSOM Desktop assinado lê o feed em
`https://nossom-teal.vercel.app/baixar/atualizacoes/` (`.github/workflows/nossom-desktop.yml`); as prévias atuais não
têm atualização automática.

## Variável obrigatória na Vercel

Os projetos Vercel **sobedesce**, **synquei** e **nossom** precisam de:

- `GITHUB_TOKEN` = token fino do GitHub (fine-grained, começa com `github_pat_`), **só leitura de Contents**
  (Repository permissions › Contents: Read-only; nada mais), com acesso aos repositórios **AbsoluteZRO**,
  **baixadordodrive**, **synquei** e **nossom**.
- Em Production e Preview. Depois de salvar, publicar de novo o projeto para a variável valer.
- Conferir em `https://<site>/baixar/diag` (Synquei e NOSSOM): `token: true`, `tipoToken: "fino"`, `motivo: null`.

Sem esse token, com os repositórios privados, os botões de download voltam para a página com "indisponível" e os
apps de desktop não acham versão nova. O token nunca vai para o Git, issue, PR ou chat; só no painel da Vercel. Ao
renovar (tokens finos expiram), trocar nos três projetos.

## Absolute ZRO para computador (projeto Vercel absolutezro)

O app do próprio HUB (`apps/hub-desktop`) publica no Release **`hub-desktop`** do AbsoluteZRO
(`.github/workflows/hub-desktop.yml`: Mac e Windows só em push na `main` que mexe em `apps/hub-desktop/**`, em tag
`hub-desktop-v*` ou pelo botão "Run workflow"). O HUB entrega por:

| Rota                                     | O que faz                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `/baixar/hub/mac`, `/baixar/hub/windows` | 302 para o instalador (`?build=N` pede um build exato); sem Release, "Em breve" |
| `/baixar/hub/versao`                     | `versao.json` do Release (build, versão, SHA-256); o app compara e avisa        |
| `/baixar/hub/diag`                       | por que o download não sai, sem mostrar o token                                 |

Código: `apps/hub-web/lib/hub-desktop-release.ts`. O projeto Vercel **absolutezro** precisa do mesmo `GITHUB_TOKEN`
fino (Contents: Read-only, com acesso ao AbsoluteZRO), em Production e Preview, e de uma nova publicação depois de
salvar. Conferir em `https://absolutezro.com/baixar/hub/diag`: `token: true`, `tipoToken: "fino"`,
`motivo: null`. Opcionais: `HUB_DESKTOP_REPO` e `HUB_DESKTOP_TAG` (padrão `victorbarrosoc-hub/AbsoluteZRO` e
`hub-desktop`).
