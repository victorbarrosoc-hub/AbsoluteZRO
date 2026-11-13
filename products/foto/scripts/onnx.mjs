// Os dois modelos de rosto do evento (docs/estudo/rosto-em-evento.md, D.1) saem dos originais por receitas escritas
// aqui, em Node puro: o ONNX é um protobuf, e o que muda é pouco. Mesmas contas dos scripts da pesquisa
// (dinamico.py e comprimir.py, com numpy + onnx); o resultado é conferido pelo sha256 em modelos.json.
//
//   yunet-dinamico  YuNet 2023mar com a entrada de altura e largura livres ('h', 'w') e o número de saídas livre ('n').
//                   Mesmos pesos. Sem isso o modelo recusa 320 × 320 (a selfie) e 1616 (a foto do evento, em ladrilhos).
//   sface-p8        SFace 2021dec com os pesos grandes guardados em int8 (escala por canal de saída, |w|máx / 127) e
//                   reabertos em float32 dentro do grafo (Cast → Mul). A conta continua em float32: ¼ do arquivo, mesma
//                   velocidade e cos ≥ 0,998 com o original. Os pesos também saem da lista de entradas do grafo.
//
// O protobuf é lido campo a campo e regravado na ordem dos números de campo (como o protobuf do Python grava): o que não
// muda vai byte a byte. Não há dependência: só o formato de fio (varint, 64 bits, tamanho + bytes, 32 bits).

// ───────── formato de fio ─────────

function lerVarint(b, i) {
  let v = 0n
  let d = 0n
  for (;;) {
    const x = b[i++]
    v |= BigInt(x & 0x7f) << d
    if (x < 0x80) return [v, i]
    d += 7n
  }
}

function varint(v) {
  let x = BigInt.asUintN(64, BigInt(v))
  const o = []
  do {
    let byte = Number(x & 0x7fn)
    x >>= 7n
    if (x) byte |= 0x80
    o.push(byte)
  } while (x)
  return Buffer.from(o)
}

/** Mensagem → [{ n, t, v }]: v é BigInt (varint), Buffer (tamanho + bytes, 32 e 64 bits). */
export function ler(b) {
  const campos = []
  let i = 0
  while (i < b.length) {
    let chave
    ;[chave, i] = lerVarint(b, i)
    const n = Number(chave >> 3n)
    const t = Number(chave & 7n)
    let v
    if (t === 0) [v, i] = lerVarint(b, i)
    else if (t === 1) (v = b.subarray(i, i + 8)), (i += 8)
    else if (t === 5) (v = b.subarray(i, i + 4)), (i += 4)
    else if (t === 2) {
      let tam
      ;[tam, i] = lerVarint(b, i)
      v = b.subarray(i, i + Number(tam))
      i += Number(tam)
    } else throw new Error(`protobuf: tipo de fio ${t} não suportado`)
    campos.push({ n, t, v })
  }
  return campos
}

/** [{ n, t, v }] → bytes, na ordem dos números de campo (estável dentro do mesmo número). */
export function gravar(campos) {
  const partes = []
  for (const c of [...campos].sort((a, b) => a.n - b.n)) {
    partes.push(varint((BigInt(c.n) << 3n) | BigInt(c.t)))
    if (c.t === 0) partes.push(varint(c.v))
    else if (c.t === 2) partes.push(varint(c.v.length), c.v)
    else partes.push(c.v)
  }
  return Buffer.concat(partes)
}

const texto = (s) => Buffer.from(s, 'utf8')
const campoTexto = (n, s) => ({ n, t: 2, v: texto(s) })
const campoMsg = (n, campos) => ({ n, t: 2, v: gravar(campos) })
const campoInt = (n, v) => ({ n, t: 0, v: BigInt(v) })
const valor = (campos, n) => campos.find((c) => c.n === n)?.v
const nomeDe = (campos, n) => valor(campos, n)?.toString('utf8')

/** Troca o campo `n` (mensagem) por `fn(campos)`, em todos os que aparecerem. */
const mexer = (campos, n, fn) => campos.map((c) => (c.n === n ? { ...c, v: gravar(fn(ler(c.v))) } : c))

// ───────── ONNX (onnx.proto) ─────────
// ModelProto.graph = 7 · GraphProto: node 1, initializer 5, input 11, output 12, value_info 13
// NodeProto: input 1, output 2, name 3, op_type 4, attribute 5 · AttributeProto: name 1, i 3, type 20 (INT = 2)
// TensorProto: dims 1, data_type 2 (FLOAT 1, INT8 3), float_data 4, name 8, raw_data 9
// ValueInfoProto: name 1, type 2 · TypeProto.tensor_type 1 · Tensor.shape 2 · Shape.dim 1 · Dimension: dim_value 1, dim_param 2
const G = 7
const NO = 1
const INICIAL = 5
const ENTRADA = 11
const SAIDA = 12
const VALOR = 13

const comGrafo = (modelo, fn) => gravar(mexer(ler(modelo), G, fn))

/** Troca a dimensão `indice` de um ValueInfoProto por um nome livre. */
function dimensaoLivre(info, indices, nome) {
  return mexer(info, 2, (tipo) =>
    mexer(tipo, 1, (tensor) =>
      mexer(tensor, 2, (forma) => {
        let k = -1
        return forma.map((c) => {
          if (c.n !== 1) return c
          k += 1
          return indices.includes(k) ? campoMsg(1, [campoTexto(2, typeof nome === 'function' ? nome(k) : nome)]) : c
        })
      }),
    ),
  )
}

