// CAMZRO · claquete e nomes de clipe. Contas puras.
//
// Nome do clipe no padrão das câmeras de cinema (ARRI/Blackmagic): câmera + rolo + clipe + data + id do aparelho,
// sem espaço nem acento, para nunca colidir entre aparelhos nem confundir o editor:
//   A001C007_261109_K3F2.mov   (câmera A, rolo 001, clipe 007, 09/11/2026, aparelho K3F2)
// Cena, plano e take vão nos metadados (sidecar, CSV do DaVinci, ALE), não no nome: o nome não muda se a claquete
// for corrigida depois.
//
// Claquete: projeto, cena (12, 12A), plano (letra ou número), take (sobe sozinho a cada gravação), câmera (A–Z), rolo
// (sobe a cada "novo rolo"), bom take (círculo), notas. Novo plano zera o take; nova cena zera o plano e o take.

const dois = (v) => String(v).padStart(2, '0')
const tres = (v) => String(v).padStart(3, '0')

export const CAMERAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** Id curto e estável do aparelho (4 caracteres, sem letras que confundem: 0/O, 1/I/L). */
export function idDoAparelho(aleatorio = Math.random) {
  const alfabeto = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
  let s = ''
  for (let i = 0; i < 4; i++) s += alfabeto[Math.floor(aleatorio() * alfabeto.length)]
  return s
}

/** AAMMDD da data local. */
export const dataCurta = (d) => `${dois(d.getFullYear() % 100)}${dois(d.getMonth() + 1)}${dois(d.getDate())}`

/** O nome do clipe (sem extensão). */
export function nomeDoClipe({ camera = 'A', rolo = 1, clipe = 1, data = new Date(), aparelho = 'ZRO0' }) {
  const cam = CAMERAS.includes(String(camera).toUpperCase()) ? String(camera).toUpperCase() : 'A'
  const id = String(aparelho)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
    .padEnd(4, '0')
  return `${cam}${tres(Math.min(999, Math.max(1, rolo)))}C${tres(Math.min(999, Math.max(1, clipe)))}_${dataCurta(data)}_${id}`
}

/** Lê o nome de volta: { camera, rolo, clipe, data: 'AAMMDD', aparelho } ou null. */
export function lerNome(nome) {
  const r = /^([A-Z])(\d{3})C(\d{3})_(\d{6})_([A-Z0-9]{4})(?:\.[a-z0-9]+)?$/.exec(String(nome || ''))
  if (!r) return null
  return { camera: r[1], rolo: Number(r[2]), clipe: Number(r[3]), data: r[4], aparelho: r[5] }
}

/** Nome do rolo (cartão), como o DaVinci mostra em Reel: A001. */
export const nomeDoRolo = (camera, rolo) => `${String(camera).toUpperCase()}${tres(rolo)}`

/** Limpa o texto da claquete: até 24 caracteres, sem barra, aspas ou quebra de linha (vira coluna de CSV/ALE). */
export function campo(v, max = 24) {
  return String(v ?? '')
    .replace(/[\u0000-\u001f\u007f\t"\\/|<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

export const CLAQUETE_INICIAL = Object.freeze({
  projeto: '',
  cena: '1',
  plano: 'A',
  take: 1,
  camera: 'A',
  rolo: 1,
  clipe: 1,
  diretor: '',
  fotografo: '',
})

/** Próximo plano: A → B → … → Z → AA; números sobem (1 → 2). */
export function proximoPlano(plano) {
  const p = campo(plano, 6).toUpperCase()
  if (/^\d+$/.test(p)) return String(Number(p) + 1)
  if (!/^[A-Z]+$/.test(p)) return 'A'
  const letras = p.split('')
  let i = letras.length - 1
  while (i >= 0) {
    if (letras[i] !== 'Z') {
      letras[i] = String.fromCharCode(letras[i].charCodeAt(0) + 1)
      return letras.join('')
    }
    letras[i] = 'A'
    i--
  }
  return `A${letras.join('')}`
}

/** Próxima cena: 12 → 13, 12A → 12B (cena inserida), vazio → 1. */
export function proximaCena(cena) {
  const c = campo(cena, 8).toUpperCase()
  const r = /^(\d+)([A-Z]?)$/.exec(c)
  if (!r) return '1'
  if (r[2]) return `${r[1]}${r[2] === 'Z' ? 'Z' : String.fromCharCode(r[2].charCodeAt(0) + 1)}`
  return String(Number(r[1]) + 1)
}

/** Depois de gravar um clipe: o take e o número do clipe sobem. */
export const depoisDeGravar = (c) => ({ ...c, take: c.take + 1, clipe: Math.min(999, c.clipe + 1) })
/** Novo plano: take volta para 1. */
export const novoPlano = (c, plano = proximoPlano(c.plano)) => ({ ...c, plano: campo(plano, 6).toUpperCase() || 'A', take: 1 })
/** Nova cena: plano A, take 1. */
export const novaCena = (c, cena = proximaCena(c.cena)) => ({ ...c, cena: campo(cena, 8).toUpperCase() || '1', plano: 'A', take: 1 })
/** Novo rolo (cartão novo, dia novo): o rolo sobe e o clipe volta para 1. */
export const novoRolo = (c) => ({ ...c, rolo: Math.min(999, c.rolo + 1), clipe: 1 })

/** Texto da claquete na tela: "Cena 12 · Plano B · Take 3". */
export const claqueteTexto = (c) => `Cena ${c.cena} · Plano ${c.plano} · Take ${c.take}`

/** Cena-plano-take curto, como o DaVinci e o Avid mostram: 12B-3. */
export const marcaCurta = (c) => `${c.cena}${c.plano}-${c.take}`
