// XMP: o arquivo ao lado do RAW (.xmp) com as decisões da decupagem, no formato que o Lightroom Classic e o Capture One
// leem, e o pacote que vai embutido no arquivo exportado.
//
// Especificação: XMP (ISO 16684-1; Adobe XMP Specification partes 1, 2 e 3).
//   parte 1, 7     serialização RDF/XML: x:xmpmeta > rdf:RDF > rdf:Description rdf:about=""; propriedade simples pode ir
//                  como atributo ou como elemento
//   parte 1, 7.3.2 invólucro do pacote (<?xpacket begin=… id="W5M0MpCehiHzreSzNTczkc9d"?> … <?xpacket end=…?>)
//   parte 2, 2.1   xmp:Rating, xmp:Label, xmp:CreatorTool      2.2 (Dublin Core) dc:creator (Seq), dc:rights (Alt)
//   parte 2, 3.2   xmpDM (Dynamic Media): xmpDM:pick e xmpDM:good
//
// As decisões (estudo em docs/estudo/decupagem.md, seção 2):
//   estrelas → xmp:Rating, de 0 a 5. NUNCA −1: "rejeitada" como Rating = −1 é convenção do Bridge e há leitor que a
//              mostra como 5 estrelas. Quem lê um −1 de terceiros entende como rejeitada; quem escreve usa a bandeira.
//   cor      → xmp:Label, que é TEXTO: o Lightroom só pinta a etiqueta se o texto for o do idioma do catálogo
//              ("Vermelho" em português, "Red" em inglês; o Capture One usa os nomes em inglês). Por isso `idioma`.
//   marca    → xmpDM:pick = 1 (escolhida), 0 (sem marca), −1 (rejeitada), como o Lightroom Classic grava a partir do
//              13.2, com xmpDM:good = true/false acompanhando.
//
// A regra do produto é não destruir nada da pessoa: `atualizarSidecarXmp` mexe só nas propriedades pedidas e devolve
// o resto do arquivo byte a byte (ajustes do Camera Raw, palavras-chave, histórico, o que for).

const NS = {
  x: 'adobe:ns:meta/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  xmp: 'http://ns.adobe.com/xap/1.0/',
  xmpDM: 'http://ns.adobe.com/xmp/1.0/DynamicMedia/',
  dc: 'http://purl.org/dc/elements/1.1/',
  // namespace próprio: os ajustes do motor em JSON. Leva o id técnico do app, que não muda com o nome do produto.
  zrofoto: 'https://absolutezro.com/ns/foto/1.0/',
  xml: 'http://www.w3.org/XML/1998/namespace',
}

export const NAMESPACE_DOS_AJUSTES = NS.zrofoto

/** Texto da etiqueta de cor por idioma: os nomes padrão do Lightroom Classic em português e em inglês. */
export const ROTULOS = {
  pt: { vermelho: 'Vermelho', amarelo: 'Amarelo', verde: 'Verde', azul: 'Azul', roxo: 'Roxo' },
  en: { vermelho: 'Red', amarelo: 'Yellow', verde: 'Green', azul: 'Blue', roxo: 'Purple' },
}
export const CORES = Object.keys(ROTULOS.pt)

const PICK = { escolhida: '1', rejeitada: '-1' }

/** Texto da etiqueta para uma cor do catálogo, no idioma do programa de destino. */
export function rotuloDe(cor, idioma = 'pt') {
  const tabela = ROTULOS[idioma]
  if (!tabela) throw new Error(`XMP: idioma de etiqueta desconhecido: ${idioma}`)
  return tabela[cor] ?? null
}

/** A cor do catálogo para um texto de etiqueta, em qualquer dos idiomas: { cor, idioma } ou null. */
export function corDoRotulo(texto) {
  const procurado = String(texto ?? '')
    .trim()
    .toLowerCase()
  if (!procurado) return null
  for (const [idioma, tabela] of Object.entries(ROTULOS)) {
    for (const [cor, rotulo] of Object.entries(tabela)) if (rotulo.toLowerCase() === procurado) return { cor, idioma }
  }
  return null
}

const estrelasDe = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(5, Math.round(n))) : 0
}

// ─────────── escrever ───────────

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;', '\n': '&#xA;', '\r': '&#xD;', '\t': '&#x9;' }

