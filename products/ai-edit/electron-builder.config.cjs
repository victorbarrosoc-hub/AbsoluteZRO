// Empacotamento do app de desktop (npm run dist:mac / dist:win, ou o GitHub Actions em
// .github/workflows/ai-edit-desktop.yml), no molde do Synquei. Nome, id e arquivos saem de src/produto.js: o
// rebranding troca tudo num lugar só.

const { PRODUTO } = require('./src/produto.js')

module.exports = {
  appId: PRODUTO.appId,
  productName: PRODUTO.nome,
  copyright: 'Copyright © 2026 Absolute ZRO',
  artifactName: `${PRODUTO.arquivo}-\${version}-\${os}-\${arch}.\${ext}`,
  directories: { output: 'dist', buildResources: 'build' },
  // o app é a mesma página de app/, servida de dentro do app.asar pelo protocolo próprio (desktop/main.cjs).
  // Sem dependências de produção: só o Electron e estes arquivos (vendor/ sai do npm run vendor).
  asar: true,
  files: ['package.json', 'desktop/**/*', 'app/**/*', 'src/**/*', 'presets/**/*.json', 'vendor/**/*', 'build/icon.png', '!**/*.map', '!**/*.md'],
  // fusíveis: o executável não vira um Node com as permissões do app e só o app.asar conferido é carregado
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  },
  mac: {
    target: [{ target: 'dmg', arch: ['universal'] }],
    category: 'public.app-category.video',
    icon: 'build/icon.png',
    minimumSystemVersion: '12.0',
    // custo zero (decisão do titular, 26/10/2026): assinatura ad-hoc, sem certificado da Apple. O instalador pelo
    // Terminal (instalar.sh) não passa pelo aviso; o .dmg baixado pede "Abrir Mesmo Assim" na primeira vez.
    identity: '-',
    hardenedRuntime: false,
    gatekeeperAssess: false,
    notarize: false,
    extendInfo: {
      NSDesktopFolderUsageDescription: `O ${PRODUTO.nome} lê os vídeos que você escolhe para editar.`,
      NSDocumentsFolderUsageDescription: `O ${PRODUTO.nome} lê os vídeos que você escolhe para editar.`,
      NSDownloadsFolderUsageDescription: `O ${PRODUTO.nome} lê os vídeos que você escolhe e grava as exportações onde você mandar.`,
      NSRemovableVolumesUsageDescription: `O ${PRODUTO.nome} lê os cartões e discos externos que você escolher.`,
      NSNetworkVolumesUsageDescription: `O ${PRODUTO.nome} lê os volumes de rede que você escolher.`,
    },
  },
  dmg: { title: PRODUTO.nome, contents: [{ x: 140, y: 200 }, { x: 400, y: 200, type: 'link', path: '/Applications' }] },
  win: { target: [{ target: 'nsis', arch: ['x64', 'arm64'] }], icon: 'build/icon.png' },
  // só para o usuário atual, sem senha de administrador
  nsis: { oneClick: true, perMachine: false, createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: PRODUTO.nome, artifactName: `${PRODUTO.arquivo}-\${version}-windows-setup.\${ext}` },
  linux: { target: ['dir'], category: 'AudioVideo', icon: 'build/icon.png' },
}
