// .lrtemplate: a predefinição do Lightroom anterior ao XMP (até o Classic 7.2). É um arquivo Lua:
//
//   s = { id = "…", internalName = "…", title = "…", type = "Develop",
//         value = { settings = { Contrast2012 = 15, ToneCurvePV2012 = { 0, 0, 255, 255 }, … }, uuid = "…" }, version = 0 }
//
// As chaves de `settings` são as mesmas do namespace crs do XMP, sem prefixo; as curvas são vetores planos que
// alternam x e y (docs/estudo/predefinicoes.md, seção 2). Daqui sai o mesmo dicionário de chaves que o leitor de XMP
// produz, e a conversão é uma só (lightroom-ler.js).
//
// NÃO se executa Lua. Este é um analisador do subconjunto literal: tabela, string, número, booleano e nil. Qualquer
// outra coisa (função, chamada, operador, concatenação) é recusada — é o que impede um arquivo de fazer mais do que
// descrever valores.

const TAMANHO_MAX = 4 * 1024 * 1024
const PROFUNDIDADE_MAX = 32

export class ErroLrtemplate extends Error {
  constructor(codigo, mensagem) {
    super(mensagem)
    this.name = 'ErroLrtemplate'
    this.codigo = codigo
  }
}

const erro = (codigo, mensagem) => new ErroLrtemplate(codigo, mensagem)

const eLetra = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95
const eDigito = (c) => c >= 48 && c <= 57

/**
 * Analisa o texto Lua de atribuições literais (`nome = valor`) e devolve { nome: valor }. Tabela com chaves vira
 * objeto; tabela só de posições vira lista. Lança `ErroLrtemplate` (`lua`) com a posição quando encontra o que não
 * é literal.
 */