// Serve para valor de atributo e para texto de elemento. Os demais caracteres de controle o XML 1.0 não aceita: saem.
function escapar(texto) {
  let saida = ''
  for (const c of String(texto)) saida += ENTIDADES[c] ?? (c.codePointAt(0) < 0x20 ? '' : c)
  return saida
}

function desescapar(texto) {
  return texto.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (tudo, nome) => {
    if (nome === 'amp') return '&'
    if (nome === 'lt') return '<'
    if (nome === 'gt') return '>'
    if (nome === 'quot') return '"'
    if (nome === 'apos') return "'"
    const codigo = nome[1] === 'x' ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10)
    return Number.isFinite(codigo) && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : tudo
  })
}

function documento(dados = {}) {
  const { estrelas, cor, marca, ajustes, idioma = 'pt', autor, direitos, software } = dados
  const usados = new Set()
  const atributos = []
  const elementos = []
  const atributo = (prefixo, nome, valor) => {
    usados.add(prefixo)
    atributos.push(`${prefixo}:${nome}="${escapar(valor)}"`)
  }
  if (estrelas !== undefined && estrelas !== null) atributo('xmp', 'Rating', estrelasDe(estrelas))
  if (cor) {
    const rotulo = rotuloDe(cor, idioma)
    if (!rotulo) throw new Error(`XMP: cor desconhecida: ${cor}`)
    atributo('xmp', 'Label', rotulo)
  }
  if (marca !== undefined) {
    atributo('xmpDM', 'pick', PICK[marca] ?? '0')
    if (PICK[marca]) atributo('xmpDM', 'good', marca === 'escolhida' ? 'true' : 'false')
  }
  if (software) atributo('xmp', 'CreatorTool', software)
  if (autor) {
    usados.add('dc')
    elementos.push(`<dc:creator><rdf:Seq><rdf:li>${escapar(autor)}</rdf:li></rdf:Seq></dc:creator>`)
  }
  if (direitos) {
    usados.add('dc')
    elementos.push(`<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${escapar(direitos)}</rdf:li></rdf:Alt></dc:rights>`)
  }
  if (ajustes && typeof ajustes === 'object') {
    usados.add('zrofoto')
    elementos.push(`<zrofoto:Ajustes>${escapar(JSON.stringify(ajustes))}</zrofoto:Ajustes>`)
  }
  const linhas = ['<x:xmpmeta xmlns:x="adobe:ns:meta/">', ` <rdf:RDF xmlns:rdf="${NS.rdf}">`, '  <rdf:Description rdf:about=""']
  for (const prefixo of ['xmp', 'xmpDM', 'dc', 'zrofoto']) if (usados.has(prefixo)) linhas.push(`    xmlns:${prefixo}="${NS[prefixo]}"`)
  for (const a of atributos) linhas.push(`   ${a}`)
  if (elementos.length) {
    linhas[linhas.length - 1] += '>'
    for (const e of elementos) linhas.push(`   ${e}`)
    linhas.push('  </rdf:Description>')
  } else linhas[linhas.length - 1] += '/>'
  linhas.push(' </rdf:RDF>', '</x:xmpmeta>')
  return linhas.join('\n')
}

/**
 * O texto de um arquivo .xmp novo, para ficar ao lado do RAW.
 *   estrelas   0..5 (xmp:Rating)                marca   'escolhida' | 'rejeitada' | null (xmpDM:pick 1 / −1 / 0)
 *   cor        null | 'vermelho' | 'amarelo' | 'verde' | 'azul' | 'roxo', escrita no `idioma` ('pt' padrão, ou 'en')
 *   ajustes    os ajustes do motor (JSON), no namespace próprio; quem não conhece ignora
 *   autor, direitos, software   opcionais (dc:creator, dc:rights, xmp:CreatorTool)
 * Só entra o que foi passado: campo ausente não vira propriedade.
 */
export function sidecarXmp(dados) {
  return `${documento(dados)}\n`
}

/**
 * O mesmo conteúdo dentro do invólucro de pacote, para embutir num JPEG, TIFF ou PNG. Sem folga de edição (end="r"):
 * o arquivo exportado não é para ser regravado no lugar.
 */
