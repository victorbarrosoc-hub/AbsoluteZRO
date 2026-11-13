// A predefinição: o arquivo `.zropreset` do contrato (docs/ARQUITETURA.md) e o pacote `.zropack` (várias numa coleção).
//
//   { "zro": "foto.predefinicao", "versao": 1, "id", "nome", "familia", "descricao", "autor", "criadaEm",
//     "ajustes": { …só os grupos de estilo… }, "levar": [], "look": { "nome", "lado", "dados" } | null,
//     "origem": { "tipo": "nossa" | "manual" | "lightroom" | "referencia", "relatorio"? } }
//
// Regras:
// - Qualquer entrada vira uma predefinição válida ou um `ErroPredefinicao` com `codigo` e frase curta. Os ajustes passam
//   por `normalizar` (src/motor/ajustes.js): campo estranho some, número fora da faixa volta para a faixa.
// - Só o ESTILO viaja. O que é da foto (`DA_FOTO`: exposição, branco, geometria) fica de fora, salvo o que estiver em
//   `levar` (uma predefinição que esfria de propósito leva 'branco').
// - O JSON é estável: mesma predefinição, mesmo texto (ordem das chaves fixa), para o arquivo poder ser comparado,
//   versionado e ter id por conteúdo.
// - O look (LUT 3D) viaja dentro do arquivo, compacto (16 bits em base64, ver look.js). Nos ajustes fica só a
//   quantidade; o `look.id` que o motor recebe é derivado do conteúdo do look.

import { CONTROLES, DA_FOTO, FAIXAS, aplicarEstilo, mexidos, neutro, normalizar } from '../motor/ajustes.js'

export const TIPO = 'foto.predefinicao'
export const TIPO_PACOTE = 'foto.pacote'
export const VERSAO = 1
export const EXTENSAO = '.zropreset'
export const EXTENSAO_PACOTE = '.zropack'
export const ORIGENS = ['nossa', 'manual', 'lightroom', 'referencia']

const LIMITES = { nome: 80, familia: 40, descricao: 200, autor: 80, lookNome: 80, relatorio: 400000, pacote: 2000 }
const LADO_MIN = 2
const LADO_MAX = 65

export class ErroPredefinicao extends Error {
  constructor(codigo, mensagem) {
    super(mensagem)
    this.name = 'ErroPredefinicao'
    this.codigo = codigo
  }
}

const erro = (codigo, mensagem) => new ErroPredefinicao(codigo, mensagem)

// ─────────── texto e hash ───────────

// Texto de uma linha: sem caracteres de controle, espaços juntos, cortado no limite.
function texto(v, limite, padrao = '') {
  if (typeof v !== 'string') return padrao
  const limpo = v
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return limpo.length ? [...limpo].slice(0, limite).join('') : padrao
}

// cyrb53 (Bryc, domínio público): dois hashes de 32 bits misturados, 53 bits de saída. Não é criptográfico; serve para
// dar o mesmo id ao mesmo conteúdo, de forma síncrona, igual em Node e no navegador.
function cyrb53(str, semente = 0) {
  let h1 = 0xdeadbeef ^ semente
  let h2 = 0x41c6ce57 ^ semente
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

/** Hash curto (16 hex) de um texto: o mesmo texto dá sempre o mesmo. */
export function hashDe(str) {
  return cyrb53(str, 0)
}

// ─────────── ajustes: só o estilo ───────────

const levarValido = (v) => (Array.isArray(v) ? DA_FOTO.filter((g) => v.includes(g)) : [])

/**
 * Os ajustes que viajam numa predefinição: normalizados e sem o que é da foto (salvo `levar`). `intensidade` e
 * `look.id` não viajam (a intensidade é de quem aplica; o id do look sai do conteúdo do look).
 */
export function soEstilo(ajustes, levar = []) {
  const a = normalizar(ajustes)
  const leva = levarValido(levar)
  if (!leva.includes('luz.exposicao')) delete a.luz.exposicao
  if (!leva.includes('branco')) delete a.branco
  if (!leva.includes('geometria')) delete a.geometria
  delete a.intensidade
  a.look = { quantidade: a.look.quantidade }
  return a
}

function lookValido(v) {
  if (v == null) return null
  if (typeof v !== 'object') throw erro('look-invalido', 'O look desta predefinição não é uma LUT válida.')
  const lado = v.lado
  if (!Number.isInteger(lado) || lado < LADO_MIN || lado > LADO_MAX)
    throw erro('look-invalido', `O look precisa ter de ${LADO_MIN} a ${LADO_MAX} pontos por lado.`)
  if (typeof v.dados !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(v.dados)) throw erro('look-invalido', 'Os dados do look não estão em base64.')
  // 16 bits por canal: lado³ · 3 · 2 bytes → 4 caracteres de base64 a cada 3 bytes
  const bytes = lado * lado * lado * 6
  if (v.dados.length !== Math.ceil(bytes / 3) * 4) throw erro('look-invalido', 'O look está incompleto (tamanho diferente do declarado).')
  return { nome: texto(v.nome, LIMITES.lookNome, 'Look'), lado, dados: v.dados }
}

function origemValida(v) {
  const o = v && typeof v === 'object' ? v : {}
  const saida = { tipo: ORIGENS.includes(o.tipo) ? o.tipo : 'manual' }
  if (o.relatorio != null && typeof o.relatorio === 'object') {
    const json = JSON.stringify(o.relatorio)
    if (json.length <= LIMITES.relatorio) saida.relatorio = JSON.parse(json)
  }
  return saida
}

function dataValida(v) {
  if (typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v))) return new Date(Date.parse(v)).toISOString()
  return null
}

