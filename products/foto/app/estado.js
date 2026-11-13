// A loja: liga o catálogo (src/biblioteca/catalogo.js, modelo puro) à tela e guarda cada trabalho neste aparelho.
// Toda tela recebe `{ loja }`. O que ela oferece:
//
//   loja.catalogo                 o catálogo do trabalho aberto (fotos, marcas, filtros, seleção, desfazer)
//   loja.trabalho()               { id, nome, origem: 'pasta' | 'arquivos', total, … } ou null
//   loja.situacao()               'vazio' | 'abrindo' | 'aberto'
//   loja.ligado()                 os arquivos originais estão ao alcance? (depois de recarregar, só com a pasta)
//   loja.abrirPasta() · escolherFotos(arquivos) · soltar(dataTransfer) · abrirRecente(id) · fecharTrabalho()
//   loja.arquivo(id)              → { arquivo: File, par?: File, tipo } | null   (o original, para o motor)
//   loja.miniaturas               url(id) · pedir(id) · blob(id, 'previa') · pixels(id) · grande(id)   (app/abrir/miniaturas.js)
//   loja.aba(nome)                um objeto só daquela aba, que dura enquanto o trabalho está aberto
//
// Assinatura fina (a grade não redesenha tudo): `usarFoto(loja, id)` só acorda quando AQUELA foto muda;
// `usarCatalogo(loja, seletor, tipos)` só quando o seletor devolve outra coisa; `usarLoja(loja, seletor)` para o
// trabalho e a situação.
//
// Guarda: a cada mudança do catálogo, 300 ms depois, o catálogo inteiro vai para o IndexedDB (`loja.salvarAgora()`
// força). A foto não sai do aparelho: aqui não há nenhuma chamada de rede.

import { criarCatalogo, hashDe, idDaFoto } from '../src/biblioteca/catalogo.js'
import { formatoDe, juntarPares } from '../src/biblioteca/arquivos.js'
import { guardar, ultimo } from './abrir/guardar.js'
import { deArquivos, dePasta, deSolta, pastaComum, temPasta } from './abrir/ler.js'
import { criarMiniaturas } from './abrir/miniaturas.js'
import { avisar } from './componentes/aviso.js'
import { useEffect, useRef, useState } from './preact.js'

const ESPERA_DA_GUARDA = 300
const VAZIO = { zro: 'foto.catalogo', versao: 1, fotos: [] }
/** O que vem do arquivo (o resto é decisão ou medida, e acompanha a foto quando ela é aberta de novo). */
const DO_ARQUIVO = new Set(['id', 'nome', 'caminho', 'tamanho', 'tipo', 'formato', 'exif', 'par'])

const novoId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

/** "13 de novembro" a partir do EXIF ('AAAA-MM-DDTHH:MM:SS') ou de hoje. */
function nomePorData(data) {
  const d = data && /^\d{4}-\d{2}-\d{2}/.test(data) ? new Date(`${data.slice(0, 10)}T12:00:00`) : new Date()
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
}

