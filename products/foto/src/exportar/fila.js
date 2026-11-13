// O lote de exportação: a receita de saída (o que gravar e como), as predefinições de saída, a fila (estados, pausa,
// cancelar, repetir só o que falhou, progresso e estimativa) e a execução de uma receita sobre uma imagem.
//
// Aqui não há worker, tela nem disco: é a lógica. Quem roda os trabalhos (o worker do app) recebe os itens por
// `proximos()` ou entrega uma função para `executar()`.
//
// Regras:
//   - Uma foto com os mesmos ajustes e a mesma receita não é refeita: cada item tem uma chave (`chaveDeSaida`), e
//     chave repetida no lote ou já feita antes (`feitas`) é pulada, com o motivo.
//   - A estimativa de tempo é honesta: só aparece depois de `minimoParaEstimar` fotos medidas de verdade. Antes disso
//     é null, e a tela mostra só a contagem.
//   - Falha tem motivo, em texto; nada some em silêncio.
//
// Este arquivo é leve de propósito (a tela importa a receita e as predefinições sem carregar os codificadores):
// `gerarSaida` busca os outros módulos na hora de usar.

import { EXTENSOES } from './nome.js'

// ─────────── receita de saída ───────────

export const FORMATOS = ['jpeg', 'tiff', 'png', 'webp']
export const ESPACOS_DE_SAIDA = ['srgb', 'p3', 'adobe', 'rec2020', 'prophoto']
export const METADADOS = ['todos', 'sem-local', 'so-direitos', 'nenhum']
export const TIPOS_DE_TAMANHO = ['original', 'lado', 'megapixels', 'caixa']
export const TIPOS_MIME = { jpeg: 'image/jpeg', tiff: 'image/tiff', png: 'image/png', webp: 'image/webp' }

const DESTINOS = ['tela', 'fosco', 'brilhante']
const INTENSIDADES = ['baixa', 'padrao', 'alta']
const POSICOES = ['inferior-direito', 'inferior-esquerdo', 'superior-direito', 'superior-esquerdo', 'centro', 'diagonal']
const LADO_MAXIMO = 65535 // o maior lado que um JPEG guarda (T.81, B.2.2: 16 bits)
const QUALIDADE_PADRAO = 90

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const limitar = (v, min, max) => (v < min ? min : v > max ? max : v)
const texto = (v, limite) => (typeof v === 'string' ? v.trim().slice(0, limite) : '')

function normalizarTamanho(v) {
  const original = { tipo: 'original', ampliar: false }
  // atalhos: um número é o lado maior em pixels
  if (num(v) !== null) v = { tipo: 'lado', px: v }
  if (!v || typeof v !== 'object') return original
  const ampliar = v.ampliar === true
  if (v.tipo === 'lado' && num(v.px) > 0) return { tipo: 'lado', px: limitar(Math.round(v.px), 16, LADO_MAXIMO), ampliar }
  if (v.tipo === 'megapixels' && num(v.mp) > 0) return { tipo: 'megapixels', mp: limitar(Math.round(v.mp * 100) / 100, 0.01, 1000), ampliar }
  if (v.tipo === 'caixa' && num(v.largura) > 0 && num(v.altura) > 0) {
    return { tipo: 'caixa', largura: limitar(Math.round(v.largura), 16, LADO_MAXIMO), altura: limitar(Math.round(v.altura), 16, LADO_MAXIMO), ampliar }
  }
  return original
}

function normalizarNitidez(v) {
  if (typeof v === 'string') v = { destino: v }
  if (!v || typeof v !== 'object' || !DESTINOS.includes(v.destino)) return null
  return { destino: v.destino, intensidade: INTENSIDADES.includes(v.intensidade) ? v.intensidade : 'padrao' }
}

function normalizarMarca(v) {
  if (typeof v === 'string') v = { texto: v }
  if (!v || typeof v !== 'object') return null
  const escrito = texto(v.texto, 200)
  if (!escrito) return null
  return {
    texto: escrito,
    posicao: v.posicao === 'canto' ? 'inferior-direito' : POSICOES.includes(v.posicao) ? v.posicao : 'inferior-direito',
    opacidade: limitar(num(v.opacidade) ?? 0.5, 0.05, 1),
    tamanho: limitar(num(v.tamanho) ?? 0.25, 0.01, 1),
    margem: limitar(num(v.margem) ?? 0.03, 0, 0.45),
  }
}

