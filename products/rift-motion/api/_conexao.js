// A conexão da pessoa com a Higgsfield (rift.conexoes): ler, guardar e manter o login da conta em dia.
// Tudo como a pessoa (comoPessoa, RLS); o segredo só passa pelo cofre (api/_cofre.js).
import { comoPessoa } from './_banco.js'
import { destrancar, trancar } from './_cofre.js'
import { HfSemAcesso, renovarHf } from './_higgsfield.js'

export async function lerConexao(pessoa) {
  const [r] = await comoPessoa(pessoa, (tx) => tx`select tipo, segredo, rotulo from rift.conexoes where servico = 'higgsfield'`)
  if (!r) return null
  const segredo = destrancar('higgsfield', r.segredo)
  return segredo ? { tipo: r.tipo, rotulo: r.rotulo, segredo } : null
}

export async function guardarConexao(pessoa, { tipo, segredo, rotulo }) {
  const cifrado = trancar('higgsfield', segredo)
  await comoPessoa(pessoa, (tx) => tx`
    insert into rift.conexoes (user_sub, servico, tipo, segredo, rotulo) values (${pessoa.sub}, 'higgsfield', ${tipo}, ${cifrado}, ${rotulo ?? null})
    on conflict (user_sub, servico) do update set tipo = excluded.tipo, segredo = excluded.segredo, rotulo = excluded.rotulo, atualizado = now()`)
}

export const apagarConexao = (pessoa) => comoPessoa(pessoa, (tx) => tx`delete from rift.conexoes where servico = 'higgsfield'`)

/** A credencial pronta para usar: a chave, ou o token da conta renovado se estiver perto de vencer. */
export async function credencial(pessoa) {
  const c = await lerConexao(pessoa)
  if (!c) return null
  if (c.tipo === 'chave') return { tipo: 'chave', chave: c.segredo.chave }
  const s = c.segredo
  if (s.expira - 120 > Math.floor(Date.now() / 1000)) return { tipo: 'conta', access: s.access }
  if (!s.refresh) throw new HfSemAcesso()
  try {
    const novo = await renovarHf({ clientId: s.clientId, refresh: s.refresh })
    await guardarConexao(pessoa, { tipo: 'conta', rotulo: c.rotulo, segredo: { ...s, access: novo.access, refresh: novo.refresh || s.refresh, expira: novo.expira } })
    return { tipo: 'conta', access: novo.access }
  } catch (e) {
    if (e instanceof HfSemAcesso) await apagarConexao(pessoa)
    throw e
  }
}