// O conteúdo que define a predefinição (o que muda o resultado na foto e o nome): é dele que sai o id.
function conteudo(p) {
  return JSON.stringify([p.nome, p.familia, p.ajustes, p.levar, p.look ? [p.look.lado, p.look.dados] : null])
}

/** Id estável do conteúdo: 'p_' + 16 hex. Mesma predefinição (nome, família, ajustes, levar, look), mesmo id. */
export function idDe(predefinicao) {
  return `p_${hashDe(conteudo(predefinicao))}`
}

/** O id que o motor recebe em `ajustes.look.id` para o look desta predefinição (null quando não há look). */
export function idDoLook(predefinicao) {
  return predefinicao?.look ? `look_${hashDe(`${predefinicao.look.lado}:${predefinicao.look.dados}`)}` : null
}

// ─────────── criar, validar, migrar ───────────

// Migrações por versão de arquivo: cada função leva o objeto da versão N para a N + 1. A versão 0 é o que existia
// antes do contrato: um objeto de ajustes solto, ou { nome, ajustes } sem carimbo.
const MIGRACOES = {
  0: (e) => {
    const temEnvelope = e.ajustes && typeof e.ajustes === 'object'
    return { ...(temEnvelope ? e : { ajustes: e }), zro: TIPO, versao: 1 }
  },
}

function migrar(entrada) {
  let e = entrada
  let versao = e.zro === TIPO && Number.isInteger(e.versao) ? e.versao : e.zro == null ? 0 : NaN
  if (Number.isNaN(versao) || versao < 0) throw erro('nao-e-predefinicao', 'Este arquivo não é uma predefinição.')
  if (versao > VERSAO) throw erro('versao-futura', 'Esta predefinição foi feita numa versão mais nova do app. Atualize para abrir.')
  while (versao < VERSAO) {
    e = MIGRACOES[versao](e)
    versao++
  }
  return e
}

/**
 * Qualquer entrada (objeto já lido de JSON) → predefinição válida, com as chaves na ordem do contrato. Lança
 * `ErroPredefinicao` (`nao-e-predefinicao`, `versao-futura`, `sem-nome`, `look-invalido`) com a frase para a tela.
 * `agora` (ISO) preenche `criadaEm` quando falta: a função é pura quando ele é passado.
 */
export function validar(entrada, { agora = null } = {}) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) throw erro('nao-e-predefinicao', 'Este arquivo não é uma predefinição.')
  const e = migrar(entrada)
  const nome = texto(e.nome, LIMITES.nome)
  if (!nome) throw erro('sem-nome', 'A predefinição precisa de um nome.')
  const levar = levarValido(e.levar)
  const p = {
    zro: TIPO,
    versao: VERSAO,
    id: '',
    nome,
    familia: texto(e.familia, LIMITES.familia, 'Minhas'),
    descricao: texto(e.descricao, LIMITES.descricao),
    autor: texto(e.autor, LIMITES.autor),
    criadaEm: dataValida(e.criadaEm) ?? dataValida(agora) ?? new Date().toISOString(),
    ajustes: soEstilo(e.ajustes, levar),
    levar,
    look: lookValido(e.look),
    origem: origemValida(e.origem),
  }
  p.id = typeof e.id === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(e.id) ? e.id : idDe(p)
  return p
}

