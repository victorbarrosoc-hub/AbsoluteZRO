// Cores de organização (como as cores de clipe do DaVinci e os rótulos do Premiere): cada mídia nasce com uma, e a
// pessoa etiqueta clipes ("Gancho", "B-roll", "Refazer"). Cor só em forma (clipe, marca, ícone), nunca em texto.
// Os valores ficam em app/editor.css (--cor-<id>), num lugar só; aqui vão o id, o nome e o rótulo equivalente do
// Premiere (o xmeml leva a cor junto).

export const CORES = [
  { id: 'laranja', nome: 'Laranja', premiere: 'Mango' },
  { id: 'amarelo', nome: 'Amarelo', premiere: 'Yellow' },
  { id: 'verde', nome: 'Verde', premiere: 'Forest' },
  { id: 'menta', nome: 'Menta', premiere: 'Caribbean' },
  { id: 'azul', nome: 'Azul', premiere: 'Cerulean' },
  { id: 'roxo', nome: 'Roxo', premiere: 'Violet' },
  { id: 'rosa', nome: 'Rosa', premiere: 'Rose' },
  { id: 'areia', nome: 'Areia', premiere: 'Tan' },
]

export const corPorId = (id) => CORES.find((c) => c.id === id) || null

/** Cor da i-ésima mídia do projeto (a câmera A, B, C… ganham cores diferentes). */
export const corDaMidia = (i) => CORES[(i * 3 + 4) % CORES.length].id

/** Cor de cada tipo de proposta (lista do Revisar e marcas na linha do tempo). */
export const COR_PROPOSTA = { silencio: 'laranja', respiro: 'amarelo', zoom: 'roxo' }

/** Cor de um clipe: a etiqueta dele ou a da mídia. */
export const corDoClipe = (p, c) => c.cor || p.midias.find((m) => m.id === c.midia)?.cor || null

/** Etiquetas usadas na linha: [{ etiqueta, cor, n }] (para o filtro). */
export function etiquetasDa(linha) {
  const m = new Map()
  for (const c of linha.clipes) {
    if (!c.etiqueta) continue
    const k = c.etiqueta
    const e = m.get(k) || { etiqueta: k, cor: c.cor || null, n: 0 }
    e.n++
    m.set(k, e)
  }
  return [...m.values()].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'pt-BR'))
}
