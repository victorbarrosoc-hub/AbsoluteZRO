// /api/rift/gerar — "Gerar com IA": anima uma imagem da cena pela Higgsfield da pessoa (chave ou conta).
//   POST { acao: "preparar", conteudo }            → { upload_url, headers, ref }: o aparelho envia o arquivo direto
//   POST { acao: "iniciar", ref, prompt, opcao, duracao } → { id, estado, creditos|usd }: confere o custo na Higgsfield
//        (e, na conta, se o saldo cobre) antes de gerar; o pedido nasce em rift.geracoes com o custo informado
//   POST { acao: "imagens", prompt, quantidade, proporcao, ref? } → { id, estado }: prévias em imagem (a tela antes
//        do vídeo, bem mais barata); na conta, a imagem da camada pode ir como referência
//   GET  ?id=…                                      → { estado, url | urls, erro }: o andamento que a Higgsfield informa
// Gastar créditos só acontece no "iniciar", que só a pessoa dispara (tocando em Gerar). Nunca reenvia sozinho.
import { randomBytes } from 'node:crypto'
import { comoPessoa } from '../_banco.js'
import { rotaSolta, Recusa, id as validarId } from '../_rift.js'
import { credencial } from '../_conexao.js'
import { chaveCusto, chaveCustoImagens, chaveIniciar, chaveIniciarImagens, chavePreparar, chaveStatus, contaCusto, contaCustoImagens, contaIniciar, contaIniciarImagens, contaPreparar, contaSaldo, contaStatus, contaStatusImagens, DURACOES, IMAGEM, mcpAbrir, opcaoDe, PROPORCOES, terminal } from '../_higgsfield.js'

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
      const op = opcaoDe(c.tipo, corpo.opcao)
      if (!op) throw new Recusa(400, 'Escolha uma das três opções.')
      const prompt = String(corpo.prompt || '').trim().slice(0, 2000)
      if (!prompt) throw new Recusa(400, 'Diga como a imagem deve se mexer.')
      const duracao = op.segundos[DURACOES.includes(corpo.duracao) ? corpo.duracao : 'curto']
      let creditos = null
      let usd = null
      if (c.tipo === 'conta') {
        const s = await mcpAbrir(c.access)
        const [saldo, custo] = await Promise.all([contaSaldo(s), contaCusto(s, op, duracao)])
        creditos = custo
        if (custo != null && saldo.creditos != null && custo > saldo.creditos) throw new Recusa(402, `Faltam créditos: custa ${custo} e você tem ${saldo.creditos}.`)
      } else usd = await chaveCusto(c.chave, op, duracao)
      const ref = String(corpo.ref || '')
      if (c.tipo === 'chave' ? !/^https:\/\/\S{8,2000}$/.test(ref) : !UUID.test(ref)) throw new Recusa(400, 'Envie a imagem antes de gerar.')
      const id = novoId()
      const r = c.tipo === 'chave' ? await chaveIniciar(c.chave, { op, prompt, duracao, ref, idem: `rift-${pessoa.sub.slice(0, 40)}-${id}` }) : await contaIniciar(c.access, { op, prompt, duracao, ref })
      await comoPessoa(pessoa, (tx) => tx`insert into rift.geracoes (user_sub, id, servico, tipo, modelo, opcao, prompt, duracao, pedido, estado, creditos, usd) values (${pessoa.sub}, ${id}, 'higgsfield', ${c.tipo}, ${op.modelo}, ${op.id}, ${prompt}, ${duracao}, ${r.pedido}, ${r.estado}, ${creditos}, ${usd})`)
      return { id, estado: r.estado, creditos, usd }
    }
    if (corpo.acao === 'imagens') {
      const c = await exigir(pessoa)
      const prompt = String(corpo.prompt || '').trim().slice(0, 2000)
      if (!prompt) throw new Recusa(400, 'Descreva a imagem que você quer ver.')
      const quantidade = [1, 2, 4].includes(Number(corpo.quantidade)) ? Number(corpo.quantidade) : 4
      const proporcao = PROPORCOES.includes(corpo.proporcao) ? corpo.proporcao : '16:9'
      const ref = corpo.ref == null || corpo.ref === '' ? null : String(corpo.ref)
      if (ref && (c.tipo !== 'conta' || !UUID.test(ref))) throw new Recusa(400, 'Referência de imagem inválida.')
      const id = novoId()
      let creditos = null
      let usd = null
      let r
      if (c.tipo === 'conta') {
        const s = await mcpAbrir(c.access)
        const [saldo, custo] = await Promise.all([contaSaldo(s), contaCustoImagens(s, quantidade, proporcao)])
        creditos = custo
        if (custo != null && saldo.creditos != null && custo > saldo.creditos) throw new Recusa(402, `Faltam créditos: custa ${custo} e você tem ${saldo.creditos}.`)
        r = await contaIniciarImagens(c.access, { prompt, quantidade, proporcao, ref })
      } else {
        usd = await chaveCustoImagens(c.chave, quantidade, proporcao)
        r = await chaveIniciarImagens(c.chave, { prompt, quantidade, proporcao, idem: `rift-${pessoa.sub.slice(0, 40)}-${id}` })
      }
      await comoPessoa(pessoa, (tx) => tx`insert into rift.geracoes (user_sub, id, servico, tipo, saida, modelo, prompt, quantidade, pedido, estado, creditos, usd) values (${pessoa.sub}, ${id}, 'higgsfield', ${c.tipo}, 'imagem', ${IMAGEM[c.tipo].modelo}, ${prompt}, ${quantidade}, ${r.pedido}, ${r.estado}, ${creditos}, ${usd})`)
      return { id, estado: r.estado, creditos, usd }
    }
    throw new Recusa(400, 'Ação desconhecida.')
  },
  async GET({ q, pessoa }) {
    const id = validarId(q.get('id'))
    const [g] = await comoPessoa(pessoa, (tx) => tx`select tipo, saida, pedido, estado, resultado, resultados, erro from rift.geracoes where id = ${id}`)
    if (!g) throw new Recusa(404, 'Geração não encontrada.')
    if (terminal(g.estado)) return g.saida === 'imagem' ? { estado: g.estado, urls: g.resultados || [], erro: g.erro } : { estado: g.estado, url: g.resultado, erro: g.erro }
    const c = await exigir(pessoa)
    if (c.tipo !== g.tipo) throw new Recusa(409, 'A conexão mudou desde esse pedido. Veja o resultado na Higgsfield.')
    if (g.saida === 'imagem') {
      const s = c.tipo === 'chave' ? await chaveStatus(c.chave, g.pedido) : await contaStatusImagens(c.access, g.pedido)
      const urls = (s.urls || []).filter((u) => /^https:\/\//.test(u)).slice(0, 4)
      const estado = s.estado === 'pronto' && !urls.length ? 'gerando' : s.estado
      await comoPessoa(pessoa, (tx) => tx`update rift.geracoes set estado = ${estado}, resultados = ${urls.length ? tx.json(urls) : null}, erro = ${s.erro}, atualizado = now() where id = ${id}`)
      return { estado, urls, erro: s.erro }
    }
    const s = c.tipo === 'chave' ? await chaveStatus(c.chave, g.pedido) : await contaStatus(c.access, g.pedido)
    const url = s.url && /^https:\/\//.test(s.url) ? s.url : null
    const estado = s.estado === 'pronto' && !url ? 'gerando' : s.estado
    await comoPessoa(pessoa, (tx) => tx`update rift.geracoes set estado = ${estado}, resultado = ${url}, erro = ${s.erro}, atualizado = now() where id = ${id}`)
    return { estado, url, erro: s.erro }
  },
})