/**
 * Cria uma predefinição a partir dos ajustes de uma foto (ou de qualquer objeto de ajustes).
 * `campos`: { nome (obrigatório), familia, descricao, autor, ajustes, levar, look, origem, id, criadaEm }.
 */
export function criarPredefinicao(campos, opcoes = {}) {
  return validar({ ...campos, zro: TIPO, versao: VERSAO }, opcoes)
}

/** Texto do arquivo `.zropreset`: JSON estável (chaves na ordem do contrato, 2 espaços, uma quebra no fim). */
export function serializar(predefinicao) {
  return `${JSON.stringify(validar(predefinicao), null, 2)}\n`
}

function deTexto(entrada, oQue) {
  let t = entrada
  if (t instanceof Uint8Array || t instanceof ArrayBuffer) t = new TextDecoder('utf-8').decode(t)
  if (typeof t !== 'string') return t
  try {
    return JSON.parse(t.replace(/^\uFEFF/, ''))
  } catch {
    throw erro('json-invalido', `O arquivo não é ${oQue} (o conteúdo não é JSON).`)
  }
}

/** Lê um `.zropreset` (texto, bytes ou objeto) e devolve a predefinição válida, já migrada para a versão atual. */
export function ler(entrada, opcoes = {}) {
  return validar(deTexto(entrada, 'uma predefinição'), opcoes)
}

// ─────────── usar no motor ───────────

/** Os ajustes completos (para o motor) desta predefinição: o estilo, o resto neutro, e o id do look quando há um. */
export function ajustesDe(predefinicao) {
  const a = normalizar(predefinicao.ajustes)
  a.look.id = idDoLook(predefinicao)
  return a
}

/**
 * Aplica a predefinição sobre os ajustes de uma foto, na intensidade pedida (0 a 200): o que é da foto fica (salvo
 * `levar`), o estilo entra. A quantidade do look acompanha a intensidade.
 */
export function aplicar(predefinicao, daFoto, intensidade = 100) {
  const estilo = ajustesDe(predefinicao)
  const saida = aplicarEstilo(daFoto ?? neutro(), estilo, intensidade, predefinicao.levar ?? [])
  if (estilo.look.id) {
    saida.look.id = estilo.look.id
    saida.look.quantidade = Math.max(0, Math.min(200, (estilo.look.quantidade * intensidade) / 100))
  } else {
    saida.look = { id: null, quantidade: 100 }
  }
  return saida
}

// ─────────── "o que esta predefinição mexe" ───────────

const numero = (v, casas = 0) => {
  const t = Math.abs(v).toFixed(casas).replace('.', ',')
  return v < 0 ? `−${t}` : t
}
const comSinal = (v, casas = 0) => (v > 0 ? `+${numero(v, casas)}` : numero(v, casas))

const NOME_DA_FAIXA = {
  vermelho: 'vermelho',
  laranja: 'laranja',
  amarelo: 'amarelo',
  verde: 'verde',
  ciano: 'ciano',
  azul: 'azul',
  roxo: 'roxo',
  magenta: 'magenta',
}
const NOME_DA_ZONA = { sombras: 'sombras', meios: 'meios-tons', altas: 'altas luzes', global: 'geral' }
const NOME_DA_CURVA = { luz: 'Curva de pontos', r: 'Curva do vermelho', g: 'Curva do verde', b: 'Curva do azul' }
const NOME_DO_GRUPO = {
  luz: 'Luz',
  cor: 'Cor',
  presenca: 'Presença',
  curva: 'Curva',
  tonalizacao: 'Tonalização',
  detalhe: 'Detalhe',
  efeitos: 'Efeitos',
  calibracao: 'Calibração',
  geometria: 'Geometria',
  tela: 'Tela',
  look: 'Look',
  geral: 'Geral',
}

const ler1 = (o, caminho) => caminho.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o)