/**
 * Qualquer entrada vira uma receita de saída completa e possível de cumprir. Nunca lança.
 *
 *   formato     'jpeg' | 'tiff' | 'png' | 'webp'
 *   qualidade   1..100 em JPEG e WebP; null nos formatos sem perda
 *   bits        8 | 16 (16 só em TIFF e PNG)
 *   espaco      'srgb' | 'p3' | 'adobe' | 'rec2020' | 'prophoto'. WebP sai sempre em sRGB: este corte não embute
 *               perfil em WebP, e arquivo de gamut largo sem perfil apareceria com a cor errada
 *   tamanho     { tipo: 'original' | 'lado' (px) | 'megapixels' (mp) | 'caixa' (largura, altura), ampliar }
 *   nitidez     null | { destino: 'tela' | 'fosco' | 'brilhante', intensidade: 'baixa' | 'padrao' | 'alta' }
 *   metadados   'todos' | 'sem-local' | 'so-direitos' | 'nenhum'
 *   marcaDagua  null | { texto, posicao, opacidade, tamanho, margem }
 *   nome        modelo de nome de arquivo (ver nome.js)        pasta   subpasta de destino ('' = a pasta escolhida)
 *   compressao  só em TIFF: 'nenhuma' | 'deflate'; null nos outros formatos
 */
export function normalizarReceita(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {}
  const formato = FORMATOS.includes(e.formato) ? e.formato : 'jpeg'
  const comPerda = formato === 'jpeg' || formato === 'webp'
  const espaco = formato === 'webp' ? 'srgb' : ESPACOS_DE_SAIDA.includes(e.espaco) ? e.espaco : 'srgb'
  return {
    formato,
    qualidade: comPerda ? limitar(Math.round(num(e.qualidade) ?? QUALIDADE_PADRAO), 1, 100) : null,
    bits: !comPerda && e.bits === 16 ? 16 : 8,
    espaco,
    tamanho: normalizarTamanho(e.tamanho),
    nitidez: normalizarNitidez(e.nitidez),
    metadados: METADADOS.includes(e.metadados) ? e.metadados : 'sem-local',
    marcaDagua: normalizarMarca(e.marcaDagua),
    nome: texto(e.nome, 200) || '{nome}',
    pasta: texto(e.pasta, 200),
    compressao: formato === 'tiff' ? (e.compressao === 'deflate' ? 'deflate' : 'nenhuma') : null,
  }
}

/** Extensão do arquivo que a receita gera ('jpg', 'tif', 'png', 'webp'). */
export const extensaoDaReceita = (receita) => EXTENSOES[normalizarReceita(receita).formato]

/**
 * Predefinições de saída que já vêm prontas. Cada `receita` passa por `normalizarReceita`, então é sempre válida.
 */
export const PREDEFINICOES_DE_SAIDA = [
  {
    id: 'entrega',
    nome: 'Entrega',
    descricao: 'JPEG em Display P3, tamanho cheio',
    receita: { formato: 'jpeg', qualidade: 92, espaco: 'p3', tamanho: { tipo: 'original' }, metadados: 'sem-local', nome: '{nome}', pasta: 'Entrega' },
  },
  {
    id: 'instagram',
    nome: 'Instagram',
    descricao: 'JPEG em sRGB, 2160 px no lado maior',
    receita: {
      formato: 'jpeg',
      qualidade: 90,
      espaco: 'srgb',
      tamanho: { tipo: 'lado', px: 2160 },
      nitidez: { destino: 'tela', intensidade: 'padrao' },
      metadados: 'so-direitos',
      nome: '{nome}',
      pasta: 'Instagram',
    },
  },
  {
    id: 'prova',
    nome: 'Prova do cliente',
    descricao: 'JPEG em sRGB, 2048 px, com marca-d’água e sem metadados',
    receita: {
      formato: 'jpeg',
      qualidade: 80,
      espaco: 'srgb',
      tamanho: { tipo: 'lado', px: 2048 },
      nitidez: { destino: 'tela', intensidade: 'padrao' },
      metadados: 'nenhum',
      marcaDagua: { texto: 'PROVA', posicao: 'diagonal', opacidade: 0.25, tamanho: 0.3 },
      nome: '{nome}-prova',
      pasta: 'Prova',
    },
  },
  {
    id: 'impressao',
    nome: 'Impressão',
    descricao: 'TIFF de 16 bits em Adobe RGB, tamanho cheio',
    receita: { formato: 'tiff', bits: 16, espaco: 'adobe', tamanho: { tipo: 'original' }, metadados: 'sem-local', nome: '{nome}', pasta: 'Impressão' },
  },
].map((p) => Object.freeze({ ...p, receita: normalizarReceita(p.receita) }))