export function criarLoja() {
  const catalogo = criarCatalogo()
  let trabalho = null
  let situacao = 'vazio'
  let ligado = false
  let lendo = null
  /** id → { arquivo: File, par?: File, tipo } */
  const arquivos = new Map()
  const abas = new Map()
  const ouvintes = new Set()
  const porFoto = new Map()
  let relogio = null
  let guardando = Promise.resolve()
  let pendente = false

  const publicar = () => ouvintes.forEach((f) => f())
  const acordar = (ids) => {
    for (const id of ids) porFoto.get(id)?.forEach((f) => f())
  }

  const miniaturas = criarMiniaturas({
    arquivoDe: (id) => arquivos.get(id) ?? null,
    aoGerar(id, { proporcao, semPrevia }) {
      const f = catalogo.foto(id)
      if (!f) return
      if (semPrevia && !f.semPrevia) catalogo.atualizar(id, { semPrevia: true })
      else if (proporcao && Math.abs((f.proporcao || 0) - proporcao) > 0.001) catalogo.atualizar(id, { proporcao, semPrevia: false })
    },
  })

  catalogo.assinar((aviso) => {
    if ((aviso.tipo === 'dados' || aviso.tipo === 'selecao') && aviso.ids) acordar(aviso.ids)
    if (aviso.tipo !== 'selecao' && aviso.tipo !== 'historico') agendarGuarda()
  })

  function resumo() {
    const visiveis = catalogo.fotos()
    return { ...trabalho, total: catalogo.tamanho, capas: visiveis.slice(0, 4).map((f) => f.id) }
  }

  function agendarGuarda() {
    if (!trabalho) return
    pendente = true
    clearTimeout(relogio)
    relogio = setTimeout(() => void salvarAgora(), ESPERA_DA_GUARDA)
  }

  /** Grava já o catálogo e o resumo do trabalho. Devolve quando o IndexedDB confirmou. */
  function salvarAgora() {
    clearTimeout(relogio)
    if (!trabalho || !pendente) return guardando
    pendente = false
    const t = (trabalho = resumo())
    const dados = catalogo.serializar()
    guardando = guardando.then(() => Promise.all([guardar.salvarCatalogo(t.id, dados), guardar.salvarTrabalho(t)])).then(() => {})
    return guardando
  }

  function esvaziar() {
    clearTimeout(relogio)
    pendente = false
    trabalho = null
    situacao = 'vazio'
    ligado = false
    lendo = null
    arquivos.clear()
    abas.clear()
    miniaturas.limpar()
    catalogo.restaurar(VAZIO)
  }

  /** Decisões e medidas de um catálogo guardado voltam para as mesmas fotos (pelo id). */
  function trazerDecisoes(antigo) {
    const alteracoes = []
    for (const f of antigo.fotos || []) {
      if (!catalogo.tem(f.id)) continue
      const resto = Object.fromEntries(Object.entries(f).filter(([k]) => !DO_ARQUIVO.has(k)))
      alteracoes.push({ id: f.id, ...resto })
    }
    catalogo.atualizarVarias(alteracoes)
    if (antigo.grupos?.length) {
      const membros = new Map(antigo.grupos.map((g) => [g.id, { ...g, fotos: [] }]))
      for (const f of catalogo.fotos()) if (f.grupo && membros.has(f.grupo)) membros.get(f.grupo).fotos.push(f.id)
      catalogo.definirGrupos([...membros.values()])
    }
  }

  /**
   * Põe arquivos no trabalho aberto (ou abre um novo com eles). Foto que já está no catálogo (mesmo nome e tamanho)
   * só é religada ao arquivo; as novas são identificadas (EXIF) e entram na grade conforme chegam.
   */
  async function abrirEntradas(entradas, { nome, origem = 'arquivos', pasta = null } = {}) {
    const pares = juntarPares(entradas)
    if (!pares.length) {
      avisar('Nenhuma foto por aqui.')
      return false
    }
    const novo = !trabalho
    if (novo) {
      esvaziar()
      trabalho = { id: novoId(), nome: nome || pastaComum(entradas) || '', origem, criadoEm: Date.now(), abertoEm: Date.now(), total: 0, capas: [] }
      situacao = 'abrindo'
    }
    const meu = trabalho.id
    const origemDe = (p) => ({ arquivo: p.principal.arquivo, par: p.par?.arquivo, tipo: p.tipo })

    // religar: o que já está no catálogo não precisa ser lido de novo
    const conhecidas = new Map()
    for (const f of catalogo.fotos()) conhecidas.set(`${f.nome.toLowerCase()}|${f.tamanho}`, f.id)
    const novas = []
    const religadas = []
    for (const p of pares) {
      const id = conhecidas.get(`${p.principal.nome.toLowerCase()}|${p.principal.tamanho}`)
      if (id) {
        arquivos.set(id, origemDe(p))
        religadas.push(id)
      } else novas.push(p)
    }

    lendo = { feitas: 0, total: novas.length }
    publicar()
    const prontas = new Array(novas.length)
    let proxima = 0
    const entraram = []
    await miniaturas.identificar(
      novas.map((p) => p.principal.arquivo),
      {
        aoLote(inicio, resultado) {
          if (trabalho?.id !== meu) return
          resultado.forEach((r, k) => {
            const p = novas[inicio + k]
            const exif = r.exif || { orientacao: 1 }
            const id = idDaFoto({ nome: p.principal.nome, tamanho: p.principal.tamanho, data: exif.data })
            const par = p.par ? { par: { nome: p.par.nome, tamanho: p.par.tamanho, formato: formatoDe(p.par.nome)?.formato || '' } } : {}
            prontas[inicio + k] = { id, nome: p.principal.nome, caminho: p.principal.caminho, tamanho: p.principal.tamanho, tipo: p.tipo, formato: p.formato, exif, ...par }
            arquivos.set(id, origemDe(p))
          })
          // entra na ordem em que os arquivos vieram: a grade cresce pelo fim, sem pular
          const lote = []
          while (proxima < novas.length && prontas[proxima]) lote.push(prontas[proxima++])
          if (!lote.length) return
          if (novo && !trabalho.nome) trabalho = { ...trabalho, nome: `Fotos de ${nomePorData(lote[0].exif?.data)}` }
          entraram.push(...catalogo.adicionar(lote))
          lendo = { feitas: proxima, total: novas.length }
          situacao = 'aberto'
          publicar()
        },
      },
    )
    if (trabalho?.id !== meu) return false
    lendo = null
    situacao = 'aberto'
    ligado = arquivos.size >= catalogo.tamanho

    const ids = catalogo.ids()
    const assinatura = hashDe([...ids].sort().join(','))
    if (novo && origem === 'arquivos') {
      // as mesmas fotos de um trabalho que já existia: é ele, com as marcas que tinha
      const antigo = (await guardar.trabalhos()).find((t) => t.assinatura === assinatura)
      const dados = antigo ? await guardar.catalogo(antigo.id) : null
      if (antigo && dados && trabalho?.id === meu) {
        trabalho = { ...trabalho, id: antigo.id, nome: antigo.nome, criadoEm: antigo.criadoEm }
        trazerDecisoes(dados)
      }
    }
    if (!trabalho) return false
    trabalho = { ...trabalho, assinatura, abertoEm: Date.now() }
    ultimo.gravar(trabalho.id)
    if (pasta) guardar.salvarPasta(trabalho.id, pasta)
    pendente = true
    publicar()
    await salvarAgora()
    void miniaturas.gerarTudo(ids)
    if (!novo && (entraram.length || religadas.length)) {
      avisar(entraram.length ? `${entraram.length.toLocaleString('pt-BR')} ${entraram.length === 1 ? 'foto entrou' : 'fotos entraram'}` : 'Originais ligados de novo')
    }
    return true
  }

  /** A pasta guardada de um trabalho: confere a permissão (pedindo, se `pedir`) e religa os arquivos. */
  async function religarPasta({ pedir = false } = {}) {
    if (!trabalho) return false
    const meu = trabalho.id
    const pasta = await guardar.pasta(meu)
    if (!pasta?.queryPermission) return false
    let permissao = await pasta.queryPermission({ mode: 'read' }).catch(() => 'denied')
    if (permissao !== 'granted' && pedir) permissao = await pasta.requestPermission({ mode: 'read' }).catch(() => 'denied')
    if (permissao !== 'granted' || trabalho?.id !== meu) return false
    const entradas = await dePasta(pasta).catch(() => [])
    if (trabalho?.id !== meu || !entradas.length) return false
    return abrirEntradas(entradas, { pasta })
  }

  const loja = {
    catalogo,
    miniaturas,
    trabalho: () => trabalho,
    situacao: () => situacao,
    ligado: () => ligado,
    /** Enquanto as fotos são identificadas: { feitas, total }; senão null. */
    lendo: () => lendo,
    temPasta,

    /** Qualquer mudança no trabalho ou na situação (não as do catálogo: para essas, `catalogo.assinar`). */
    assinar(f) {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    /** Só quando esta foto muda (dados, seleção ou foco). */
    assinarFoto(id, f) {
      if (!porFoto.has(id)) porFoto.set(id, new Set())
      porFoto.get(id).add(f)
      return () => {
        const s = porFoto.get(id)
        s?.delete(f)
        if (s && !s.size) porFoto.delete(id)
      }
    },

    /** O original da foto: { arquivo: File, par?: File, tipo }, ou null se não está ao alcance. */
    arquivo: (id) => arquivos.get(id) ?? null,
    temOriginal: (id) => arquivos.has(id),

    /** O objeto de estado de uma aba (rolagem, painel aberto, o que for): dura enquanto o trabalho está aberto. */
    aba(nome) {
      if (!abas.has(nome)) abas.set(nome, {})
      return abas.get(nome)
    },

    /** "Abrir pasta": o seletor do sistema. Se a pasta já é um trabalho guardado, reabre com as marcas. */
    async abrirPasta() {
      if (!temPasta()) return false
      let pasta
      try {
        pasta = await showDirectoryPicker({ id: 'fotos', mode: 'read' })
      } catch {
        return false // a pessoa cancelou
      }
      if (!trabalho) {
        for (const t of await guardar.trabalhos()) {
          if (t.origem !== 'pasta') continue
          const guardada = await guardar.pasta(t.id)
          if (guardada && (await guardada.isSameEntry(pasta).catch(() => false))) {
            await guardar.salvarPasta(t.id, pasta)
            return loja.abrirRecente(t.id)
          }
        }
        esvaziar()
        trabalho = { id: novoId(), nome: pasta.name, origem: 'pasta', criadoEm: Date.now(), abertoEm: Date.now(), total: 0, capas: [] }
        situacao = 'abrindo'
        publicar()
      }
      const meu = trabalho.id
      const entradas = await dePasta(pasta, {
        aoAchar(n) {
          if (trabalho?.id !== meu) return
          lendo = { feitas: 0, total: n }
          publicar()
        },
      }).catch(() => [])
      if (trabalho?.id !== meu) return false
      if (!entradas.length) {
        if (!catalogo.tamanho) {
          esvaziar()
          publicar()
        }
        avisar('Nenhuma foto nessa pasta.')
        return false
      }
      return abrirEntradas(entradas, { nome: pasta.name, origem: 'pasta', pasta })
    },
    /** "Escolher fotos": os arquivos de um <input type="file" multiple>. */
    escolherFotos: (lista) => abrirEntradas(deArquivos(lista)),
    /** O que foi solto na janela. Chame dentro do evento `drop`. */
    async soltar(transferencia) {
      const { entradas, pasta, nome } = await deSolta(transferencia)
      return abrirEntradas(entradas, { nome, origem: pasta ? 'pasta' : 'arquivos', pasta })
    },

    /** Os trabalhos guardados neste aparelho, do mais recente para o mais antigo. */
    recentes: () => guardar.trabalhos(),
    /**
     * Reabre um trabalho guardado: a grade volta na hora (catálogo e miniaturas do IndexedDB). Com pasta, religa os
     * originais; `pedirPermissao` só dentro de um clique (o navegador exige).
     */
    async abrirRecente(id, { pedirPermissao = true } = {}) {
      const [t, dados] = await Promise.all([guardar.trabalho(id), guardar.catalogo(id)])
      if (!t || !dados) return false
      await salvarAgora()
      esvaziar()
      trabalho = { ...t, abertoEm: Date.now() }
      try {
        catalogo.restaurar(dados)
      } catch {
        esvaziar()
        publicar()
        return false
      }
      pendente = false
      clearTimeout(relogio)
      situacao = 'aberto'
      ultimo.gravar(id)
      guardar.salvarTrabalho(trabalho)
      publicar()
      if (t.origem === 'pasta') void religarPasta({ pedir: pedirPermissao }).then(() => publicar())
      return true
    },
    /** Pede de novo a permissão da pasta (dentro de um clique) e religa os originais. */
    religar: () => religarPasta({ pedir: true }).then((ok) => (publicar(), ok)),
    /** Reabre o último trabalho ao carregar o app (sem pedir permissão: não há clique). */
    async iniciar() {
      const id = ultimo.ler()
      if (!id || trabalho) return false
      return loja.abrirRecente(id, { pedirPermissao: false })
    },
    async fecharTrabalho() {
      await salvarAgora()
      esvaziar()
      ultimo.gravar(null)
      publicar()
    },
    /** Tira o trabalho da lista deste aparelho (as fotos no disco ficam como estão). */
    async esquecer(id) {
      if (trabalho?.id === id) {
        esvaziar()
        ultimo.gravar(null)
        publicar()
      }
      await guardar.apagarTrabalho(id)
    },
    renomear(nome) {
      const limpo = String(nome || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      if (!trabalho || !limpo || limpo === trabalho.nome) return
      trabalho = { ...trabalho, nome: limpo }
      pendente = true
      publicar()
      void salvarAgora()
    },
    salvarAgora,
  }

  // ao esconder ou fechar a página, o que estava esperando é gravado
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void salvarAgora())
    addEventListener('pagehide', () => void salvarAgora())
  }
  return loja
}