// Nome de matiz para a tonalização: o setor de 30° do círculo de cores.
const MATIZES = ['vermelho', 'laranja', 'amarelo', 'verde-limão', 'verde', 'verde-água', 'ciano', 'azul-claro', 'azul', 'roxo', 'magenta', 'rosa']
const nomeDoMatiz = (graus) => MATIZES[Math.round((((graus % 360) + 360) % 360) / 30) % 12]

function listaDe8(valores, antes) {
  const partes = []
  for (let i = 0; i < 8; i++) if (valores[i] !== antes[i]) partes.push(`${NOME_DA_FAIXA[FAIXAS[i]]} ${comSinal(valores[i])}`)
  return partes.join(', ')
}

/**
 * A diferença entre duas predefinições (ou entre o neutro e uma, quando `b` falta): o que a segunda mexe a mais.
 * Devolve [{ caminho, grupo, texto }] com a frase curta de cada controle ("Contraste +18", "Misturador · saturação:
 * laranja −5, amarelo −12"). Aceita predefinições ou objetos de ajustes.
 */
export function diferenca(a, b) {
  const deAjustes = (x) => normalizar(x?.zro === TIPO || (x?.ajustes && typeof x.ajustes === 'object') ? x.ajustes : x)
  const A = b === undefined ? neutro() : deAjustes(a)
  const B = deAjustes(b === undefined ? a : b)
  const lookA = b === undefined ? null : (a?.look ?? null)
  const lookB = (b === undefined ? a : b)?.look ?? null
  const caminhos = new Set([...mexidos(A), ...mexidos(B)])
  const saida = []
  const por = (caminho, grupo, frase) => saida.push({ caminho, grupo, texto: frase })
  for (const caminho of caminhos) {
    const c = CONTROLES[caminho]
    if (c) {
      const va = ler1(A, caminho)
      const vb = ler1(B, caminho)
      if (va === vb) continue
      const casas = c.passo < 0.1 ? 2 : c.passo < 1 ? 1 : 0
      const valor = c.min < 0 && c.neutro === 0 ? comSinal(vb, casas) : numero(vb, casas)
      por(caminho, c.grupo, `${c.rotulo} ${valor}${c.unidade ? ` ${c.unidade}` : ''}`)
      continue
    }
    const [grupo, parte, canal] = caminho.split('.')
    if (grupo === 'misturador') {
      const lista = listaDe8(B.misturador[parte], A.misturador[parte])
      if (lista) por(caminho, 'misturador', `Misturador · ${parte === 'saturacao' ? 'saturação' : parte}: ${lista}`)
    } else if (grupo === 'tonalizacao') {
      const za = A.tonalizacao[parte]
      const zb = B.tonalizacao[parte]
      if (za.saturacao === zb.saturacao && za.luz === zb.luz && (zb.saturacao === 0 || za.matiz === zb.matiz)) continue
      const partes = []
      if (zb.saturacao > 0) partes.push(`${nomeDoMatiz(zb.matiz)} ${numero(zb.saturacao)}`)
      if (zb.luz !== 0) partes.push(`luz ${comSinal(zb.luz)}`)
      por(caminho, 'tonalizacao', `Tonalização · ${NOME_DA_ZONA[parte]}: ${partes.join(', ') || 'sem cor'}`)
    } else if (grupo === 'curva' && parte === 'pontos') {
      if (JSON.stringify(A.curva.pontos[canal]) !== JSON.stringify(B.curva.pontos[canal])) {
        por(caminho, 'curva', `${NOME_DA_CURVA[canal]} (${B.curva.pontos[canal].length} pontos)`)
      }
    } else if (grupo === 'pb') {
      if (A.pb.ativo !== B.pb.ativo || JSON.stringify(A.pb.mistura) !== JSON.stringify(B.pb.mistura)) {
        const lista = B.pb.ativo ? listaDe8(B.pb.mistura, new Array(8).fill(0)) : ''
        por(caminho, 'pb', B.pb.ativo ? `Preto e branco${lista ? `: ${lista}` : ''}` : 'Em cores')
      }
    }
  }
  if (B.branco.modo !== A.branco.modo)
    por('branco.modo', 'cor', `Branco ${B.branco.modo === 'manual' ? 'manual' : B.branco.modo === 'auto' ? 'automático' : 'como fotografado'}`)
  if ((lookA?.dados ?? null) !== (lookB?.dados ?? null)) por('look', 'look', lookB ? `Look "${lookB.nome}" (LUT ${lookB.lado})` : 'Sem look')
  // ordem da tela: pela ordem dos grupos e, dentro deles, a dos controles
  const ordem = Object.keys(NOME_DO_GRUPO)
  const pos = (g) => (ordem.indexOf(g) < 0 ? ordem.length : ordem.indexOf(g))
  return saida
    .map((d, i) => ({ d, i }))
    .sort((x, y) => pos(x.d.grupo) - pos(y.d.grupo) || x.i - y.i)
    .map((x) => x.d)
}

