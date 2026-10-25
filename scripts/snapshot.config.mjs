// Regras de cópia de cada produto (scripts/snapshot-product.mjs). Inventário completo:
// docs/architecture/source-inventory.md.

const PUBLICAR_DESATIVADO = `#!/usr/bin/env node
// DESATIVADO NA CÓPIA ABSOLUTE ZRO.
// O original (carrodofreela-app/app/src/publicar.js) gera os builds e dá push no repositório de produção
// do Carro do Freela, que publica o domínio. Uma cópia dentro do HUB nunca publica o original
// (PRD §6.2 e CLAUDE.md). A versão integral está no commit registrado em SOURCE_MANIFEST.md.
console.error('publicar.js está desativado nesta cópia: o HUB não publica o Carro do Freela.')
process.exit(1)
`

export const PRODUTOS = {
  'carro-do-freela': {
    titulo: 'Carro do Freela',
    subpasta: 'app',
    visibilidade: 'privado (cópia autorizada pelo titular em 25/10/2026 para o repositório público AbsoluteZRO)',
    licenca: 'sem arquivo de licença; código proprietário do titular',
    stack: 'HTML/JS sem dependências; build em Node (src/build.js); testes Playwright; Supabase (projeto do original) e Web3Forms',
    estrategia: '(d) link externo com identidade separada + (c) adaptador de contrato `job.created` no HUB',
    remover: [/^public\/(index|artifact|fase-\d+(-artifact)?)\.html$/],
    trocar: [
      {
        de: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
        para: 'SUBSTITUIR_PELA_CHAVE_ANON_DO_PROJETO_NOVO',
        motivo: 'chave anon do Supabase de produção do original',
      },
      { de: /xakafeuvaerkqpkarrxt/g, para: 'projeto-novo-substituir', motivo: 'referência ao projeto Supabase de produção do original' },
      {
        de: /ce5604dd-eeae-41a9-a61d-d1bd58302d85/g,
        para: 'SUBSTITUIR_PELA_CHAVE_WEB3FORMS_NOVA',
        motivo: 'chave Web3Forms do original (entrega no e-mail do original)',
      },
    ],
    substituir: { 'src/publicar.js': PUBLICAR_DESATIVADO },
    motivoSubstituir: { 'src/publicar.js': 'script que dá push no repositório de produção do original; trocado por um aviso que encerra' },
    observacoes: [
      'A lista `src/crew.json` é FICTÍCIA: o sha256 confere com `src/crew.selo.json` (c68186fd…). A lista real nunca esteve no git.',
      'Os HTML gerados em `public/` (index, artifact, fase-N) saíram da cópia: são saída de `npm run build` / `npm run build:fases` e embutiam as chaves do original.',
      'O build e os testes dependem de Playwright/Chromium. Rode-os dentro desta pasta; ela não faz parte dos workspaces do monorepo.',
      'Para operar de verdade a partir desta cópia: criar projeto Supabase e chave Web3Forms NOVOS e trocar os marcadores SUBSTITUIR_*.',
    ],
  },
  tpeasy: {
    titulo: 'TPeasy',
    visibilidade: 'privado (cópia autorizada pelo titular em 25/10/2026 para o repositório público AbsoluteZRO)',
    licenca: 'sem arquivo de licença; código proprietário do titular',
    stack: 'PWA em HTML/CSS/módulos ES, sem build; Supabase opcional (desligado: SUPABASE_URL vazio em app/js/config.js)',
    estrategia: '(d) link externo + (c) adaptador de roteiro (backup JSON `app: "tpeasy", version: 1`)',
    observacoes: [
      'Nenhuma credencial no código: `app/js/config.js` já vem com SUPABASE_URL e SUPABASE_KEY vazios.',
      'O modelo do roteiro (id, title, body com marcações `# bloco`, `[pausa]`, `**ênfase**`, `((nota))`, fav, target) é o contrato usado por packages/integrations/src/tpeasy.ts.',
    ],
  },
  sobedesce: {
    titulo: 'SOBEDESCE',
    visibilidade: 'público',
    licenca: 'MIT (package.json); avisos de terceiros preservados nos arquivos copiados',
    stack: 'Electron 44 + Node (desktop, src/), Preact (public/), site Next.js 16 + Drizzle + Postgres/PGlite (web/)',
    estrategia:
      '(c) adaptador do resumo `.sobedesce/descargas.jsonl` v1 + relatório `SOBEDESCE_copia_*.xxh64` → ZroMediaManifest; (d) app e conta originais seguem separados',
    observacoes: [
      'O desktop roda local e não passa arquivos por servidor; o HUB só lê o resumo e os relatórios que o SOBEDESCE grava nos destinos.',
      'O site (web/) tem conta própria (scrypt, sessões com hash sha256, limite de tentativas). O HUB replica esse padrão em packages/auth, com banco novo.',
      '`.github/workflows/desktop.yml` está dentro de products/: o GitHub só executa workflows da raiz, então ele não roda aqui.',
    ],
  },
  synquei: {
    titulo: 'Synquei',
    visibilidade: 'público',
    licenca: 'sem arquivo de licença; código do titular',
    stack: 'Site + app em HTML/CSS/módulos ES sem build; desktop Electron 44 (desktop/) com ponte para o DaVinci Resolve Studio',
    estrategia: '(c) adaptador: manifest validado → plano de organização (dry-run) no formato de pastas do Synquei; (d) app original separado',
    observacoes: [
      '`desktop/organizador.cjs` já consome o `descargas.jsonl` do SOBEDESCE. O HUB valida o mesmo contrato antes de propor qualquer organização.',
      '`scripts/release.mjs limpar` usa a API de Releases só dentro do CI do original; workflows em products/ não rodam.',
    ],
  },
  nossom: {
    titulo: 'NOSSOM',
    visibilidade: 'público',
    licenca: 'sem arquivo de licença; THIRD_PARTY_NOTICES.md preservado',
    stack: 'Next.js 16 + React 19, Supabase (contas/cotas), RunPod Serverless, Stripe, Electron (desktop/)',
    estrategia: '(d) link externo com conta própria; (c) contrato `edit.timeline.ready` → NOSSOM especificado, sem chamada às APIs do original',
    trocar: [{ de: /iaavcsyoybnswtfnrvtu/g, para: 'projeto-novo-substituir', motivo: 'referência ao projeto Supabase de produção do original' }],
    observacoes: [
      'O áudio dos usuários fica no dispositivo (IndexedDB) e o HUB não recebe áudio; ver products/nossom/source/docs/architecture.md.',
      'Cotas atômicas (advisory lock + idempotência por request_id) e eventos fora de ordem da assinatura foram usados como referência em infra/migrations.',
    ],
  },
}