export function pacoteXmp(dados) {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n${documento(dados)}\n<?xpacket end="r"?>`
}

// ─────────── ler ───────────

class ErroXmp extends Error {
  constructor(mensagem) {
    super(`XMP: ${mensagem}`)
    this.name = 'ErroXmp'
  }
}

const eEspaco = (c) => c === ' ' || c === '\n' || c === '\r' || c === '\t'

/**
 * Leitor de XML suficiente para XMP: elementos, atributos com as posições no texto, namespaces por escopo. Pula
 * comentários, instruções (<?xpacket?>), CDATA e DOCTYPE. Lança ErroXmp se as tags não fecham.
 */
function analisar(xml) {
  const raiz = { nome: '#raiz', filhos: [], ns: { xml: NS.xml }, pai: null }
  let atual = raiz
  let i = 0
  const pular = (inicio, fecho) => {
    const fim = xml.indexOf(fecho, inicio)
    if (fim < 0) throw new ErroXmp('trecho sem fim')
    return fim + fecho.length
  }
  while (i < xml.length) {
    const lt = xml.indexOf('<', i)
    if (lt < 0) break
    if (xml.startsWith('<!--', lt)) i = pular(lt + 4, '-->')
    else if (xml.startsWith('<![CDATA[', lt)) i = pular(lt + 9, ']]>')
    else if (xml.startsWith('<?', lt)) i = pular(lt + 2, '?>')
    else if (xml.startsWith('<!', lt)) i = pular(lt + 2, '>')
    else if (xml[lt + 1] === '/') {
      const gt = xml.indexOf('>', lt)
      if (gt < 0) throw new ErroXmp('tag de fechamento sem fim')
      const nome = xml.slice(lt + 2, gt).trim()
      if (atual === raiz || atual.nome !== nome) throw new ErroXmp(`</${nome}> fecha uma tag que não está aberta`)
      atual.fecha = [lt, gt + 1]
      atual = atual.pai
      i = gt + 1
    } else {
      let p = lt + 1
      while (p < xml.length && !eEspaco(xml[p]) && xml[p] !== '>' && xml[p] !== '/') p++
      const el = { nome: xml.slice(lt + 1, p), atributos: [], filhos: [], pai: atual, ns: Object.create(atual.ns), abre: null, fecha: null, sozinha: false }
      if (!el.nome) throw new ErroXmp('tag sem nome')
      for (;;) {
        const antes = p
        while (p < xml.length && eEspaco(xml[p])) p++
        if (p >= xml.length) throw new ErroXmp(`<${el.nome}> sem fim`)
        if (xml[p] === '>') {
          p++
          break
        }
        if (xml[p] === '/' && xml[p + 1] === '>') {
          el.sozinha = true
          p += 2
          break
        }
        const n0 = p
        while (p < xml.length && xml[p] !== '=' && !eEspaco(xml[p]) && xml[p] !== '>') p++
        const nome = xml.slice(n0, p)
        while (p < xml.length && eEspaco(xml[p])) p++
        if (xml[p] !== '=' || !nome) throw new ErroXmp(`atributo estranho em <${el.nome}>`)
        p++
        while (p < xml.length && eEspaco(xml[p])) p++
        const aspa = xml[p]
        if (aspa !== '"' && aspa !== "'") throw new ErroXmp(`atributo ${nome} sem aspas`)
        const fim = xml.indexOf(aspa, p + 1)
        if (fim < 0) throw new ErroXmp(`atributo ${nome} sem fim`)
        el.atributos.push({ nome, valor: desescapar(xml.slice(p + 1, fim)), inicio: antes, fim: fim + 1, valorDe: p + 1, valorAte: fim })
        p = fim + 1
      }
      for (const a of el.atributos) {
        if (a.nome === 'xmlns') el.ns[''] = a.valor
        else if (a.nome.startsWith('xmlns:')) el.ns[a.nome.slice(6)] = a.valor
      }
      el.abre = [lt, p]
      atual.filhos.push(el)
      if (el.sozinha) el.fecha = el.abre
      else atual = el
      i = p
    }
  }
  if (atual !== raiz) throw new ErroXmp(`<${atual.nome}> não foi fechada`)
  return raiz
}

// nome qualificado → [namespace, nome local]; atributo sem prefixo não tem namespace
function qualificar(nome, ns, atributo) {
  const dois = nome.indexOf(':')
  if (dois < 0) return [atributo ? '' : (ns[''] ?? ''), nome]
  return [ns[nome.slice(0, dois)] ?? '', nome.slice(dois + 1)]
}

function achar(no, uri, local, saida = []) {
  for (const f of no.filhos) {
    const [u, l] = qualificar(f.nome, f.ns, false)
    if (u === uri && l === local) saida.push(f)
    else achar(f, uri, local, saida)
  }
  return saida
}

// As descrições de primeiro nível (filhas diretas de rdf:RDF): é nelas que moram as propriedades do arquivo
function descricoes(xml) {
  const raiz = analisar(xml)
  const rdf = achar(raiz, NS.rdf, 'RDF')[0]
  if (!rdf) throw new ErroXmp('não há rdf:RDF')
  const lista = rdf.filhos.filter((f) => {
    const [u, l] = qualificar(f.nome, f.ns, false)
    return u === NS.rdf && l === 'Description'
  })
  return { rdf, lista }
}

// Todas as ocorrências de uma propriedade: como atributo de uma descrição ou como elemento filho dela
function ocorrencias(lista, uri, local, xml) {
  const saida = []
  for (const d of lista) {
    for (const a of d.atributos) {
      const [u, l] = qualificar(a.nome, d.ns, true)
      if (u === uri && l === local) saida.push({ tipo: 'atributo', atributo: a, valor: a.valor })
    }
    for (const f of d.filhos) {
      const [u, l] = qualificar(f.nome, f.ns, false)
      if (u !== uri || l !== local) continue
      const simples = f.filhos.length === 0
      const valor = f.sozinha || !simples ? null : desescapar(xml.slice(f.abre[1], f.fecha[0]))
      saida.push({ tipo: 'elemento', elemento: f, valor })
    }
  }
  return saida
}

const primeiro = (lista, uri, local, xml) => ocorrencias(lista, uri, local, xml).find((o) => o.valor !== null)?.valor

/**
 * Lê as decisões de um .xmp que já existe ao lado do RAW (do Lightroom, do Bridge, do Capture One, nosso).
 * → { estrelas: 0..5 | null, cor: id | null, rotulo: texto | null, marca: 'escolhida' | 'rejeitada' | null,
 *     tem: { estrelas, cor, marca }, ajustes: objeto | null }
 * `tem` diz o que o arquivo de fato traz (estrelas 0 escritas ≠ estrelas ausentes). `rotulo` é o texto como está no
 * arquivo; `cor` só sai quando o texto é uma das nossas cinco, em português ou inglês. Rating = −1 (Bridge) vira
 * marca 'rejeitada' quando não há xmpDM:pick. Texto que não é XMP devolve null; nunca lança.
 */
export function lerSidecarXmp(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return null
  let lista
  try {
    lista = descricoes(texto).lista
  } catch {
    return null
  }
  const saida = { estrelas: null, cor: null, rotulo: null, marca: null, tem: { estrelas: false, cor: false, marca: false }, ajustes: null }
  const nota = primeiro(lista, NS.xmp, 'Rating', texto)
  const numero = nota === undefined ? NaN : Number(String(nota).trim())
  if (Number.isFinite(numero)) {
    saida.tem.estrelas = true
    saida.estrelas = estrelasDe(numero)
  }
  const rotulo = primeiro(lista, NS.xmp, 'Label', texto)
  if (rotulo !== undefined && String(rotulo).trim()) {
    saida.rotulo = String(rotulo).trim()
    saida.cor = corDoRotulo(saida.rotulo)?.cor ?? null
    saida.tem.cor = true
  }
  const pick = primeiro(lista, NS.xmpDM, 'pick', texto)
  const bom = primeiro(lista, NS.xmpDM, 'good', texto)
  const p = pick === undefined ? NaN : Number(String(pick).trim())
  if (Number.isFinite(p)) {
    saida.tem.marca = true
    saida.marca = p > 0 ? 'escolhida' : p < 0 ? 'rejeitada' : null
  } else if (numero < 0) {
    saida.tem.marca = true
    saida.marca = 'rejeitada'
  } else if (
    String(bom ?? '')
      .trim()
      .toLowerCase() === 'true'
  ) {
    saida.tem.marca = true
    saida.marca = 'escolhida'
  }
  const ajustes = primeiro(lista, NS.zrofoto, 'Ajustes', texto)
  if (ajustes !== undefined) {
    try {
      const objeto = JSON.parse(ajustes)
      if (objeto && typeof objeto === 'object') saida.ajustes = objeto
    } catch {
      saida.ajustes = null
    }
  }
  return saida
}

// ─────────── atualizar ───────────

// Prefixo já declarado para o namespace no escopo do elemento, ou null
function prefixoDe(no, uri) {
  for (const prefixo in no.ns) if (prefixo && no.ns[prefixo] === uri) return prefixo
  return null
}

/**
 * Atualiza um .xmp existente sem perder nada: muda só as propriedades que vierem em `mudancas` (estrelas, cor, marca,
 * ajustes) e devolve todo o resto como estava, caractere por caractere. Chave ausente = não mexe; `cor: null` tira a
 * etiqueta; `ajustes: null` tira os nossos ajustes; `marca: null` grava "sem marca".
 *
 * `idioma` da etiqueta: 'pt' | 'en' | 'auto' (padrão). Em 'auto' vale o idioma da etiqueta que o arquivo já tinha;
 * sem etiqueta anterior, português.
 *
 * Sem texto antigo (vazio ou null) devolve um arquivo novo. Texto antigo que não é XMP válido LANÇA: melhor não gravar
 * do que trocar o arquivo da pessoa por outro.
 */
export function atualizarSidecarXmp(textoAntigo, mudancas = {}, { idioma = 'auto' } = {}) {
  if (typeof textoAntigo !== 'string' || !textoAntigo.trim()) {
    return sidecarXmp({ ...mudancas, idioma: idioma === 'auto' ? 'pt' : idioma })
  }
  const xml = textoAntigo
  const { rdf, lista } = descricoes(xml)
  const edicoes = []
  const novosAtributos = []
  const novosElementos = []
  const alvo = lista[0] ?? null
  const escopo = alvo ?? rdf
  // prefixos que esta atualização precisa declarar na descrição alvo: prefixo → namespace
  const declarar = new Map()
  const prefixoPara = (uri, preferido) => {
    const existente = prefixoDe(escopo, uri)
    if (existente) return existente
    for (const [prefixo, u] of declarar) if (u === uri) return prefixo
    let prefixo = preferido
    for (let n = 1; escopo.ns[prefixo] !== undefined || declarar.has(prefixo); n++) prefixo = `${preferido}${n}`
    declarar.set(prefixo, uri)
    return prefixo
  }

  // valor null = tirar a propriedade; texto = gravar (em todas as ocorrências; se não houver, como atributo novo)
  const definir = (uri, local, preferido, valor) => {
    const achadas = ocorrencias(lista, uri, local, xml)
    for (const o of achadas) {
      if (o.tipo === 'atributo') {
        const a = o.atributo
        edicoes.push(valor === null ? { de: a.inicio, ate: a.fim, texto: '' } : { de: a.valorDe, ate: a.valorAte, texto: escapar(valor) })
      } else {
        const e = o.elemento
        if (valor === null) {
          // leva junto o recuo da linha, para não deixar uma linha vazia
          let de = e.abre[0]
          while (de > 0 && (xml[de - 1] === ' ' || xml[de - 1] === '\t')) de--
          if (de > 0 && xml[de - 1] === '\n') de--
          edicoes.push({ de, ate: e.fecha[1], texto: '' })
        } else if (e.sozinha) {
          edicoes.push({ de: e.abre[1] - 2, ate: e.abre[1], texto: `>${escapar(valor)}</${e.nome}>` })
        } else edicoes.push({ de: e.abre[1], ate: e.fecha[0], texto: escapar(valor) })
      }
    }
    if (achadas.length === 0 && valor !== null) novosAtributos.push(`${prefixoPara(uri, preferido)}:${local}="${escapar(valor)}"`)
  }

  const antes = lerSidecarXmp(xml)
  const notaAntiga = Number(String(primeiro(lista, NS.xmp, 'Rating', xml) ?? '').trim())
  if ('estrelas' in mudancas && mudancas.estrelas !== undefined) definir(NS.xmp, 'Rating', 'xmp', String(estrelasDe(mudancas.estrelas)))
  else if ('marca' in mudancas && mudancas.marca !== 'rejeitada' && notaAntiga < 0) {
    // a foto deixou de ser rejeitada e o arquivo dizia isso com Rating = −1: a nota volta a zero
    definir(NS.xmp, 'Rating', 'xmp', '0')
  }
  if ('cor' in mudancas && mudancas.cor !== undefined) {
    if (mudancas.cor === null) definir(NS.xmp, 'Label', 'xmp', null)
    else {
      const lingua = idioma === 'auto' ? (corDoRotulo(antes?.rotulo)?.idioma ?? 'pt') : idioma
      const rotulo = rotuloDe(mudancas.cor, lingua)
      if (!rotulo) throw new ErroXmp(`cor desconhecida: ${mudancas.cor}`)
      definir(NS.xmp, 'Label', 'xmp', rotulo)
    }
  }
  if ('marca' in mudancas && mudancas.marca !== undefined) {
    definir(NS.xmpDM, 'pick', 'xmpDM', PICK[mudancas.marca] ?? '0')
    definir(NS.xmpDM, 'good', 'xmpDM', PICK[mudancas.marca] ? (mudancas.marca === 'escolhida' ? 'true' : 'false') : null)
  }
  if ('ajustes' in mudancas && mudancas.ajustes !== undefined) {
    const json = mudancas.ajustes && typeof mudancas.ajustes === 'object' ? JSON.stringify(mudancas.ajustes) : null
    const achadas = ocorrencias(lista, NS.zrofoto, 'Ajustes', xml)
    if (achadas.length || json === null) definir(NS.zrofoto, 'Ajustes', 'zrofoto', json)
    else {
      const prefixo = prefixoPara(NS.zrofoto, 'zrofoto')
      novosElementos.push(`<${prefixo}:Ajustes>${escapar(json)}</${prefixo}:Ajustes>`)
    }
  }

  // o que é novo entra na primeira descrição (ou numa descrição nova, se o arquivo não tinha nenhuma)
  if (novosAtributos.length || novosElementos.length) {
    const declaracoes = [...declarar].map(([prefixo, uri]) => `xmlns:${prefixo}="${uri}"`)
    if (alvo) {
      const tag = xml.slice(alvo.abre[0], alvo.abre[1])
      const separador = tag.includes('\n') ? `\n${/\n([ \t]*)\S[^\n]*$/.exec(tag)?.[1] ?? '   '}` : ' '
      const atributos = [...declaracoes, ...novosAtributos].map((a) => `${separador}${a}`).join('')
      const recuo = /(^|\n)([ \t]*)$/.exec(xml.slice(0, alvo.abre[0]))?.[2] ?? ''
      const elementos = novosElementos.map((e) => `\n${recuo} ${e}`).join('')
      if (alvo.sozinha) {
        const fecho = novosElementos.length ? `>${elementos}\n${recuo}</${alvo.nome}>` : '/>'
        edicoes.push({ de: alvo.abre[1] - 2, ate: alvo.abre[1], texto: `${atributos}${fecho}` })
      } else {
        if (atributos) edicoes.push({ de: alvo.abre[1] - 1, ate: alvo.abre[1] - 1, texto: atributos })
        if (elementos) {
          // antes do recuo da tag de fechamento, para ela continuar na própria linha
          let ate = alvo.fecha[0]
          while (ate > alvo.abre[1] && (xml[ate - 1] === ' ' || xml[ate - 1] === '\t')) ate--
          if (ate > alvo.abre[1] && xml[ate - 1] === '\n') ate--
          else ate = alvo.fecha[0]
          edicoes.push({ de: ate, ate, texto: elementos })
        }
      }
    } else {
      const p = prefixoDe(rdf, NS.rdf) ?? 'rdf'
      const corpo = novosElementos.length ? `>${novosElementos.join('')}</${p}:Description>` : '/>'
      const nova = `<${p}:Description ${p}:about="" ${[...declaracoes, ...novosAtributos].join(' ')}${corpo}`
      if (rdf.sozinha) edicoes.push({ de: rdf.abre[1] - 2, ate: rdf.abre[1], texto: `>${nova}</${rdf.nome}>` })
      else edicoes.push({ de: rdf.fecha[0], ate: rdf.fecha[0], texto: nova })
    }
  }

  // do fim para o começo, para as posições continuarem valendo
  edicoes.sort((a, b) => b.de - a.de)
  let saida = xml
  for (const e of edicoes) saida = saida.slice(0, e.de) + e.texto + saida.slice(e.ate)
  return saida
}