export function analisarLua(texto) {
  let i = 0
  const n = texto.length
  const falha = (oQue) => erro('lua', `O arquivo não é uma predefinição válida (${oQue}, posição ${i}).`)

  function pular() {
    for (;;) {
      while (i < n && /\s/.test(texto[i])) i++
      if (texto.startsWith('--', i)) {
        if (texto.startsWith('--[[', i)) {
          const fim = texto.indexOf(']]', i + 4)
          if (fim < 0) throw falha('comentário sem fim')
          i = fim + 2
        } else {
          while (i < n && texto[i] !== '\n') i++
        }
        continue
      }
      return
    }
  }

  function nome() {
    const inicio = i
    if (!eLetra(texto.charCodeAt(i))) throw falha('nome esperado')
    while (i < n && (eLetra(texto.charCodeAt(i)) || eDigito(texto.charCodeAt(i)))) i++
    return texto.slice(inicio, i)
  }

  function cadeia() {
    const aspas = texto[i++]
    let saida = ''
    while (i < n) {
      const c = texto[i++]
      if (c === aspas) return saida
      if (c === '\n') break
      if (c !== '\\') {
        saida += c
        continue
      }
      const e = texto[i++]
      if (e === 'n') saida += '\n'
      else if (e === 't') saida += '\t'
      else if (e === 'r') saida += '\r'
      else if (e === '\\' || e === '"' || e === "'") saida += e
      else if (e === '\n') saida += '\n'
      else if (eDigito(e.charCodeAt(0))) {
        // \ddd: até três dígitos decimais (byte)
        let d = e
        while (d.length < 3 && eDigito(texto.charCodeAt(i))) d += texto[i++]
        saida += String.fromCharCode(Number(d) & 255)
      } else throw falha('escape desconhecido na string')
    }
    throw falha('string sem fim')
  }

  function cadeiaLonga() {
    // [[ … ]]: sem escapes; a primeira quebra de linha é descartada
    i += 2
    if (texto[i] === '\r') i++
    if (texto[i] === '\n') i++
    const fim = texto.indexOf(']]', i)
    if (fim < 0) throw falha('string longa sem fim')
    const saida = texto.slice(i, fim)
    i = fim + 2
    return saida
  }

  function numero() {
    const m = /^-?(0[xX][0-9a-fA-F]+|(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)/.exec(texto.slice(i, i + 64))
    if (!m) throw falha('número esperado')
    i += m[0].length
    const v = Number(m[0])
    if (!Number.isFinite(v)) throw falha('número fora da faixa')
    return v
  }

  function tabela(profundidade) {
    if (profundidade > PROFUNDIDADE_MAX) throw falha('tabelas aninhadas demais')
    i++ // {
    const campos = {}
    const lista = []
    let comChave = false
    for (;;) {
      pular()
      if (i >= n) throw falha('tabela sem fim')
      if (texto[i] === '}') {
        i++
        break
      }
      let chave = null
      if (texto[i] === '[' && texto[i + 1] !== '[') {
        // [ "chave" ] = valor   ou   [ 3 ] = valor
        i++
        pular()
        chave = texto[i] === '"' || texto[i] === "'" ? cadeia() : String(numero())
        pular()
        if (texto[i++] !== ']') throw falha('"]" esperado')
        pular()
        if (texto[i++] !== '=') throw falha('"=" esperado')
      } else if (eLetra(texto.charCodeAt(i))) {
        // nome = valor, ou um literal (true, false, nil) como item de lista
        const volta = i
        const palavra = nome()
        pular()
        if (texto[i] === '=' && texto[i + 1] !== '=') {
          chave = palavra
          i++
        } else i = volta
      }
      pular()
      const v = valor(profundidade + 1)
      if (chave == null) lista.push(v)
      else if (chave !== '__proto__') {
        campos[chave] = v
        comChave = true
      }
      pular()
      if (texto[i] === ',' || texto[i] === ';') i++
      else if (texto[i] !== '}') throw falha('"," ou "}" esperado')
    }
    if (!comChave) return lista
    lista.forEach((v, k) => {
      campos[k + 1] = v
    })
    return campos
  }

  function valor(profundidade) {
    pular()
    const c = texto[i]
    if (c === '{') return tabela(profundidade)
    if (c === '"' || c === "'") return cadeia()
    if (c === '[' && texto[i + 1] === '[') return cadeiaLonga()
    if (c === '-' || c === '.' || eDigito(texto.charCodeAt(i))) return numero()
    if (eLetra(texto.charCodeAt(i))) {
      const palavra = nome()
      if (palavra === 'true') return true
      if (palavra === 'false') return false
      if (palavra === 'nil') return null
      throw falha(`"${palavra.slice(0, 20)}" não é um valor literal`)
    }
    throw falha('valor esperado')
  }

  const saida = {}
  for (;;) {
    pular()
    if (i >= n) break
    const chave = nome()
    pular()
    if (texto[i++] !== '=') throw falha('"=" esperado')
    const v = valor(0)
    if (chave !== '__proto__') saida[chave] = v
    pular()
    if (texto[i] === ';') i++
  }
  return saida
}

/**
 * Lê um .lrtemplate (texto ou bytes) e devolve { chaves, meta: { nome, uuid, id, versao } }: `chaves` é o dicionário
 * de ajustes com os nomes do crs, pronto para `converterChaves` (lightroom-ler.js). As curvas saem como listas de
 * pares [x, y]. Lança `ErroLrtemplate`: `vazio`, `grande`, `lua`, `nao-e-predefinicao`, `nao-e-revelacao`.
 */
export function lerLrtemplate(entrada) {
  let texto = entrada
  if (texto instanceof Uint8Array || texto instanceof ArrayBuffer) {
    if (texto.byteLength > TAMANHO_MAX) throw erro('grande', 'Este arquivo é grande demais para uma predefinição.')
    texto = new TextDecoder('utf-8').decode(texto)
  }
  if (typeof texto !== 'string' || !texto.trim()) throw erro('vazio', 'O arquivo .lrtemplate está vazio.')
  if (texto.length > TAMANHO_MAX) throw erro('grande', 'Este arquivo é grande demais para uma predefinição.')
  const lua = analisarLua(texto.replace(/^﻿/, ''))
  const s = lua.s
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw erro('nao-e-predefinicao', 'Este arquivo não é uma predefinição do Lightroom.')
  // predefinição de ajuste local, de exportação ou de metadados usa o mesmo formato com outro `type`
  if (s.type !== 'Develop') throw erro('nao-e-revelacao', 'Este arquivo é de outro tipo de predefinição do Lightroom (não é de revelação).')
  const settings = s.value?.settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw erro('nao-e-predefinicao', 'A predefinição não traz ajustes.')
  const chaves = {}
  for (const [chave, v] of Object.entries(settings)) {
    if (/^ToneCurve(PV2012)?(Red|Green|Blue)?$/.test(chave) && Array.isArray(v)) {
      const pares = []
      for (let k = 0; k + 1 < v.length; k += 2) pares.push([v[k], v[k + 1]])
      chaves[chave] = pares
    } else chaves[chave] = v
  }
  const texto1 = (v) => (typeof v === 'string' ? v : '')
  return { chaves, meta: { nome: texto1(s.title) || texto1(s.internalName), uuid: texto1(s.value?.uuid), id: texto1(s.id), versao: s.version ?? null } }
}

/** True quando o texto tem cara de .lrtemplate (começa por `s = {`, com ou sem comentário antes). */
export function pareceLrtemplate(texto) {
  return typeof texto === 'string' && /^﻿?(\s|--[^\n]*\n)*s\s*=\s*\{/.test(texto.slice(0, 2000))
}
