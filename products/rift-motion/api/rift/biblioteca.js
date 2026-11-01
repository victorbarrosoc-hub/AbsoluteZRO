// /api/rift/biblioteca — o que a pessoa trouxe para a biblioteca: só nome, tipo e tamanho (o arquivo fica no
// computador dela). GET lista; POST { itens: [...] } (até 50 de uma vez); DELETE ?id= tira da lista.
import { data, id, itemDe, Recusa, rota, texto, TIPOS, umDe } from '../_rift.js'

export default rota({
  async GET(tx) {
    return { itens: (await tx`select id, nome, tipo, ext, tamanho, criado from rift.biblioteca order by criado desc limit 500`).map(itemDe) }
  },
  async POST(tx, { corpo, pessoa }) {
    const itens = Array.isArray(corpo.itens) ? corpo.itens : []
    if (!itens.length || itens.length > 50) throw new Recusa(400, 'Mande de 1 a 50 itens.')
    const linhas = itens.map((it) => {
      const tamanho = Number(it.tamanho)
      if (!Number.isSafeInteger(tamanho) || tamanho < 0) throw new Recusa(400, 'Tamanho inválido.')
      return { user_sub: pessoa.sub, id: id(it.id), nome: texto(it.nome, 255, 'O nome'), tipo: umDe(it.tipo, TIPOS, 'Tipo'), ext: String(it.ext || '').slice(0, 8), tamanho, criado: data(it.quando) }
    })
    const r = await tx`insert into rift.biblioteca ${tx(linhas, 'user_sub', 'id', 'nome', 'tipo', 'ext', 'tamanho', 'criado')} on conflict do nothing returning id, nome, tipo, ext, tamanho, criado`
    return { itens: r.map(itemDe) }
  },
  async DELETE(tx, { q }) {
    await tx`delete from rift.biblioteca where id = ${id(q.get('id'))}`
    return {}
  },
})
