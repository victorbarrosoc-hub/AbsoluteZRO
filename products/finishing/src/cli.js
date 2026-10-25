#!/usr/bin/env node
// Revela · protótipo: referência → LUT criativa.
//
//   node src/cli.js --referencia filme.png --material meu-frame.png --saida look.cube \
//     [--tamanho 33|65] [--intensidade 0.8] [--previa previa.png]
//
// Os dois frames entram em Rec.709 (no Resolve: still exportado depois da conversão do LOG para Rec.709). A LUT sai
// Rec.709 → Rec.709: vai num nó depois dessa conversão.

import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { parseArgs } from 'node:util'
import { aplicar, assar, escreverCube } from './cor/cube.js'
import { criarLook, descrever, descreverSaturacao } from './cor/referencia.js'
import { gravarPng, lerPng } from './imagem/png.js'

const { values: a } = parseArgs({
  options: {
    referencia: { type: 'string' },
    material: { type: 'string' },
    saida: { type: 'string' },
    tamanho: { type: 'string', default: '33' },
    intensidade: { type: 'string', default: '1' },
    previa: { type: 'string' },
  },
})

if (!a.referencia || !a.material || !a.saida) {
  console.error(
    'Uso: node src/cli.js --referencia filme.png --material meu-frame.png --saida look.cube [--tamanho 33|65] [--intensidade 1] [--previa previa.png]',
  )
  process.exit(2)
}

const referencia = lerPng(readFileSync(a.referencia))
const material = lerPng(readFileSync(a.material))
const look = criarLook(referencia, material, { intensidade: Number(a.intensidade) })
const lut = assar(look.aplicar, Number(a.tamanho))
writeFileSync(a.saida, escreverCube(lut, `Ref ${basename(a.referencia)} - Revela`))

const { tom } = look.resumo
console.log(`LUT ${lut.tamanho}³ gravada em ${a.saida}`)
console.log(`Tom: preto ${tom.preto.toFixed(3)} · cinza médio ${tom.cinza.toFixed(3)} · branco ${tom.branco.toFixed(3)} (Oklab L)`)
console.log(descreverSaturacao(look.resumo))
for (const frase of descrever(look.resumo)) console.log(`  ${frase}`)

if (a.previa) {
  const px = new Float32Array(material.pixels.length)
  for (let i = 0; i < px.length; i += 3) {
    const o = aplicar(lut, material.pixels[i], material.pixels[i + 1], material.pixels[i + 2])
    px[i] = o[0]
    px[i + 1] = o[1]
    px[i + 2] = o[2]
  }
  writeFileSync(a.previa, gravarPng({ largura: material.largura, altura: material.altura, pixels: px }))
  console.log(`Prévia do material com a LUT em ${a.previa}`)
}
