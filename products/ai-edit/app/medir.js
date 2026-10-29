// Demo medida: o mesmo caminho de quem usa o app (importar → analisar → aprovar tudo → exportar para os editores →
// renderizar o vídeo final), cronometrado fase a fase. O app de desktop roda com --medir=<vídeo>; o navegador, por
// scripts/medir.mjs. Nada aqui é estimado: cada número é tempo de relógio desta máquina.

import { MB } from './midia.js'
import { renderizar } from './render.js'
import { pacote } from '../src/exportar/index.js'
import { numeros } from '../src/projeto.js'
import { resumo } from '../src/propostas.js'

export async function medir(entrada, { modelo = 'rapido', dispositivo = 'auto', render = true } = {}) {
  const E = globalThis.__editor
  const r = { modelo, nucleos: navigator.hardwareConcurrency, desktop: Boolean(globalThis.aiEditDesktop?.isDesktop) }
  const t0 = performance.now()
  await E.adicionar([entrada])
  r.importar = (performance.now() - t0) / 1000
  const a = await E.analisar({ modelo, dispositivo })
  if (!a) throw new Error('a análise não terminou')
  r.analise = a
  const p0 = E.h.atual
  const res = resumo(p0.propostas)
  r.propostas = { cortes: res.cortes, zooms: res.zooms, tempoProposto: Math.round(res.tempoPendente * 10) / 10 }
  E.aprovarTodos()
  const p = E.h.atual
  const n = numeros(p)
  r.duracao = { original: Math.round(n.original * 10) / 10, final: Math.round(n.final * 10) / 10, clipes: n.clipes }
  const t1 = performance.now()
  const arquivos = pacote(p, { ...p.legenda, max_palavras: 4, max_caracteres: 24, max_s: 2.4, pausa_quebra_s: 0.35, caixa_alta: false })
  r.exportar = { segundos: (performance.now() - t1) / 1000, arquivos: arquivos.map((x) => `${x.name} (${typeof x.data === 'string' ? x.data.length : x.data.byteLength} B)`) }
  if (render) {
    await document.fonts.load('800 40px Figtree')
    const alvo = new MB.BufferTarget()
    const rr = await renderizar(p, { entradas: E.entradas, destino: alvo, blocos: E.blocos(), legenda: { ligada: true, estilo: p.legenda.estilo, posicaoY: 0.8 } })
    r.render = { segundos: rr.segundos, quadros: rr.quadros, fps: rr.quadros / rr.segundos, duracao: rr.duracao, mb: alvo.buffer.byteLength / 1e6, codecs: rr.codecs }
  }
  r.total = (performance.now() - t0) / 1000
  return r
}
