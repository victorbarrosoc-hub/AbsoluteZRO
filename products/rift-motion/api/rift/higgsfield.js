// /api/rift/higgsfield — a conexão da pessoa com a Higgsfield.
//   GET     { conectado, tipo, rotulo, modelos }   (nunca devolve a chave nem o token)
//   POST    { chave: "id:segredo" }                confere a chave na Higgsfield sem gastar nada e guarda cifrada
//   DELETE                                         desconecta (apaga a credencial do banco)
// O login da conta (créditos do plano) é por /api/higgsfield/entrar.
import { rotaSolta, Recusa } from '../_rift.js'
import { apagarConexao, guardarConexao, lerConexao } from '../_conexao.js'
import { chaveLimpa, MODELOS, testarChave } from '../_higgsfield.js'

const modelosDe = (tipo) => (MODELOS[tipo] || []).map(({ id, nome, duracoes }) => ({ id, nome, duracoes }))

export default rotaSolta({
  async GET({ pessoa }) {
    const c = await lerConexao(pessoa)
    return c ? { conectado: true, tipo: c.tipo, rotulo: c.rotulo, modelos: modelosDe(c.tipo) } : { conectado: false }
  },
  async POST({ corpo, pessoa }) {
    const chave = chaveLimpa(corpo.chave)
    if (!chave) throw new Recusa(400, 'Cole a chave no formato id:segredo, como aparece no console da Higgsfield.')
    if (!(await testarChave(chave))) throw new Recusa(400, 'A Higgsfield não aceitou essa chave.')
    const rotulo = `Chave …${chave.slice(-4)}`
    await guardarConexao(pessoa, { tipo: 'chave', segredo: { chave }, rotulo })
    return { conectado: true, tipo: 'chave', rotulo, modelos: modelosDe('chave') }
  },
  async DELETE({ pessoa }) {
    await apagarConexao(pessoa)
    return { conectado: false }
  },
})