/** YuNet de entrada livre: entrada [1, 3, h, w], saídas [1, n, …], sem value_info. */
export function yunetDinamico(modelo) {
  return comGrafo(modelo, (g) => {
    let primeira = true
    return g
      .filter((c) => c.n !== VALOR)
      .map((c) => {
        if (c.n === ENTRADA && primeira) {
          primeira = false
          return { ...c, v: gravar(dimensaoLivre(ler(c.v), [2, 3], (k) => (k === 2 ? 'h' : 'w'))) }
        }
        if (c.n === SAIDA) return { ...c, v: gravar(dimensaoLivre(ler(c.v), [1], 'n')) }
        return c
      })
  })
}

/** float32 de um TensorProto (raw_data ou float_data) e as dimensões. */
function tensorFloat(t) {
  const dims = t.filter((c) => c.n === 1).map((c) => Number(c.v))
  const tipo = Number(valor(t, 2) ?? 0n)
  if (tipo !== 1) return { dims, tipo, dados: null }
  const bruto = valor(t, 9)
  let dados
  if (bruto) dados = new Float32Array(bruto.buffer.slice(bruto.byteOffset, bruto.byteOffset + bruto.length))
  else {
    // float_data: empacotado (um campo) ou solto (um por número)
    const fs = t.filter((c) => c.n === 4)
    const bytes = Buffer.concat(fs.map((c) => (c.t === 2 ? c.v : c.v)))
    dados = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length))
  }
  return { dims, tipo, dados }
}

const tensor = (nome, dims, tipo, bytes) => [...dims.map((d) => campoInt(1, d)), campoInt(2, tipo), campoTexto(8, nome), { n: 9, t: 2, v: Buffer.from(bytes) }]
const no = (tipoOp, entradas, saidas, nome, atributos = []) => [
  ...entradas.map((e) => campoTexto(1, e)),
  ...saidas.map((s) => campoTexto(2, s)),
  campoTexto(3, nome),
  campoTexto(4, tipoOp),
  ...atributos.map((a) => campoMsg(5, a)),
]

/** Arredonda para o par mais próximo (np.rint). */
function rint(x) {
  const r = Math.round(x)
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

/**
 * SFace p8: cada peso float32 com ≥ `minimo` elementos e 2+ dimensões vira int8 por canal de saída (eixo 0) + escala
 * float32, reaberto por Cast(to = FLOAT) → Mul no começo do grafo. As contas seguem as do numpy em float32.
 */
export function sfaceP8(modelo, { minimo = 4096 } = {}) {
  let trocados = 0
  const bytes = comGrafo(modelo, (g) => {
    const iniciais = new Set(g.filter((c) => c.n === INICIAL).map((c) => nomeDe(ler(c.v), 8)))
    const novos = []
    const nos = []
    const resto = []
    for (const c of g) {
      if (c.n === ENTRADA && iniciais.has(nomeDe(ler(c.v), 1))) continue
      if (c.n === NO) {
        resto.push(c)
        continue
      }
      if (c.n !== INICIAL) {
        resto.push(c)
        continue
      }
      const t = ler(c.v)
      const nome = nomeDe(t, 8)
      const { dims, tipo, dados } = tensorFloat(t)
      const total = dims.reduce((a, b) => a * b, 1)
      if (tipo !== 1 || total < minimo || dims.length < 2) {
        novos.push(c)
        continue
      }
      const canais = dims[0]
      const passo = total / canais
      const q = new Int8Array(total)
      const esc = new Float32Array(canais)
      for (let o = 0; o < canais; o++) {
        let m = 0
        for (let i = o * passo; i < (o + 1) * passo; i++) m = Math.max(m, Math.abs(dados[i]))
        let e = Math.fround(m / 127)
        if (e === 0) e = 1
        esc[o] = e
        for (let i = o * passo; i < (o + 1) * passo; i++) q[i] = Math.max(-127, Math.min(127, rint(Math.fround(dados[i] / e))))
      }
      novos.push(campoMsg(INICIAL, tensor(`${nome}_q`, dims, 3, new Uint8Array(q.buffer))))
      novos.push(campoMsg(INICIAL, tensor(`${nome}_e`, [canais, ...dims.slice(1).map(() => 1)], 1, new Uint8Array(esc.buffer))))
      nos.push(campoMsg(NO, no('Cast', [`${nome}_q`], [`${nome}_f`], `${nome}_cast`, [[campoTexto(1, 'to'), campoInt(3, 1), campoInt(20, 2)]])))
      nos.push(campoMsg(NO, no('Mul', [`${nome}_f`, `${nome}_e`], [nome], `${nome}_mul`)))
      trocados += 1
    }
    // ordem: os nós novos antes dos antigos; os pesos na ordem original (cada trocado vira dois)
    return [...nos, ...resto.filter((c) => c.n === NO), ...resto.filter((c) => c.n !== NO), ...novos]
  })
  return { bytes, trocados }
}

/** As receitas que modelos.json conhece. */
export const RECEITAS = {
  'yunet-dinamico': (b) => yunetDinamico(b),
  'sface-p8': (b) => sfaceP8(b).bytes,
}
