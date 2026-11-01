// POST /api/rift/z { pedido, cena } — a Z lê a cena do estúdio e devolve o que fazer (ações) e uma frase curta.
// Só para quem está liberado (api/_z.js). A Z não mexe em nada sozinha: as ações voltam para o aparelho, que aplica
// com desfazer. "gerar_motion" nunca gasta crédito aqui: abre a folha Gerar com IA preenchida e a pessoa confirma.
import { randomBytes } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { comoPessoa } from '../_banco.js'
import { rotaSolta, Recusa } from '../_rift.js'
import { zChave, zLiberado, zLimiteDia, Z_MODELO } from '../_z.js'

const MOVIMENTOS = ['entrar', 'quicar', 'girar', 'aparecer', 'crescer', 'sair', 'nenhum']
const PROPS = ['x', 'y', 'z', 'largura', 'altura', 'tamanho', 'escala', 'giro', 'giroX', 'giroY', 'opacidade', 'espaco', 'orbita']

const SISTEMA = `Você é a Z, a assistente da Absolute ZRO, dentro do Rift Motion (um estúdio de motion design 2D e 3D).
Fala português do Brasil, no feminino, calorosa, leve e direta. Responde em uma frase curta.
Você recebe a cena atual em JSON (camadas com id, tipo, nome, valores e movimento) e um pedido.
Para mudar a cena, use as ferramentas. Pode usar várias de uma vez. Use só ids de camadas que existem na cena.
Coordenadas de texto, forma e mídia: x e y em % do quadro (0 a 100), largura e altura em % e tamanho em % da altura.
Objetos 3D: x, y e z em unidades da cena (de -5 a 5), giros em graus. Opacidade de 0 a 1. Escala 1 é o tamanho normal.
Para animar uma imagem com IA (vídeo gerado pela Higgsfield), use gerar_motion: a pessoa confirma antes de gastar créditos.
Se o pedido não couber nas ferramentas, diga o que dá para fazer em vez de inventar.`

const FERRAMENTAS = [
  {
    name: 'aplicar_movimento',
    description: 'Põe um movimento pronto numa camada (entrada ou saída). "nenhum" tira a entrada.',
    input_schema: { type: 'object', additionalProperties: false, required: ['camada', 'movimento'], properties: { camada: { type: 'string' }, movimento: { type: 'string', enum: MOVIMENTOS }, duracao: { type: 'number', description: 'segundos, de 0.3 a 3' } } },
  },
  {
    name: 'ajustar_camada',
    description: 'Muda valores fixos de uma camada (posição, tamanho, giro, opacidade), o texto, a cor, o nome ou se aparece.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['camada'],
      properties: {
        camada: { type: 'string' },
        valores: { type: 'object', description: 'ex.: {"x": 50, "y": 40, "escala": 1.2}', additionalProperties: { type: 'number' } },
        texto: { type: 'string' },
        cor: { type: 'string', description: 'hex #rrggbb' },
        nome: { type: 'string' },
        visivel: { type: 'boolean' },
      },
    },
  },
  {
    name: 'adicionar_camada',
    description: 'Cria uma camada nova de texto, forma ou objeto 3D.',
    input_schema: { type: 'object', additionalProperties: false, required: ['tipo'], properties: { tipo: { type: 'string', enum: ['texto', 'forma', '3d'] }, texto: { type: 'string' }, cor: { type: 'string' }, movimento: { type: 'string', enum: MOVIMENTOS } } },
  },
  {
    name: 'apagar_camada',
    description: 'Apaga uma camada (a pessoa pode desfazer).',
    input_schema: { type: 'object', additionalProperties: false, required: ['camada'], properties: { camada: { type: 'string' } } },
  },
  {
    name: 'gerar_motion',
    description: 'Abre "Gerar com IA" para animar uma camada de imagem com a Higgsfield, já com o pedido escrito.',
    input_schema: { type: 'object', additionalProperties: false, required: ['camada', 'prompt'], properties: { camada: { type: 'string' }, prompt: { type: 'string', description: 'em inglês, descrevendo o movimento' } } },
  },
]

