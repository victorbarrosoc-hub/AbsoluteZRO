// npm run icons: gera os ícones do app a partir da arte oficial (tema claro, o padrão da marca). Sem dependências.
//
//   npm run icons -- <pasta>   copia a arte oficial de <pasta> para build/ e gera tudo. A pasta é a saída do gerador
//                              da marca (scripts/marca/icones.py › out/claro), com:
//                                mac-icon-1024.png   1024×1024, JÁ com o squircle, a margem do grid da Apple e a sombra
//                                                    (não aplicamos outra máscara)
//                                win-icon-1024.png   1024×1024, a placa do Windows
//                                icon.ico            .ico feito pelo gerador (traço reforçado nos tamanhos pequenos)
//   npm run icons              gera de novo a partir do que já está em build/:
//                                build/icon-source-mac.png, build/icon-source-windows.png e build/icon-source.ico
//
// Saídas: build/icon.png (Mac, 1024), build/icon.icns, build/icon.ico, build/icon-windows.png (256, janela no
// Windows) e build/icon-linux.png (512). O fundo do .dmg sai de scripts/fundo-dmg.mjs (roda junto).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gravarPng, lerPng, redimensionar } from './png.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = path.join(RAIZ, 'build')

function abrir1024(arquivo) {
  const img = lerPng(fs.readFileSync(arquivo))
  if (img.width !== 1024 || img.height !== 1024) throw new Error(`${path.relative(RAIZ, arquivo)} precisa ter 1024×1024 (tem ${img.width}×${img.height})`)
  return img
}

/** .icns com PNG dentro (macOS 10.7+). */
export function montarIcns(img) {
  const tipos = [
    ['ic11', 32],
    ['ic12', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic13', 256],
    ['ic09', 512],
    ['ic14', 512],
    ['ic10', 1024],
  ]
  const cache = new Map()
  const partes = tipos.map(([tipo, lado]) => {
    if (!cache.has(lado)) cache.set(lado, gravarPng(lado === img.width ? img : redimensionar(img, lado, lado)))
    const png = cache.get(lado)
    const cab = Buffer.alloc(8)
    cab.write(tipo, 0, 'latin1')
    cab.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([cab, png])
  })
  const corpo = Buffer.concat(partes)
  const cab = Buffer.alloc(8)
  cab.write('icns', 0, 'latin1')
  cab.writeUInt32BE(corpo.length + 8, 4)
  return Buffer.concat([cab, corpo])
}

/** .ico com PNG dentro (Windows Vista+), nos tamanhos que o Explorer e a barra de tarefas usam. */
export function montarIco(img, lados = [16, 24, 32, 48, 64, 128, 256]) {
  const pngs = lados.map((l) => gravarPng(redimensionar(img, l, l)))
  const cab = Buffer.alloc(6)
  cab.writeUInt16LE(0, 0)
  cab.writeUInt16LE(1, 2)
  cab.writeUInt16LE(lados.length, 4)
  let offset = 6 + 16 * lados.length
  const dir = lados.map((l, i) => {
    const e = Buffer.alloc(16)
    e[0] = l >= 256 ? 0 : l
    e[1] = l >= 256 ? 0 : l
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(pngs[i].length, 8)
    e.writeUInt32LE(offset, 12)
    offset += pngs[i].length
    return e
  })
  return Buffer.concat([cab, ...dir, ...pngs])
}

/** Arquivos da pasta da marca → build/icon-source-* */
const DA_MARCA = [
  ['mac-icon-1024.png', 'icon-source-mac.png'],
  ['win-icon-1024.png', 'icon-source-windows.png'],
  ['icon.ico', 'icon-source.ico'],
]

function main(pasta) {
  if (pasta) {
    for (const [de, para] of DA_MARCA) {
      const origem = path.resolve(pasta, de)
      if (!fs.existsSync(origem)) throw new Error(`falta ${origem}`)
      fs.copyFileSync(origem, path.join(BUILD, para))
      console.log(`${de} → build/${para}`)
    }
  }
  const fonteMac = path.join(BUILD, 'icon-source-mac.png')
  const fonteWin = path.join(BUILD, 'icon-source-windows.png')
  const fonteLinux = fonteWin
  if (!fs.existsSync(fonteMac) || !fs.existsSync(fonteWin)) throw new Error('faltam build/icon-source-mac.png e build/icon-source-windows.png')
  const mac = abrir1024(fonteMac)
  const win = abrir1024(fonteWin)
  const linux = abrir1024(fonteLinux)

  const grava = (nome, buf) => {
    fs.writeFileSync(path.join(BUILD, nome), buf)
    console.log(`build/${nome} (${Math.round(buf.length / 1024)} KB)`)
  }
  grava('icon.png', gravarPng(mac))
  grava('icon.icns', montarIcns(mac))
  const icoManual = path.join(BUILD, 'icon-source.ico')
  grava('icon.ico', fs.existsSync(icoManual) ? fs.readFileSync(icoManual) : montarIco(win))
  grava('icon-windows.png', gravarPng(redimensionar(win, 256, 256)))
  grava('icon-linux.png', gravarPng(redimensionar(linux, 512, 512)))
  console.log(`origem: ${path.relative(RAIZ, fonteMac)} · ${path.relative(RAIZ, fonteWin)}${fs.existsSync(icoManual) ? ' · build/icon-source.ico' : ''}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv[2])
    // e o fundo do .dmg
    await import('./fundo-dmg.mjs')
  } catch (e) {
    console.error(e.message || e)
    process.exit(1)
  }
}