/** A loja do app (uma por página). */
export const loja = criarLoja()

// ───────────────────────────── hooks ─────────────────────────────

const mesmoRaso = (a, b) => {
  if (Object.is(a, b)) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => Object.is(a[k], b[k]))
}

function usarSeletor(assinar, ler) {
  const [, redesenhar] = useState(0)
  const valor = useRef()
  const leitura = useRef(ler)
  leitura.current = ler
  const atual = ler()
  if (!mesmoRaso(valor.current, atual)) valor.current = atual
  useEffect(
    () =>
      assinar(() => {
        const novo = leitura.current()
        if (mesmoRaso(valor.current, novo)) return
        valor.current = novo
        redesenhar((n) => n + 1)
      }),
    [assinar],
  )
  return valor.current
}

/** O trabalho e a situação: `usarLoja(loja, (l) => l.trabalho())`. Redesenha só quando o seletor muda. */
export function usarLoja(l, seletor) {
  return usarSeletor(l.assinar, () => seletor(l))
}

/**
 * Um pedaço do catálogo: `usarCatalogo(loja, (c) => c.itens(), ['fotos', 'filtro', 'ordem', 'pilhas', 'dados'])`.
 * `tipos`: os avisos que interessam (sem a lista, todos). Um aviso de 'dados' que não mexe na lista (`lista: false`)
 * só acorda quem pediu 'dados*'.
 */