const cor = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined)
const texto = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined)
function acaoLimpa(nome, a) {
  if (!a || typeof a !== 'object') return null
  const camada = texto(a.camada, 24)
  if (nome === 'aplicar_movimento' && camada && MOVIMENTOS.includes(a.movimento)) return { tipo: nome, camada, movimento: a.movimento, duracao: Number.isFinite(a.duracao) ? Math.min(3, Math.max(0.3, a.duracao)) : undefined }
  if (nome === 'ajustar_camada' && camada) {
    const valores = {}
    for (const [k, v] of Object.entries(a.valores || {})) if (PROPS.includes(k) && Number.isFinite(v)) valores[k] = v
    return { tipo: nome, camada, valores, texto: texto(a.texto, 500), cor: cor(a.cor), nome: texto(a.nome, 60), visivel: typeof a.visivel === 'boolean' ? a.visivel : undefined }
  }
  if (nome === 'adicionar_camada' && ['texto', 'forma', '3d'].includes(a.tipo)) return { tipo: nome, camadaTipo: a.tipo, texto: texto(a.texto, 500), cor: cor(a.cor), movimento: MOVIMENTOS.includes(a.movimento) ? a.movimento : undefined }
  if (nome === 'apagar_camada' && camada) return { tipo: nome, camada }
  if (nome === 'gerar_motion' && camada && typeof a.prompt === 'string') return { tipo: nome, camada, prompt: a.prompt.slice(0, 2000) }
  return null
}

export default rotaSolta({
  async POST({ corpo, pessoa }) {
    if (!zLiberado(pessoa.sub)) throw new Recusa(403, 'A Z ainda não está liberada para esta conta.')
    if (!zChave() || !zLimiteDia()) throw new Recusa(503, 'A Z ainda não foi ligada no Rift.')
    const pedido = String(corpo.pedido || '').trim().slice(0, 1000)
    if (!pedido) throw new Recusa(400, 'Diga o que você quer.')
    const cena = JSON.stringify(corpo.cena ?? {})
    if (cena.length > 60_000) throw new Recusa(413, 'A cena é grande demais para a Z agora.')
    const [{ n }] = await comoPessoa(pessoa, (tx) => tx`select count(*)::int as n from rift.z_uso where criado >= (date_trunc('day', now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza')`)
    if (n >= zLimiteDia()) throw new Recusa(429, 'A Z chegou ao limite de hoje. Volta amanhã.')

    const cliente = new Anthropic({ apiKey: zChave(), maxRetries: 1, timeout: 45_000 })
    let r
    try {
      r = await cliente.beta.messages.create({
        model: Z_MODELO,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: SISTEMA,
        tools: FERRAMENTAS,
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: `Cena atual:\n${cena}\n\nPedido: ${pedido}` }],
      })
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new Recusa(429, 'A Z está ocupada. Tente em instantes.')
      if (e instanceof Anthropic.APIError) {
        console.error('z api', e.status, e.message)
        throw new Recusa(502, 'A Z não respondeu agora.')
      }
      throw e
    }
    const id = randomBytes(9).toString('hex').slice(0, 16)
    await comoPessoa(pessoa, (tx) => tx`insert into rift.z_uso (user_sub, id, modelo, tokens_entrada, tokens_saida) values (${pessoa.sub}, ${id}, ${String(r.model || Z_MODELO).slice(0, 80)}, ${r.usage?.input_tokens ?? 0}, ${r.usage?.output_tokens ?? 0})`)
    if (r.stop_reason === 'refusal') return { resposta: 'Esse pedido eu não consigo fazer.', acoes: [] }
    const resposta = r.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim()
      .slice(0, 600)
    const acoes = r.content
      .filter((b) => b.type === 'tool_use')
      .map((b) => acaoLimpa(b.name, b.input))
      .filter(Boolean)
      .slice(0, 30)
    return { resposta: resposta || (acoes.length ? 'Pronto.' : 'Não entendi. Pode dizer de outro jeito?'), acoes }
  },
})