/** As frases curtas do que a predefinição mexe (a partir de `mexidos()` do motor), na ordem dos painéis. */
export function oQueMexe(predefinicao) {
  return diferenca(predefinicao).map((d) => d.texto)
}

/** Os grupos (painéis) em que a predefinição mexe: ['Luz', 'Cor', 'Tonalização'…]. */
export function gruposMexidos(predefinicao) {
  const nomes = { ...NOME_DO_GRUPO, misturador: 'Misturador', pb: 'Preto e branco' }
  return [...new Set(diferenca(predefinicao).map((d) => nomes[d.grupo] ?? d.grupo))]
}

// ─────────── pacote (.zropack) ───────────

/**
 * Junta várias predefinições num pacote para exportar a biblioteca:
 * { zro: 'foto.pacote', versao, nome, criadoEm, predefinicoes: [...] }. Repetidas (mesmo id) entram uma vez só.
 */
export function criarPacote(lista, { nome = 'Minhas predefinições', agora = null } = {}) {
  if (!Array.isArray(lista)) throw erro('pacote-invalido', 'O pacote precisa de uma lista de predefinições.')
  if (lista.length > LIMITES.pacote) throw erro('pacote-grande', `Um pacote leva até ${LIMITES.pacote} predefinições.`)
  const vistos = new Set()
  const predefinicoes = []
  for (const item of lista) {
    const p = validar(item, { agora })
    if (vistos.has(p.id)) continue
    vistos.add(p.id)
    predefinicoes.push(p)
  }
  return {
    zro: TIPO_PACOTE,
    versao: VERSAO,
    nome: texto(nome, LIMITES.nome, 'Minhas predefinições'),
    criadoEm: dataValida(agora) ?? new Date().toISOString(),
    predefinicoes,
  }
}

/** Texto do arquivo `.zropack` (JSON estável). */
export function serializarPacote(pacote) {
  const p = criarPacote(pacote.predefinicoes, { nome: pacote.nome, agora: pacote.criadoEm })
  return `${JSON.stringify(p, null, 2)}\n`
}

/**
 * Lê um `.zropack` (texto, bytes ou objeto). Uma predefinição estragada não derruba o pacote: sai em `erros`
 * ({ indice, nome, codigo, mensagem }) e as outras entram. Um `.zropreset` sozinho também é aceito (pacote de uma).
 */
export function lerPacote(entrada, opcoes = {}) {
  const e = deTexto(entrada, 'um pacote de predefinições')
  if (!e || typeof e !== 'object') throw erro('pacote-invalido', 'Este arquivo não é um pacote de predefinições.')
  if (e.zro === TIPO) return { nome: e.nome ?? '', predefinicoes: [validar(e, opcoes)], erros: [] }
  if (e.zro !== TIPO_PACOTE || !Array.isArray(e.predefinicoes)) throw erro('pacote-invalido', 'Este arquivo não é um pacote de predefinições.')
  if (Number.isInteger(e.versao) && e.versao > VERSAO) throw erro('versao-futura', 'Este pacote foi feito numa versão mais nova do app. Atualize para abrir.')
  if (e.predefinicoes.length > LIMITES.pacote) throw erro('pacote-grande', `Um pacote leva até ${LIMITES.pacote} predefinições.`)
  const predefinicoes = []
  const erros = []
  const vistos = new Set()
  e.predefinicoes.forEach((item, indice) => {
    try {
      const p = validar(item, opcoes)
      if (vistos.has(p.id)) return
      vistos.add(p.id)
      predefinicoes.push(p)
    } catch (falha) {
      erros.push({ indice, nome: texto(item?.nome, LIMITES.nome), codigo: falha.codigo ?? 'erro', mensagem: falha.message })
    }
  })
  return { nome: texto(e.nome, LIMITES.nome), predefinicoes, erros }
}
