// Que arquivo é foto e quem é par de quem. Puro (sem DOM): a tela lista a pasta e passa só nome, caminho e tamanho.
//
// RAW: os formatos de que src/raw/previa.js tira a JPEG embutida. Imagem pronta: o que o navegador decodifica (HEIC
// só onde o navegador abre; TIFF entra na lista e, sem decodificador, aparece sem miniatura: a tela diz).
// RAW + JPEG do mesmo nome na mesma pasta (o "RAW+JPEG" da câmera) viram UMA foto: a principal é o RAW e a imagem
// vai em `par`.

export const FORMATOS_RAW = ['dng', 'cr2', 'cr3', 'nef', 'nrw', 'arw', 'pef', 'rw2', 'orf', 'raf']
export const FORMATOS_IMAGEM = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tif', 'tiff']
/** O valor do atributo `accept` do campo de arquivos (extensões; o tipo MIME de RAW não é confiável). */
export const ACEITA = [...FORMATOS_RAW, ...FORMATOS_IMAGEM].map((e) => `.${e}`).join(',')

const RAW = new Set(FORMATOS_RAW)
const IMAGEM = new Set(FORMATOS_IMAGEM)
const IGUAIS = { jpeg: 'jpg', tiff: 'tif', heif: 'heic' }

/** O nome sem a pasta. */
export const nomeBase = (caminho) => String(caminho).split(/[\\/]/).pop()

/** { tipo: 'raw' | 'imagem', formato } pela extensão, ou null se não é foto (ou é arquivo oculto, como `._IMG_1.CR2`). */
export function formatoDe(nome) {
  const base = nomeBase(nome)
  if (!base || base.startsWith('.')) return null
  const ponto = base.lastIndexOf('.')
  if (ponto <= 0) return null
  const ext = base.slice(ponto + 1).toLowerCase()
  if (RAW.has(ext)) return { tipo: 'raw', formato: ext }
  if (IMAGEM.has(ext)) return { tipo: 'imagem', formato: IGUAIS[ext] || ext }
  return null
}

const pastaDe = (caminho) => {
  const partes = String(caminho).split(/[\\/]/)
  partes.pop()
  return partes.join('/')
}
const semExtensao = (nome) => {
  const base = nomeBase(nome)
  const ponto = base.lastIndexOf('.')
  return (ponto > 0 ? base.slice(0, ponto) : base).toLowerCase()
}

/**
 * Lista de arquivos ({ nome, caminho?, tamanho, … }) → fotos na ordem em que chegaram:
 * [{ principal, par | null, tipo, formato }]. O que não é foto fica de fora. Um RAW e uma imagem com o mesmo nome
 * na mesma pasta viram uma entrada só (o JPEG é o par); duas imagens do mesmo nome (a.jpg e a.png) continuam duas.
 */
export function juntarPares(arquivos) {
  const saida = []
  const porChave = new Map()
  for (const a of arquivos) {
    const f = formatoDe(a.nome)
    if (!f) continue
    const chave = `${pastaDe(a.caminho ?? a.nome)}/${semExtensao(a.nome)}`
    const ja = porChave.get(chave)
    if (!ja) {
      const entrada = { principal: a, par: null, ...f }
      porChave.set(chave, entrada)
      saida.push(entrada)
    } else if (ja.tipo === 'imagem' && f.tipo === 'raw' && !ja.par) {
      // a imagem chegou antes: o RAW assume e ela vira o par
      ja.par = ja.principal
      ja.principal = a
      ja.tipo = f.tipo
      ja.formato = f.formato
    } else if (ja.tipo === 'raw' && f.tipo === 'imagem' && !ja.par) {
      ja.par = a
    } else {
      // outro arquivo com o mesmo nome (dois RAW, ou a segunda imagem): foto à parte
      saida.push({ principal: a, par: null, ...f })
    }
  }
  return saida
}
