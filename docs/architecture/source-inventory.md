# Inventário das origens (Fase 0)

Auditoria feita em 25/10/2026, só leitura. Antes e depois de todo o trabalho, `git status` dos cinco originais estava
limpo e o HEAD era o mesmo (`node scripts/check-originals.mjs …`, saída em [../validation.md](../validation.md)).

| Produto         | Repositório                          | Branch · commit       | Visibilidade | Licença                             | Stack                                                               | Infra/serviços do original                                            | Estratégia no HUB                                                    |
| --------------- | ------------------------------------ | --------------------- | ------------ | ----------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Carro do Freela | victorbarrosoc-hub/carrodofreela-app | main · `5fc93a7f82f7` | privado      | sem arquivo (proprietário)          | HTML/JS sem dependências, build Node, testes Playwright             | Vercel (carrodofreela.com.br), Supabase próprio, Web3Forms            | (d) link + (c) contrato `job.created`                                |
| TPeasy          | victorbarrosoc-hub/tpeasy            | main · `dfa91e30c686` | privado      | sem arquivo (proprietário)          | PWA HTML/CSS/ES modules                                             | Vercel (tpeasy.vercel.app); Supabase opcional, desligado no código    | (d) link + (c) backup JSON v1                                        |
| SOBEDESCE       | victorbarrosoc-hub/baixadordodrive   | main · `21f3a638dce0` | público      | MIT                                 | Electron 44 + Node; site Next 16 + Drizzle + Postgres/PGlite        | Vercel (sobedesce.vercel.app), Postgres próprio, Google OAuth, Resend | (c) adaptador `descargas.jsonl` + `.xxh64`; (d) app e conta próprios |
| Synquei         | victorbarrosoc-hub/synquei           | main · `a5ac3f1dfd94` | público      | sem arquivo                         | HTML/ES modules; Electron 44; ponte Lua para DaVinci Resolve Studio | Vercel (synquei.vercel.app)                                           | (c) prévia de organização a partir do manifest; (d) app próprio      |
| NOSSOM          | victorbarrosoc-hub/nossom            | main · `f04e517fa99e` | público      | sem arquivo; THIRD_PARTY_NOTICES.md | Next 16 + React 19, Electron                                        | Vercel (nossom-teal.vercel.app), Supabase, RunPod, Stripe, Anthropic  | (d) link + contrato `edit.timeline.ready`                            |
| AI Edit         | —                                    | —                     | —            | —                                   | não existe                                                          | —                                                                     | scaffold (`products/ai-edit`)                                        |
| Finishing       | —                                    | —                     | —            | —                                   | não existe                                                          | —                                                                     | scaffold (`products/finishing`)                                      |

## Cópias em `products/`

Cada `products/<produto>/SOURCE_MANIFEST.md` registra URL, branch, commit, data, método (`git archive HEAD`, só
arquivos versionados), o que saiu e o que foi trocado. Resumo do saneamento:

- **Carro do Freela**: chave anon do Supabase de produção, referência ao projeto Supabase e chave Web3Forms trocadas
  por marcadores `SUBSTITUIR_*`; `src/publicar.js` (que dá push no repositório de produção) trocado por um aviso que
  encerra; HTML gerados em `public/` removidos (saem do build e embutiam as chaves). A lista `src/crew.json` é a
  fictícia: o sha256 confere com o selo `src/crew.selo.json`.
- **NOSSOM**: referência ao projeto Supabase de produção trocada por marcador.
- **TPeasy, SOBEDESCE, Synquei**: nada sensível encontrado; cópia integral.
- `.git`, `.env*` reais, `.vercel`, `node_modules` e chaves nunca entram. Workflows dentro de `products/` não rodam
  (o GitHub só executa os da raiz).

**Atenção de visibilidade:** TPeasy e Carro do Freela eram privados e agora têm cópia no AbsoluteZRO, que é
**público**. A cópia foi autorizada pelo titular em 25/10/2026. Se a intenção for manter esse código fechado, torne o
AbsoluteZRO privado no GitHub.

## Contratos reais encontrados

- **SOBEDESCE → Synquei já existia**: `<destino>/<Projeto>/.sobedesce/descargas.jsonl` v1 (uma linha por cartão:
  diária, dono, câmera, pasta do cartão, arquivos com tamanho, resultado) e `SOBEDESCE_copia_<data>.xxh64` na pasta
  do cartão em cada destino (formato `xxhsum`, xxHash64 em hex). O Synquei desktop (`desktop/organizador.cjs`) lê o
  mesmo arquivo. O HUB lê igual e acrescenta a prova por destino.
- **TPeasy**: backup `{ app: 'tpeasy', version: 1, scripts[] }` (`app/js/data.js` exportAll/importAll); marcações
  `# bloco`, `[pausa]`, `**ênfase**`, `((nota))`.
- **NOSSOM**: áudio fica no dispositivo (IndexedDB); a conta e as cotas usam Supabase. O HUB não envia áudio.
- **Synquei → NOSSOM**: o Synquei exporta OTIO, FCPXML, xmeml, EDL e tem "Analisar montagem: pontos de SFX numa
  sequência do DaVinci", caminho natural para o contrato `edit.timeline.ready`.

## Achados que afetam o original (não corrigidos aqui)

1. **SOBEDESCE: relatório sobrescrito no mesmo minuto.** O nome é `SOBEDESCE_copia_AAAA-MM-DD_HHMM.xxh64`
   (`src/discos/servico.js`, função `carimbo`). Duas levas do mesmo cartão no mesmo minuto gravam por cima do
   relatório da primeira, e os checksums da primeira leva somem. Reproduzido com o código real no gerador de fixtures
   (`scripts/fixtures/generate-sobedesce.mjs`). O HUB trata com honestidade: esses arquivos aparecem como "sem
   conferência". Sugestão para o original (com autorização): incluir segundos e um sufixo único no nome.
2. **Next 16.3.x tem RCE e DoS publicados** (GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r, GHSA-673q-mjm6-r5xr, corrigidos
   em 16.4.1+). O site do SOBEDESCE (`web/`) usa `next 16.3.8` e o NOSSOM `^16.2.0`. Vale atualizar nos originais,
   com autorização.

## Acessos e decisões pendentes

- Provedor de pagamento, preços, teste grátis, assentos e limites por plano.
- Provedor de e-mail transacional (Resend já é usado pelo SOBEDESCE; conta nova para o HUB).
- Projeto Supabase/Postgres **novo**, organização Vercel e domínio do HUB.
- Editor-alvo para testes de ida e volta de timeline (Resolve é o candidato natural: Synquei já integra).
- Nomes definitivos de AI Edit e Finishing; política de retenção de mídia, LGPD, termos e privacidade.