export function usarCatalogo(l, seletor, tipos) {
  const assinar = useRef(null)
  const chave = tipos ? tipos.join(',') : ''
  const guardado = useRef('')
  if (!assinar.current || guardado.current !== chave) {
    guardado.current = chave
    const quer = tipos ? new Set(tipos) : null
    assinar.current = (f) =>
      l.catalogo.assinar((aviso) => {
        if (quer) {
          if (aviso.tipo === 'dados' && !aviso.lista ? !quer.has('dados*') : !quer.has(aviso.tipo) && !(aviso.tipo === 'dados' && quer.has('dados*'))) return
        }
        f()
      })
  }
  return usarSeletor(assinar.current, () => seletor(l.catalogo))
}

/** Uma foto e o estado dela: { foto, selecionada, emFoco }. Só redesenha quando ESTA foto muda. */
export function usarFoto(l, id) {
  const assinar = useRef(null)
  const de = useRef(null)
  if (!assinar.current || de.current !== id) {
    de.current = id
    assinar.current = (f) => l.assinarFoto(id, f)
  }
  return usarSeletor(assinar.current, () => ({ foto: l.catalogo.foto(id), selecionada: l.catalogo.selecionada(id), emFoco: l.catalogo.foco() === id }))
}

/** O endereço da miniatura (blob:) quando ela existe, senão null. Redesenha quando chega. */
export function usarMiniatura(l, id) {
  const [, redesenhar] = useState(0)
  useEffect(() => l.miniaturas.assinar(id, () => redesenhar((n) => n + 1)), [l, id])
  return l.miniaturas.url(id)
}
