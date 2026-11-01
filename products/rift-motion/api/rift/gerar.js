// /api/rift/gerar — "Gerar com IA": anima uma imagem da cena pela Higgsfield da pessoa (chave ou conta).
//   POST { acao: "preparar", conteudo }            → { upload_url, headers, ref }: o aparelho envia o arquivo direto
//   POST { acao: "iniciar", ref, prompt, modelo, duracao } → { id, estado }: o pedido nasce em rift.geracoes
//   GET  ?id=…                                      → { estado, url, erro }: o andamento que a Higgsfield informa
// Gastar créditos só acontece no "iniciar", que só a pessoa dispara (tocando em Gerar). Nunca reenvia sozinho.
import { randomBytes } from 'node:crypto'
import { comoPessoa } from '../_banco.js'
import { rotaSolta, Recusa, id as validarId } from '../_rift.js'
import { credencial } from '../_conexao.js'
import { chaveIniciar, chavePreparar, chaveStatus, contaIniciar, contaPreparar, contaStatus, modeloDe, terminal } from '../_higgsfield.js'

const CONTEUDOS = ['image/jpeg', 'image/png', 'image/webp']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const novoId = () => randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(10, 'x').slice(0, 12)

async function exigir(pessoa) {
  const c = await credencial(pessoa)
  if (!c) throw new Recusa(409, 'Conecte a Higgsfield primeiro.')
  return c
}

export default rotaSolta({
  async POST({ corpo, pessoa }) {
    if (corpo.acao === 'preparar') {
      if (!CONTEUDOS.includes(corpo.conteudo)) throw new Recusa(400, 'Mande uma imagem JPG, PNG ou WebP.')
      const c = await exigir(pessoa)
      return c.tipo === 'chave' ? chavePreparar(c.chave, corpo.conteudo) : contaPreparar(c.access, corpo.conteudo)
    }
    if (corpo.acao === 'iniciar') {
      const c = await exigir(pessoa)
      const m = modeloDe(c.tipo, corpo.modelo)
      if (!m) throw new Recusa(400, 'Escolha um modelo da lista.')
      const prompt = String(corpo.prompt || '').trim().slice(0, 2000)
      if (!prompt) throw new Recusa(400, 'Diga como a imagem deve se mexer.')
      const duracao = m.duracoes.includes(Number(corpo.duracao)) ? Number(corpo.duracao) : m.duracoes[0]
      const ref = String(corpo.ref || '')
      if (c.tipo === 'chave' ? !/^https:\/\/\S{8,2000}$/.test(ref) : !UUID.test(ref)) throw new Recusa(400, 'Envie a imagem antes de gerar.')
      const id = novoId()
      const r = c.tipo === 'chave' ? await chaveIniciar(c.chave, { modelo: m.id, prompt, duracao, ref, idem: `rift-${pessoa.sub.slice(0, 40)}-${id}` }) : await contaIniciar(c.access, { modelo: m.id, prompt, duracao, ref })
      await comoPessoa(pessoa, (tx) => tx`insert into rift.geracoes (user_sub, id, servico, tipo, modelo, prompt, duracao, pedido, estado) values (${pessoa.sub}, ${id}, 'higgsfield', ${c.tipo}, ${m.id}, ${prompt}, ${duracao}, ${r.pedido}, ${r.estado})`)
      return { id, estado: r.estado }
    }
    throw new Recusa(400, 'Ação desconhecida.')
  },
  async GET({ q, pessoa }) {
    const id = validarId(q.get('id'))
    const [g] = await comoPessoa(pessoa, (tx) => tx`select tipo, pedido, estado, resultado, erro from rift.geracoes where id = ${id}`)
    if (!g) throw new Recusa(404, 'Geração não encontrada.')
    if (terminal(g.estado)) return { estado: g.estado, url: g.resultado, erro: g.erro }
    const c = await exigir(pessoa)
    if (c.tipo !== g.tipo) throw new Recusa(409, 'A conexão mudou desde esse pedido. Veja o resultado na Higgsfield.')
    const s = c.tipo === 'chave' ? await chaveStatus(c.chave, g.pedido) : await contaStatus(c.access, g.pedido)
    const url = s.url && /^https:\/\//.test(s.url) ? s.url : null
    const estado = s.estado === 'pronto' && !url ? 'gerando' : s.estado
    await comoPessoa(pessoa, (tx) => tx`update rift.geracoes set estado = ${estado}, resultado = ${url}, erro = ${s.erro}, atualizado = now() where id = ${id}`)
    return { estado, url, erro: s.erro }
  },
})
