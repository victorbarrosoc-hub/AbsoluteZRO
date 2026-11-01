// POST /api/rift/z { pedido, cena } — a Z lê a cena do estúdio e devolve o que fazer (ações) e uma frase curta.
// É a Z do HUB (caminho A, pedido do titular em 01/11/2026): o Rift repassa para /api/v1/ia/rift com a credencial do
// cliente rift-web e a chave do Claude fica só no HUB. Só para quem está liberado (api/_z.js; o HUB confere de novo
// com a lista dele). A Z não mexe em nada sozinha: as ações voltam para o aparelho, que aplica com desfazer.
// "gerar_motion" nunca gasta crédito aqui: abre a folha Gerar com IA preenchida e a pessoa confirma.
import { randomBytes } from 'node:crypto'
import { comoPessoa } from '../_banco.js'
import { rotaSolta, Recusa } from '../_rift.js'
import { zLiberado, zLimiteDia, Z_MODELO } from '../_z.js'
import { basicAuth, configurado, emissor } from '../_zro.js'

const ACOES = ['aplicar_movimento', 'ajustar_camada', 'adicionar_camada', 'apagar_camada', 'gerar_motion']

export default rotaSolta({
  async POST({ corpo, pessoa }) {
    if (!zLiberado(pessoa.sub)) throw new Recusa(403, 'A Z ainda não está liberada para esta conta.')
    if (!configurado() || !zLimiteDia()) throw new Recusa(503, 'A Z ainda não foi ligada no Rift.')
    const pedido = String(corpo.pedido || '').trim().slice(0, 1000)
    if (!pedido) throw new Recusa(400, 'Diga o que você quer.')
    const cena = corpo.cena ?? {}
    if (JSON.stringify(cena).length > 60_000) throw new Recusa(413, 'A cena é grande demais para a Z agora.')
    const [{ n }] = await comoPessoa(pessoa, (tx) => tx`select count(*)::int as n from rift.z_uso where criado >= (date_trunc('day', now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza')`)
    if (n >= zLimiteDia()) throw new Recusa(429, 'A Z chegou ao limite de hoje. Volta amanhã.')

    let r
    try {
      r = await fetch(`${emissor()}/api/v1/ia/rift`, {
        method: 'POST',
        headers: { authorization: basicAuth(), 'content-type': 'application/json' },
        body: JSON.stringify({ sub: pessoa.sub, pedido, cena }),
        signal: AbortSignal.timeout(75_000),
      })
    } catch (e) {
      console.error('z hub', e?.name)
      throw new Recusa(502, 'A Z não respondeu agora.')
    }
    const d = await r.json().catch(() => null)
    if (!r.ok) {
      const codigo = typeof d?.error === 'string' ? d.error : ''
      if (r.status === 429) throw new Recusa(429, 'A Z chegou ao limite de hoje. Volta amanhã.')
      if (r.status === 503 || codigo === 'quota_not_configured') throw new Recusa(503, 'A Z ainda não foi ligada no Rift.')
      if (r.status === 403) throw new Recusa(403, 'A Z ainda não está liberada para esta conta.')
      console.error('z hub', r.status, codigo)
      throw new Recusa(502, 'A Z não respondeu agora.')
    }
    const id = randomBytes(9).toString('hex').slice(0, 16)
    await comoPessoa(pessoa, (tx) => tx`insert into rift.z_uso (user_sub, id, modelo) values (${pessoa.sub}, ${id}, ${Z_MODELO})`)
    const acoes = (Array.isArray(d?.acoes) ? d.acoes : []).filter((a) => a && ACOES.includes(a.tipo)).slice(0, 30)
    const resposta = typeof d?.resposta === 'string' && d.resposta.trim() ? d.resposta.trim().slice(0, 600) : acoes.length ? 'Pronto.' : 'Não entendi. Pode dizer de outro jeito?'
    return { resposta, acoes }
  },
})
