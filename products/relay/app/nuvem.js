// Relay · o painel na conta (/api/relay/painel): histórico, projetos e presets em todo aparelho. O aparelho continua
// guardando (app/historico.js, localStorage dos presets), para abrir rápido e funcionar sem rede; aqui só a ponte.
//
// Sincronizar (painel e conversor, ao abrir com a conta):
//   1. o que mudou neste aparelho sem rede (pendências) vai primeiro;
//   2. o que só existe aqui sobe (é assim que o histórico de antes da nuvem entra na conta, uma vez);
//   3. o que a conta tem e o aparelho não, desce; o que já tinha subido e sumiu da conta (apagado em outro aparelho)
//      sai daqui.
// Sem a nuvem ligada (RELAY_DATABASE_URL) ou sem rede: tudo segue no aparelho, sem erro.

import * as Historico from './historico.js'
import * as Meus from './meus.js'

const URL_PAINEL = '/api/relay/painel'
const LOTE = 100

const lerLocal = (chave, padrao) => {
  try {
    return JSON.parse(localStorage.getItem(chave) ?? 'null') ?? padrao
  } catch {
    return padrao
  }
}
const gravarLocal = (chave, v) => {
  try {
    localStorage.setItem(chave, JSON.stringify(v))
  } catch {
    // janela privada: vale só agora
  }
}

