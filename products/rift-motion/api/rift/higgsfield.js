// /api/rift/higgsfield — a conexão da pessoa com a Higgsfield.
//   GET                    { conectado, tipo, rotulo }   (nunca devolve a chave nem o token)
//   GET ?painel=curto|longo  + { saldo, usoMes, usoRift, opcoes }: o saldo e o extrato da conta, o que já foi gasto
//                          pelo Rift e as três opções de gasto com o custo que a Higgsfield informa agora (sem gerar)
//   POST { chave: "id:segredo" }  confere a chave na Higgsfield sem gastar nada e guarda cifrada
//   DELETE                 desconecta (apaga a credencial do banco)
// O login da conta (créditos do plano) é por /api/higgsfield/entrar.
import { comoPessoa } from '../_banco.js'
import { rotaSolta, Recusa } from '../_rift.js'
import { apagarConexao, credencial, guardarConexao, lerConexao } from '../_conexao.js'
import { chaveCusto, chaveLimpa, contaCusto, contaSaldo, contaUsoDesde, DURACOES, HfSemAcesso, mcpAbrir, OPCOES, testarChave } from '../_higgsfield.js'

/** Começo do mês no fuso de Fortaleza (UTC−3, sem horário de verão). */
export function inicioDoMes(agora = new Date()) {
  const local = new Date(agora.getTime() - 3 * 3600_000)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 3, 0, 0))
}
const semFalha = (p) => p.catch((e) => {
  if (e instanceof HfSemAcesso) throw e
  return null
})

async function painel(pessoa, duracao) {
  const c = await credencial(pessoa)
  if (!c) return {}
  const desde = inicioDoMes()
  const [rift] = await comoPessoa(pessoa, (tx) => tx`
    select coalesce(sum(creditos) filter (where criado >= ${desde}), 0)::float as creditos_mes, coalesce(sum(usd) filter (where criado >= ${desde}), 0)::float as usd_mes,
           count(*) filter (where criado >= ${desde})::int as n_mes, coalesce(sum(creditos), 0)::float as creditos, coalesce(sum(usd), 0)::float as usd, count(*)::int as n
    from rift.geracoes where tipo = ${c.tipo} and estado not in ('falhou', 'recusado', 'cancelado')`)
  const ops = OPCOES[c.tipo]
  if (c.tipo === 'conta') {
    const s = await mcpAbrir(c.access)
    const [saldo, usoMes, ...custos] = await Promise.all([semFalha(contaSaldo(s)), semFalha(contaUsoDesde(s, desde)), ...ops.map((o) => semFalha(contaCusto(s, o, o.segundos[duracao])))])
    return { saldo, usoMes, usoRift: rift, opcoes: ops.map((o, i) => ({ id: o.id, nome: o.nome, desc: o.desc, segundos: o.segundos[duracao], creditos: custos[i] })) }
  }
  const custos = await Promise.all(ops.map((o) => chaveCusto(c.chave, o, o.segundos[duracao])))
  return { saldo: null, usoMes: null, usoRift: rift, opcoes: ops.map((o, i) => ({ id: o.id, nome: o.nome, desc: o.desc, segundos: o.segundos[duracao], usd: custos[i] })) }
}

export default rotaSolta({
  async GET({ q, pessoa }) {
    const c = await lerConexao(pessoa)
    if (!c) return { conectado: false }
    const base = { conectado: true, tipo: c.tipo, rotulo: c.rotulo }
    const d = q.get('painel')
    return DURACOES.includes(d) ? { ...base, ...(await painel(pessoa, d)) } : base
  },
  async POST({ corpo, pessoa }) {
    const chave = chaveLimpa(corpo.chave)
    if (!chave) throw new Recusa(400, 'Cole a chave no formato id:segredo, como aparece no console da Higgsfield.')
    if (!(await testarChave(chave))) throw new Recusa(400, 'A Higgsfield não aceitou essa chave.')
    const rotulo = `Chave …${chave.slice(-4)}`
    await guardarConexao(pessoa, { tipo: 'chave', segredo: { chave }, rotulo })
    return { conectado: true, tipo: 'chave', rotulo }
  },
  async DELETE({ pessoa }) {
    await apagarConexao(pessoa)
    return { conectado: false }
  },
})