/** A receita de uma predefinição de saída pelo id (cópia, para editar à vontade), ou null. */
export function receitaDaPredefinicao(id) {
  const p = PREDEFINICOES_DE_SAIDA.find((x) => x.id === id)
  return p ? structuredClone(p.receita) : null
}

// ─────────── chave de idempotência ───────────

// JSON com as chaves em ordem: o mesmo objeto dá o mesmo texto, não importa a ordem em que foi montado
function estavel(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return `[${v.map(estavel).join(',')}]`
  return `{${Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${estavel(v[k])}`)
    .join(',')}}`
}

// MurmurHash3 de 32 bits (Appleby, domínio público) sobre as unidades UTF-16 do texto. Não é criptografia: é só uma
// impressão digital curta e estável.
function murmur3(s, semente) {
  let h = semente >>> 0
  for (let i = 0; i < s.length; i++) {
    let k = s.charCodeAt(i)
    k = Math.imul(k, 0xcc9e2d51)
    k = (k << 15) | (k >>> 17)
    k = Math.imul(k, 0x1b873593)
    h ^= k
    h = (h << 13) | (h >>> 19)
    h = (Math.imul(h, 5) + 0xe6546b64) | 0
  }
  h ^= s.length
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/**
 * A chave de uma saída: a mesma foto, com os mesmos ajustes e a mesma receita, dá sempre a mesma chave (16 dígitos
 * hexadecimais). Mudou um controle, o tamanho, o nome ou a pasta, a chave muda.
 */
export function chaveDeSaida({ foto, ajustes = null, receita }) {
  const s = estavel({ foto: String(foto ?? ''), ajustes, receita: normalizarReceita(receita) })
  return murmur3(s, 0x9e3779b9).toString(16).padStart(8, '0') + murmur3(s, 0x85ebca6b).toString(16).padStart(8, '0')
}

// ─────────── fila ───────────

export const ESTADOS = ['na-fila', 'tratando', 'pronta', 'falhou', 'pulada']

const relogio = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

/**
 * Cria a fila de um lote.
 *   itens               [{ id?, foto (id da foto), ajustes, receita, …o que mais o trabalho precisar }]
 *   simultaneos         quantos podem ser tratados ao mesmo tempo (padrão 2)
 *   feitas              chaves que já foram exportadas antes (de `chavesFeitas()` de um lote anterior)
 *   minimoParaEstimar   quantas fotos prontas é preciso medir antes de mostrar tempo restante (padrão 3)
 *   agora               relógio em milissegundos (injetável nos testes)
 *
 * Estados de um item: 'na-fila' → 'tratando' → 'pronta' | 'falhou' (com `motivo`) | 'pulada' (com `motivo`:
 * 'repetida', 'ja-feita', 'cancelada' ou o que `pular` receber).
 */
export function criarFila({ itens = [], simultaneos = 2, feitas = [], minimoParaEstimar = 3, agora = relogio } = {}) {
  const vagas = Math.max(1, Math.round(num(simultaneos) ?? 2))
  const minimo = Math.max(1, Math.round(num(minimoParaEstimar) ?? 3))
  const concluidas = new Set(feitas)
  const noLote = new Set()
  const lista = []
  const ouvintes = new Set()
  const controles = new Set()
  let pausada = false
  let cancelada = false
  let seq = 0

  const avisar = () => {
    for (const f of [...ouvintes]) f()
  }

  function incluir(dados) {
    const chave = chaveDeSaida(dados)
    const item = { id: dados.id ?? `item-${++seq}`, chave, estado: 'na-fila', motivo: null, tentativas: 0, inicio: null, duracao: null, resultado: null, dados }
    if (lista.some((x) => x.id === item.id)) throw new Error(`Fila: id repetido: ${item.id}`)
    if (concluidas.has(chave)) {
      item.estado = 'pulada'
      item.motivo = 'ja-feita'
    } else if (noLote.has(chave)) {
      item.estado = 'pulada'
      item.motivo = 'repetida'
    } else if (cancelada) {
      item.estado = 'pulada'
      item.motivo = 'cancelada'
    }
    noLote.add(chave)
    lista.push(item)
    return item
  }
  for (const dados of itens) incluir(dados)

  const achar = (id) => {
    const item = lista.find((x) => x.id === id)
    if (!item) throw new Error(`Fila: item desconhecido: ${id}`)
    return item
  }
  const contar = (estado) => lista.reduce((n, x) => n + (x.estado === estado ? 1 : 0), 0)

  function estimativa() {
    const prontas = lista.filter((x) => x.estado === 'pronta' && x.duracao !== null)
    const pendentes = contar('na-fila')
    const emCurso = lista.filter((x) => x.estado === 'tratando')
    if (prontas.length < minimo) return { restanteMs: null, medidos: prontas.length, porItemMs: null }
    const porItem = prontas.reduce((s, x) => s + x.duracao, 0) / prontas.length
    if (pendentes + emCurso.length === 0) return { restanteMs: 0, medidos: prontas.length, porItemMs: porItem }
    const t = agora()
    // o que falta de trabalho: as que esperam inteiras, as em curso pelo que ainda falta delas
    const falta = pendentes * porItem + emCurso.reduce((s, x) => s + Math.max(0, porItem - (t - x.inicio)), 0)
    const frentes = Math.min(vagas, pendentes + emCurso.length)
    return { restanteMs: falta / frentes, medidos: prontas.length, porItemMs: porItem }
  }

  const fila = {
    /** Os itens que podem começar agora (respeita `simultaneos`, pausa e cancelamento); já saem como 'tratando'. */
    proximos() {
      if (pausada || cancelada) return []
      const livres = vagas - contar('tratando')
      const saida = []
      for (const item of lista) {
        if (saida.length >= livres) break
        if (item.estado !== 'na-fila') continue
        item.estado = 'tratando'
        item.inicio = agora()
        item.tentativas++
        saida.push(item)
      }
      if (saida.length) avisar()
      return saida.map((x) => ({ id: x.id, chave: x.chave, dados: x.dados }))
    },

    concluir(id, resultado = null) {
      const item = achar(id)
      if (item.estado !== 'tratando') throw new Error(`Fila: ${id} não está em tratamento`)
      item.estado = 'pronta'
      item.motivo = null
      item.duracao = agora() - item.inicio
      item.resultado = resultado
      concluidas.add(item.chave)
      avisar()
    },

    /** Marca a falha com o motivo. Trabalho que cai porque o lote foi cancelado não é falha: fica como pulada. */
    falhar(id, motivo) {
      const item = achar(id)
      if (item.estado !== 'tratando') throw new Error(`Fila: ${id} não está em tratamento`)
      item.duracao = null
      if (cancelada) {
        item.estado = 'pulada'
        item.motivo = 'cancelada'
      } else {
        item.estado = 'falhou'
        item.motivo = String(motivo?.message ?? motivo ?? 'falhou sem dizer o motivo')
      }
      avisar()
    },

    pular(id, motivo = 'pulada') {
      const item = achar(id)
      if (item.estado !== 'na-fila' && item.estado !== 'tratando') return
      item.estado = 'pulada'
      item.motivo = String(motivo)
      avisar()
    },

    /** Para de começar fotos novas; as que estão em tratamento terminam. */
    pausar() {
      if (pausada) return
      pausada = true
      avisar()
    },

    retomar() {
      if (!pausada) return
      pausada = false
      avisar()
    },

    /** Cancela o lote: o que esperava vira 'pulada' (motivo 'cancelada'); quem está em tratamento recebe o sinal. */
    cancelar() {
      if (cancelada) return
      cancelada = true
      for (const item of lista) {
        if (item.estado === 'na-fila') {
          item.estado = 'pulada'
          item.motivo = 'cancelada'
        }
      }
      for (const c of controles) c.abort()
      avisar()
    },

    /** Põe de volta na fila só as que falharam (e reabre um lote cancelado). Devolve quantas voltaram. */
    repetirFalhas() {
      let voltaram = 0
      for (const item of lista) {
        if (item.estado !== 'falhou') continue
        item.estado = 'na-fila'
        item.motivo = null
        item.inicio = null
        voltaram++
      }
      if (voltaram) {
        cancelada = false
        avisar()
      }
      return voltaram
    },

    /** Acrescenta itens a um lote em andamento. */
    adicionar(novos) {
      for (const dados of novos) incluir(dados)
      avisar()
    },

    /** Retrato do lote, em JSON puro: itens, contagem, progresso (0..1), pausa, cancelamento e estimativa. */
    estado() {
      const contagem = {
        total: lista.length,
        naFila: contar('na-fila'),
        tratando: contar('tratando'),
        prontas: contar('pronta'),
        falhas: contar('falhou'),
        puladas: contar('pulada'),
      }
      const resolvidas = contagem.prontas + contagem.falhas + contagem.puladas
      return {
        itens: lista.map((x) => ({ id: x.id, chave: x.chave, estado: x.estado, motivo: x.motivo, tentativas: x.tentativas, duracao: x.duracao, resultado: x.resultado })),
        contagem,
        progresso: contagem.total ? resolvidas / contagem.total : 1,
        pausada,
        cancelada,
        terminada: contagem.naFila === 0 && contagem.tratando === 0,
        estimativa: estimativa(),
      }
    },

    /** As chaves do que já foi exportado (as de antes e as deste lote): guarde e devolva em `feitas` da próxima vez. */
    chavesFeitas: () => [...concluidas],

    /** Chama `f` a cada mudança; devolve a função que cancela a assinatura. */
    assinar(f) {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },

    /**
     * Roda o lote até não haver mais o que fazer e devolve o retrato final. `tratar(dados, { sinal, id, chave })`
     * faz o trabalho de um item (pode ser assíncrona): o que ela devolve vira o `resultado`; se lançar, o item falha
     * com a mensagem do erro. `sinal` é um AbortSignal que dispara no cancelamento. Em pausa, espera o `retomar`.
     */
    async executar(tratar) {
      const controle = new AbortController()
      controles.add(controle)
      const emCurso = new Set()
      try {
        for (;;) {
          for (const item of fila.proximos()) {
            const trabalho = Promise.resolve()
              .then(() => tratar(item.dados, { sinal: controle.signal, id: item.id, chave: item.chave }))
              .then(
                (resultado) => fila.concluir(item.id, resultado),
                (erro) => fila.falhar(item.id, erro),
              )
              .finally(() => emCurso.delete(trabalho))
            emCurso.add(trabalho)
          }
          if (emCurso.size) await Promise.race(emCurso)
          else if (pausada && !cancelada && contar('na-fila') > 0) {
            await new Promise((resolver) => {
              const parar = fila.assinar(() => {
                parar()
                resolver()
              })
            })
          } else break
        }
      } finally {
        controles.delete(controle)
      }
      return fila.estado()
    },
  }
  return fila
}

// ─────────── uma receita sobre uma imagem ───────────

// Abaixo de 90 a croma vai pela metade (4:2:0), como a maioria dos codificadores faz por padrão: o olho resolve cor
// com menos detalhe do que luz e o arquivo encolhe. De 90 para cima a pessoa pediu qualidade: croma inteira (4:4:4).
const subamostragemDe = (qualidade) => (qualidade >= 90 ? '444' : '420')

/**
 * Cumpre uma receita sobre uma imagem já revelada e devolve o arquivo.
 *
 *   imagem     imagem de TELA do motor no espaço da receita: { largura, altura, dados: Float32Array RGB de 0 a 1 }, o
 *              que `revelar(base, ajustes, { tela: receita.espaco })` devolve
 *   receita    qualquer coisa que `normalizarReceita` aceite
 *   contexto   exif        o exif do contrato (mais `fabricante` e `modelo`, se houver)
 *              foto        { estrelas, cor, marca } para o XMP embutido
 *              software    nome do programa (de app/nome.js), autor, direitos, local, quando: ver exif-escrever.js
 *              idioma      idioma da etiqueta de cor no XMP ('pt' | 'en')
 *              mascara     { largura, altura, dados: Float32Array } da marca-d'água, desenhada por quem chama a partir
 *                          de `receita.marcaDagua.texto`. Receita com marca e sem máscara LANÇA: prova sem marca não sai
 *              codificar   opcional: ({ formato, largura, altura, rgba, qualidade }) → Promise<Uint8Array>, o
 *                          codificador do navegador (canvas). Sem ele o JPEG sai pelo codificador próprio; WebP só com ele
 *
 * → { bytes, tipo (MIME), extensao, largura, altura, receita (a normalizada) }
 * Ordem: reduzir (em luz linear) → nitidez de saída → marca-d'água → bytes → codificar → perfil ICC, EXIF e XMP.
 */
export async function gerarSaida(imagem, receita, contexto = {}) {
  const r = normalizarReceita(receita)
  const [{ redimensionar, nitidezDeSaida }, { aplicarMarcaDagua }, { paraBytes }, { perfilIcc }, { montarExif }, { pacoteXmp }] = await Promise.all([
    import('./redimensionar.js'),
    import('./marca-dagua.js'),
    import('../motor/tela.js'),
    import('./icc.js'),
    import('./exif-escrever.js'),
    import('./xmp.js'),
  ])
  if (r.marcaDagua && !contexto.mascara) throw new Error("Exportação: a receita pede marca-d'água e a máscara não veio")
  if (r.formato === 'webp' && !contexto.codificar) throw new Error('Exportação: WebP só com o codificador do navegador')

  let atual = redimensionar(imagem, r.tamanho, { espaco: r.espaco, ampliar: r.tamanho.ampliar })
  if (r.nitidez) atual = nitidezDeSaida(atual, r.nitidez)
  if (r.marcaDagua) atual = aplicarMarcaDagua(atual, contexto.mascara, r.marcaDagua)
  const { largura, altura } = atual

  const icc = perfilIcc(r.espaco)
  const exif = montarExif(
    { ...contexto.exif },
    {
      metadados: r.metadados,
      software: contexto.software,
      autor: contexto.autor,
      direitos: contexto.direitos,
      local: contexto.local,
      quando: contexto.quando,
      formato: r.formato,
      espaco: r.espaco,
      largura,
      altura,
    },
  )
  let xmp = null
  if (r.metadados === 'so-direitos') {
    if (contexto.autor || contexto.direitos) xmp = pacoteXmp({ autor: contexto.autor, direitos: contexto.direitos })
  } else if (r.metadados !== 'nenhum') {
    xmp = pacoteXmp({ ...contexto.foto, idioma: contexto.idioma ?? 'pt', software: contexto.software, autor: contexto.autor, direitos: contexto.direitos })
  }

  let bytes
  if (r.formato === 'jpeg' || r.formato === 'webp') {
    const rgba = paraBytes(atual, { bits: 8 })
    if (contexto.codificar) bytes = await contexto.codificar({ formato: r.formato, largura, altura, rgba, qualidade: r.qualidade })
    else {
      const { codificarJpeg } = await import('./jpeg.js')
      bytes = codificarJpeg({ largura, altura, rgb8: rgba, qualidade: r.qualidade, subamostragem: subamostragemDe(r.qualidade) })
    }
    if (r.formato === 'jpeg') {
      const { embutirNoJpeg } = await import('./jpeg.js')
      bytes = embutirNoJpeg(bytes, { icc, exif, xmp })
    }
  } else {
    // 8 bits sem perda leva pontilhado: troca o degrau do arredondamento por ruído fino (nada de faixas no céu)
    const dados = r.bits === 16 ? paraBytes(atual, { bits: 16 }) : paraBytes(atual, { bits: 8, pontilhado: true })
    if (r.formato === 'tiff') {
      const { escreverTiff } = await import('./tiff.js')
      bytes = await escreverTiff({ largura, altura, dados, bits: r.bits, icc, exif, xmp, compressao: r.compressao })
    } else {
      const { escreverPng } = await import('./png.js')
      bytes = await escreverPng({ largura, altura, dados, bits: r.bits, icc, exif, xmp })
    }
  }
  return { bytes, tipo: TIPOS_MIME[r.formato], extensao: EXTENSOES[r.formato], largura, altura, receita: r }
}