async function pedir(metodo, corpo, consulta = '') {
  const r = await fetch(URL_PAINEL + consulta, {
    method: metodo,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json', ...(corpo ? { 'content-type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.ok) throw Object.assign(new Error(j?.erro || 'Sem conexão com a conta agora.'), { status: r.status, nuvem: j?.nuvem })
  return j
}

// ─────────── pendências (o que mudou sem rede) ───────────

const chavePendentes = (conta) => `relay-pendentes:${conta}`
const pendentes = (conta) => lerLocal(chavePendentes(conta), { projetos: {}, presets: {} })
function marcar(conta, tipo, id, op) {
  const p = pendentes(conta)
  p[tipo][id] = op
  gravarLocal(chavePendentes(conta), p)
}
function desmarcar(conta, tipo, id) {
  const p = pendentes(conta)
  delete p[tipo][id]
  gravarLocal(chavePendentes(conta), p)
}

// ─────────── presets: quais já estão na conta e quais a equipe liberou ───────────

const chaveConhecidos = (conta) => `relay-meus-nuvem:${conta}`
const CHAVE_EQUIPE = 'relay-meus-equipe' // { id: true } dos presets que a pessoa liberou para a equipe
const CHAVE_DA_EQUIPE = 'relay-presets-equipe' // fichas da equipe (só leitura), para o conversor

export const liberadosParaEquipe = () => lerLocal(CHAVE_EQUIPE, {})
/** Presets que a equipe liberou (de outras pessoas), como presets do conversor. Só leitura. */
export function presetsDaEquipe() {
  const fichas = lerLocal(CHAVE_DA_EQUIPE, [])
  try {
    return Meus.daFicha(fichas).map((p) => ({ ...p, daEquipe: true }))
  } catch {
    return []
  }
}

// ─────────── sincronizar ───────────

/** Tudo de uma vez. Devolve { nuvem: boolean, equipe: boolean } (equipe: a pessoa tem organização). */
export async function sincronizar(conta) {
  if (!conta) return { nuvem: false, equipe: false }
  let remoto
  try {
    await enviarPendencias(conta)
    remoto = await pedir('GET')
  } catch {
    return { nuvem: false, equipe: false }
  }
  await Promise.all([sincronizarConversoes(conta, remoto.conversoes), sincronizarProjetos(conta, remoto.projetos)])
  await sincronizarPresets(conta, remoto.presets)
  return { nuvem: true, equipe: Boolean(remoto.equipe) }
}

async function enviarPendencias(conta) {
  const p = pendentes(conta)
  const locais = new Map((await Historico.projetos(conta)).map((x) => [x.id, x]))
  const meus = new Map(Meus.carregar().map((x) => [x.id, x]))
  const equipe = liberadosParaEquipe()
  const tarefas = [
    ...Object.entries(p.projetos).map(([id, op]) => [
      'projetos',
      id,
      async () => {
        if (op === 'del') await pedir('DELETE', null, `?tipo=projeto&id=${encodeURIComponent(id)}`)
        else if (locais.has(id)) await Historico.guardarProjeto(conta, { ...(await pedir('PUT', { projeto: locais.get(id) })).projeto, nuvem: true })
      },
    ]),
    ...Object.entries(p.presets).map(([id, op]) => [
      'presets',
      id,
      async () => {
        if (op === 'del') await pedir('DELETE', null, `?tipo=preset&id=${encodeURIComponent(id)}`)
        else if (meus.has(id)) await pedir('PUT', { preset: { id, ficha: Meus.fichaDe(meus.get(id)), equipe: Boolean(equipe[id]) } })
      },
    ]),
  ]
  for (const [tipo, id, fazer] of tarefas) {
    try {
      await fazer()
      desmarcar(conta, tipo, id)
    } catch (e) {
      // a conta recusou (de outra pessoa, ficha inválida): não adianta repetir; sem rede ou banco fora: fica
      if (e.status >= 400 && e.status < 500 && e.status !== 401) desmarcar(conta, tipo, id)
      else throw e
    }
  }
}

async function sincronizarConversoes(conta, remotas) {
  const locais = await Historico.conversoes(conta)
  const naConta = new Set(remotas.map((c) => c.id))
  const subir = locais.filter((c) => !c.nuvem && !naConta.has(c.id))
  for (let i = 0; i < subir.length; i += LOTE) {
    try {
      await pedir('POST', { conversoes: subir.slice(i, i + LOTE) })
      for (const c of subir.slice(i, i + LOTE)) naConta.add(c.id)
    } catch {
      break // fica para a próxima
    }
  }
  // a conta manda: o que já tinha subido e não está mais lá (apagado em outro aparelho, ou passou de 500) sai daqui
  await Historico.substituirConversoes(
    conta,
    [...remotas.map((c) => ({ ...c, nuvem: true })), ...subir.map((c) => ({ ...c, nuvem: naConta.has(c.id) }))].filter((c, i, l) => l.findIndex((x) => x.id === c.id) === i),
  )
}

async function sincronizarProjetos(conta, remotos) {
  const locais = await Historico.projetos(conta)
  const naConta = new Map(remotos.map((p) => [p.id, p]))
  const final = remotos.map((p) => ({ ...p, nuvem: true }))
  for (const p of locais) {
    if (naConta.has(p.id) || p.meu === false) continue // da equipe que sumiu: a pessoa fechou
    if (p.nuvem) continue // já tinha subido e foi apagado em outro aparelho
    try {
      final.push({ ...(await pedir('PUT', { projeto: p })).projeto, nuvem: true })
    } catch {
      final.push(p)
    }
  }
  await Historico.substituirProjetos(conta, final)
}

async function sincronizarPresets(conta, remotos) {
  const conhecidos = new Set(lerLocal(chaveConhecidos(conta), []))
  const meus = remotos.filter((p) => p.meu)
  const naConta = new Set(meus.map((p) => p.id))
  const locais = Meus.carregar()
  const equipe = liberadosParaEquipe()
  const final = []
  // os da conta (a conta manda)
  for (const p of Meus.daFicha(meus.map((x) => ({ id: x.id, ...x.ficha })))) final.push(p)
  for (const r of meus) equipe[r.id] = r.equipe
  // os que só existem aqui: novos sobem; os que já tinham subido e sumiram foram apagados em outro aparelho
  for (const p of locais) {
    if (naConta.has(p.id) || conhecidos.has(p.id)) continue
    try {
      await pedir('PUT', { preset: { id: p.id, ficha: Meus.fichaDe(p), equipe: Boolean(equipe[p.id]) } })
      naConta.add(p.id)
    } catch {
      // fica só aqui; tenta de novo na próxima
    }
    final.push(p)
  }
  Meus.guardar(final)
  gravarLocal(CHAVE_EQUIPE, equipe)
  gravarLocal(chaveConhecidos(conta), [...naConta])
  gravarLocal(
    CHAVE_DA_EQUIPE,
    remotos.filter((p) => !p.meu).map((p) => ({ id: p.id, ...p.ficha })),
  )
}

// ─────────── mudanças vindas da tela ───────────

/** Uma conversão pronta: sobe na hora; sem rede, fica marcada e sobe na próxima sincronização. */
export async function enviarConversao(conta, registro) {
  try {
    await pedir('POST', { conversoes: [registro] })
    await Historico.registrar(conta, { ...registro, nuvem: true })
  } catch {
    // sem nuvem agora: já está no aparelho (nuvem: false)
  }
}

export async function guardarProjeto(conta, p) {
  await Historico.guardarProjeto(conta, { ...p, meu: true })
  try {
    const r = await pedir('PUT', { projeto: p })
    await Historico.guardarProjeto(conta, { ...r.projeto, nuvem: true })
  } catch (e) {
    if (e.status === 403 || e.status === 400) throw e
    if (e.nuvem !== false) marcar(conta, 'projetos', p.id, 'put')
  }
}

export async function apagarProjeto(conta, id) {
  await Historico.apagarProjeto(conta, id)
  try {
    await pedir('DELETE', null, `?tipo=projeto&id=${encodeURIComponent(id)}`)
  } catch (e) {
    if (e.nuvem !== false) marcar(conta, 'projetos', id, 'del')
  }
}

export async function limparHistorico(conta) {
  await Historico.limpar(conta)
  try {
    await pedir('DELETE', null, '?tipo=historico')
  } catch (e) {
    if (e.nuvem !== false) throw new Error('Limpou neste aparelho; na conta, tente de novo com internet.')
  }
}

/** Os presets da pessoa mudaram no conversor (lista antes → depois): sobe o que mudou, apaga o que saiu. */
export async function presetsMudaram(conta, antes, depois) {
  if (!conta) return
  const a = new Map(antes.map((p) => [p.id, JSON.stringify(Meus.fichaDe(p))]))
  const d = new Map(depois.map((p) => [p.id, p]))
  const equipe = liberadosParaEquipe()
  for (const [id, p] of d)
    if (a.get(id) !== JSON.stringify(Meus.fichaDe(p))) {
      try {
        await pedir('PUT', { preset: { id, ficha: Meus.fichaDe(p), equipe: Boolean(equipe[id]) } })
        gravarLocal(chaveConhecidos(conta), [...new Set([...lerLocal(chaveConhecidos(conta), []), id])])
      } catch (e) {
        if (e.nuvem !== false) marcar(conta, 'presets', id, 'put')
      }
    }
  for (const id of a.keys())
    if (!d.has(id)) {
      try {
        await pedir('DELETE', null, `?tipo=preset&id=${encodeURIComponent(id)}`)
      } catch (e) {
        if (e.nuvem !== false) marcar(conta, 'presets', id, 'del')
      }
    }
}

/** Liga ou desliga "a equipe pode usar" num preset da pessoa. */
export async function liberarPreset(conta, p, sim) {
  const equipe = liberadosParaEquipe()
  equipe[p.id] = sim
  gravarLocal(CHAVE_EQUIPE, equipe)
  await pedir('PUT', { preset: { id: p.id, ficha: Meus.fichaDe(p), equipe: sim } })
}
