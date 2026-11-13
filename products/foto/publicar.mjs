// Monta publico/ (o buildCommand da Vercel). App FECHADO (raiz CLAUDE.md): o site estático leva só o que não tem marca:
//   fontes/    Figtree
//   vendor/    bibliotecas de terceiros (vendor/ do git + o MediaPipe, copiado de node_modules)
//   modelos/   os modelos de visão (.modelos/, baixados e conferidos por scripts/modelos.mjs)
//   modelos.json   a lista que a tela lê: o que veio (com sha256) e o que faltou. Fica na raiz, fora do cache imutável
//   robots.txt e 404.html (a página neutra)
// Nada de app/, src/, nome ou ícone: isso sai só pelas funções (api/pagina.js, api/recurso.js), depois do gate.
// Modelo que faltar e não der para baixar NÃO derruba o build: fica fora, com aviso, e a tela mostra a camada como
// indisponível. FOTO_SEM_BAIXAR=1 pula a tentativa de baixar.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { baixar, modelos, PASTA_ROSTO, prepararRosto, situacao, situacaoRosto } from './scripts/modelos.mjs'
import { copiarOrt } from './scripts/vendor.mjs'

const RAIZ = fileURLToPath(new URL('.', import.meta.url))
const MEDIAPIPE = '@mediapipe/tasks-vision'
/** O que vai do MediaPipe: o pacote para worker de módulo e o clássico, e os dois WebAssembly. */
export const DO_MEDIAPIPE = ['vision_bundle.mjs', 'vision_bundle.js', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm', 'wasm/vision_wasm_module_internal.js', 'wasm/vision_wasm_module_internal.wasm']

/**
 * Monta `saida` (apagada antes). Devolve { mediapipe, modelos: { prontos, faltando } } para quem chama conferir.
 * `baixarModelos: false` usa só o que já está em `modelosEm` (.modelos/). `buscar` é o fetch (os testes trocam).
 */
export async function publicar({ saida = join(RAIZ, 'publico'), modelosEm = join(RAIZ, '.modelos'), rostoEm = PASTA_ROSTO, baixarModelos = process.env.FOTO_SEM_BAIXAR !== '1', buscar = fetch, log = () => {} } = {}) {
  if (!existsSync(join(RAIZ, 'vendor/libraw/libraw.wasm'))) throw new Error('vendor/ vazio: rode npm run vendor antes')
  rmSync(saida, { recursive: true, force: true })
  mkdirSync(saida, { recursive: true })
  cpSync(join(RAIZ, 'fontes'), join(saida, 'fontes'), { recursive: true })
  cpSync(join(RAIZ, 'vendor'), join(saida, 'vendor'), { recursive: true })

  // MediaPipe: grande demais para o git; vem de node_modules (por isso está em dependencies)
  const pacote = join(RAIZ, 'node_modules', MEDIAPIPE)
  let mediapipe = null
  if (DO_MEDIAPIPE.every((f) => existsSync(join(pacote, f)))) {
    const destino = join(saida, 'vendor/mediapipe')
    mkdirSync(join(destino, 'wasm'), { recursive: true })
    for (const f of DO_MEDIAPIPE) cpSync(join(pacote, f), join(destino, f))
    // Apache-2.0: o pacote do npm não traz o texto; é o mesmo do htm (vendor/htm/LICENSE)
    cpSync(join(RAIZ, 'vendor/htm/LICENSE'), join(destino, 'LICENSE-Apache-2.0.txt'))
    mediapipe = JSON.parse(readFileSync(join(pacote, 'package.json'), 'utf8')).version
    writeFileSync(join(destino, 'README.md'), `# MediaPipe Tasks Vision\n\n${MEDIAPIPE} ${mediapipe}, Apache-2.0 (\`LICENSE-Apache-2.0.txt\`). Cópia de \`node_modules\` feita no build, sem alteração.\n`)
  } else {
    log(`aviso: ${MEDIAPIPE} não está em node_modules; as camadas de visão ficam indisponíveis`)
  }

  // ONNX Runtime Web (busca por rosto em evento): também grande demais para o git; três arquivos de node_modules
  const ort = copiarOrt(join(saida, 'vendor'), { log })

  // Modelos: baixa o que falta (se puder) e leva só o que confere com modelos.json
  if (baixarModelos) {
    try {
      await baixar({ pasta: modelosEm, buscar, log })
    } catch (e) {
      log(`aviso: não deu para baixar modelos (${String(e?.message ?? e).slice(0, 120)})`)
    }
  }
  const destino = join(saida, 'modelos')
  mkdirSync(destino, { recursive: true })
  const lista = existsSync(modelosEm) ? situacao(modelosEm) : modelos().map((m) => ({ ...m, pronto: false }))
  for (const m of lista) {
    if (m.pronto) cpSync(join(modelosEm, m.arquivo), join(destino, m.arquivo))
    else log(`aviso: modelo ${m.arquivo} ficou de fora; a camada "${m.camada}" aparece como indisponível`)
  }
  // os de rosto: originais baixados e derivados gerados (scripts/onnx.mjs); só o derivado conferido vai para o site
  if (baixarModelos) {
    try {
      await prepararRosto({ pasta: rostoEm, buscar, log })
    } catch (e) {
      log(`aviso: não deu para preparar os modelos de rosto (${String(e?.message ?? e).slice(0, 120)})`)
    }
  }
  const rosto = situacaoRosto(rostoEm)
  for (const m of rosto) {
    if (m.pronto) cpSync(join(rostoEm, m.arquivo), join(destino, m.arquivo))
    else log(`aviso: modelo ${m.arquivo} ficou de fora; a busca por rosto aparece como indisponível`)
  }
  // a lista que a tela lê (/modelos.json): o que veio (com sha256 para conferir) e o que faltou
  const ficha = ({ arquivo, camada, uso, tamanho, sha256, licenca, pronto }) => ({ arquivo, camada, uso, tamanho, sha256, licenca, pronto })
  writeFileSync(join(saida, 'modelos.json'), `${JSON.stringify({ mediapipe, onnxruntime: ort, modelos: lista.map(ficha), rosto: rosto.map(ficha) }, null, 2)}\n`)

  writeFileSync(join(saida, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
  // o 404 do site (a Vercel serve publico/404.html para o que não existe): a página neutra
  cpSync(join(RAIZ, 'app/indisponivel.html'), join(saida, '404.html'))
  return { mediapipe, onnxruntime: ort, rosto: rosto.filter((m) => m.pronto).map((m) => m.arquivo), modelos: { prontos: lista.filter((m) => m.pronto).map((m) => m.arquivo), faltando: lista.filter((m) => !m.pronto).map((m) => m.arquivo) } }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const r = await publicar({ log: console.log })
  console.log(`publico/ pronto: fontes, vendor${r.mediapipe ? ` (com MediaPipe ${r.mediapipe})` : ''}, ${r.modelos.prontos.length} de ${r.modelos.prontos.length + r.modelos.faltando.length} modelos`)
}
