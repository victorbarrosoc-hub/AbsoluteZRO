#!/usr/bin/env node
// Gera os fixtures de integração SOBEDESCE → HUB rodando o código REAL do SOBEDESCE (cópia em products/sobedesce,
// commit registrado no SOURCE_MANIFEST) contra cartões Sony falsos em pastas temporárias. Nada de dado pessoal:
// produção, dono e câmera são fictícios. Dois destinos, duas levas do mesmo cartão.
//
//   (cd products/sobedesce/source && npm ci --omit=dev --ignore-scripts)
//   node scripts/fixtures/generate-sobedesce.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { BackupService, RESUMO_ARQUIVO, RESUMO_PASTA } = await import(path.join(RAIZ, 'products/sobedesce/source/src/backup/servico.js'))
const SAIDA = path.join(RAIZ, 'tests/fixtures/sobedesce')

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p))
const escrever = (raiz, rel, conteudo) => {
  const f = path.join(raiz, ...rel.split('/'))
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, conteudo)
}
const xmlSony = `<?xml version="1.0"?><NonRealTimeMeta><Device manufacturer="Sony" modelName="ILME-FX30" serialNo="0000001"/></NonRealTimeMeta>`
const esperar = async (fn) => {
  const t0 = Date.now()
  while (!fn()) {
    if (Date.now() - t0 > 20_000) throw new Error('demorou demais')
    await new Promise((ok) => setTimeout(ok, 20))
  }
}

const discos = []
const svc = new BackupService({
  arquivo: path.join(tmp('zro-fx-estado-'), 'backup.json'),
  listar: async () => discos.map((d) => ({ ...d })),
  vigiaMs: 0,
  keepAwake: { setActive() {} },
  avisar: () => {},
  ejetar: async () => true,
})
await svc.init()
const hdA = tmp('zro-fx-hd-principal-')
const hdB = tmp('zro-fx-hd-backup-')
await svc.criarProjeto({ nome: 'Projeto Exemplo', destinos: [hdA, hdB] })
await svc.ligar(true)

const card = tmp('zro-fx-cartao-')
for (let i = 1; i <= 2; i++) {
  escrever(card, `PRIVATE/M4ROOT/CLIP/C000${i}.MP4`, Buffer.alloc(4096 + i, i))
  escrever(card, `PRIVATE/M4ROOT/CLIP/C000${i}M01.XML`, xmlSony)
}
escrever(card, 'PRIVATE/M4ROOT/MEDIAPRO.XML', '<clips n="2"/>')
discos.push({ caminho: card, nome: 'SD A', id: 'uuid:FIXTURE-CARD-1', capacidade: 64e9 })
await svc.varrer()
await svc.responder({ caminho: card, nome: 'Camera A', camera: 'FX30' })
await esperar(() => !svc.rodando && !svc.fila.length)

// Segunda leva do mesmo cartão (sem formatar): um clipe novo. Atenção: o relatório do SOBEDESCE tem carimbo até o
// MINUTO (SOBEDESCE_copia_AAAA-MM-DD_HHMM.xxh64); duas levas no mesmo minuto gravam por cima do relatório da
// primeira. O fixture preserva esse comportamento real: os arquivos da 1ª leva ficam sem prova de conferência.
escrever(card, 'PRIVATE/M4ROOT/CLIP/C0003.MP4', Buffer.alloc(5000, 3))
escrever(card, 'PRIVATE/M4ROOT/CLIP/C0003M01.XML', xmlSony)
await svc.repetir(card)
await esperar(() => !svc.rodando && !svc.fila.length)

// Cenário 2: outro projeto, um cartão, uma leva só (tudo conferido nos dois destinos).
const hdC = tmp('zro-fx-hd-principal2-')
const hdD = tmp('zro-fx-hd-backup2-')
await svc.criarProjeto({ nome: 'Projeto Unico', destinos: [hdC, hdD] })
await svc.ligar(true)
const card2 = tmp('zro-fx-cartao2-')
for (let i = 1; i <= 3; i++) escrever(card2, `PRIVATE/M4ROOT/CLIP/C010${i}.MP4`, Buffer.alloc(6000 + i, 10 + i))
discos.length = 0
discos.push({ caminho: card2, nome: 'SD B', id: 'uuid:FIXTURE-CARD-2', capacidade: 64e9 })
await svc.varrer()
await svc.responder({ caminho: card2, nome: 'Camera B', camera: 'FX3' })
await esperar(() => !svc.rodando && !svc.fila.length)
await svc.close()

fs.rmSync(SAIDA, { recursive: true, force: true })
fs.mkdirSync(SAIDA, { recursive: true })
const resumo = fs.readFileSync(path.join(hdA, 'Projeto Exemplo', RESUMO_PASTA, RESUMO_ARQUIVO), 'utf8')
fs.writeFileSync(path.join(SAIDA, 'descargas.jsonl'), resumo)
const linhas = resumo
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l))
const pasta = linhas[0].cartao.pasta
for (const [nome, hd] of [
  ['principal', hdA],
  ['backup', hdB],
]) {
  const base = path.join(hd, 'Projeto Exemplo', ...pasta.split('/'))
  const rel = fs
    .readdirSync(base)
    .filter((n) => /^SOBEDESCE_copia_.*\.xxh64$/.test(n))
    .sort()
  rel.forEach((r, i) => fs.copyFileSync(path.join(base, r), path.join(SAIDA, `${nome}-leva${i + 1}.xxh64`)))
}
const resumo2 = fs.readFileSync(path.join(hdC, 'Projeto Unico', RESUMO_PASTA, RESUMO_ARQUIVO), 'utf8')
fs.writeFileSync(path.join(SAIDA, 'unica-descargas.jsonl'), resumo2)
const pasta2 = JSON.parse(resumo2.trim().split('\n')[0]).cartao.pasta
for (const [nome, hd] of [
  ['principal', hdC],
  ['backup', hdD],
]) {
  const base = path.join(hd, 'Projeto Unico', ...pasta2.split('/'))
  const rel = fs
    .readdirSync(base)
    .filter((n) => /^SOBEDESCE_copia_.*\.xxh64$/.test(n))
    .sort()
  rel.forEach((r) => fs.copyFileSync(path.join(base, r), path.join(SAIDA, `unica-${nome}.xxh64`)))
}
fs.writeFileSync(
  path.join(SAIDA, 'README.md'),
  `# Fixture SOBEDESCE (gerado)

Gerado por \`scripts/fixtures/generate-sobedesce.mjs\` com o código real do SOBEDESCE (products/sobedesce, ver
SOURCE_MANIFEST.md) em ${new Date().toISOString().slice(0, 10)}. Cartão Sony falso, dois destinos ("principal" e
"backup"), duas levas do mesmo cartão. Nomes fictícios; nenhum dado pessoal.

- \`descargas.jsonl\`: o resumo que o SOBEDESCE grava em \`<destino>/<Projeto>/.sobedesce/\` (${linhas.length} linhas).
- \`<destino>-levaN.xxh64\`: os relatórios de checksum gravados na pasta do cartão em cada destino. As duas levas
  rodam no mesmo minuto, então o relatório da 2ª grava por cima do da 1ª (carimbo do SOBEDESCE vai até o minuto).
- \`unica-*\`: outro projeto com um cartão e uma leva só, conferido nos dois destinos.
`,
)
console.log(`fixture: ${linhas.length} descargas, pasta ${pasta}, arquivos em ${SAIDA}`)
for (const f of fs.readdirSync(SAIDA)) console.log(' -', f)
