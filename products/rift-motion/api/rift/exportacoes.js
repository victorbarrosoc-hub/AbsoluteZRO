// /api/rift/exportacoes — as exportações pedidas no estúdio. GET lista; POST registra uma. Nasce "nao_renderizado":
// o Relay ainda não renderiza a partir do Rift, e a tela diz isso (nada de progresso inventado).
import { data, exportacaoDe, id, rota, texto, umDe } from '../_rift.js'

const CADENCIAS_TELA = ['12', '15', '23,976', '24', '29,97', '30', '60', '120']

export default rota({
  async GET(tx) {
    const r = await tx`select id, projeto_id, projeto_nome, formato, cadencia, tamanho, destino, estado, criado from rift.exportacoes order by criado desc limit 100`
    return { itens: r.map(exportacaoDe) }
  },
  async POST(tx, { corpo, pessoa }) {
    const projetoId = typeof corpo.projetoId === 'string' && /^[a-z0-9]{6,24}$/.test(corpo.projetoId) ? corpo.projetoId : null
    const [r] = await tx`
      insert into rift.exportacoes (user_sub, id, projeto_id, projeto_nome, formato, cadencia, tamanho, destino, criado)
      select ${pessoa.sub}, ${id(corpo.id)}, p.id, ${texto(corpo.projeto, 80, 'O projeto')}, ${texto(corpo.formato, 40, 'O formato')},
             ${umDe(corpo.fps, CADENCIAS_TELA, 'Cadência')}, ${texto(corpo.tamanho, 20, 'O tamanho')}, ${texto(corpo.destino, 40, 'O destino')}, ${data(corpo.quando)}
      from (select 1) um left join rift.projetos p on p.id = ${projetoId}
      returning id, projeto_id, projeto_nome, formato, cadencia, tamanho, destino, estado, criado`
    return { item: exportacaoDe(r) }
  },
})
