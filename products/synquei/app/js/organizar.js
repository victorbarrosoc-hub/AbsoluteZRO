// Organizar (app de desktop): cada cartão que o SOBEDESCE termina de passar chega aqui (desktop/organizador.cjs).
// O Synquei abre o projeto daquela diária (ou cria), lê os arquivos novos pelo caminho, sincroniza e manda para o
// DaVinci (desktop/davinci.cjs): pastas por diária › câmeras/áudio › dono › cartão, cor por câmera, Cena/Take e as
// linhas do tempo da diária trocadas pelas novas. Um cartão por vez, na ordem em que chegaram.
//
// Download do Drive (modo pasta única, "Preparar no Synquei" do SOBEDESCE): a operação inteira é um projeto do Synquei
// (achado pelo op; repetir não cria outro nem repete clipe). No fim, o recibo (app/js/preparo.js) vai para
// <pasta>/Synquei/preparos.jsonl: preparado, com pendências (sincronia para revisar, ausentes, alterados) ou erro.
//
// Pasta livre ("Organizar uma pasta", sem o SOBEDESCE): a pasta inteira é um projeto, como no Drive, mas o Synquei
// para antes do DaVinci e mostra o estudo (momentos, câmeras, b-roll, sincronia) para a pessoa conferir e mandar.
//
// Em todos: os momentos (app/js/momentos.js) decidem pasta e tags de cada clipe; o relatório (app/js/relatorio.js) e
// os arquivos para Premiere e Final Cut vão para <projeto>/Synquei/.

import { S, openProject, createProject, closeProject, applyType, addEntries, runSync, save, religarPorCaminho, lerProjeto } from './store.js'
import { PathFile } from './media/pathfile.js'
import { buildTimelines, safeName } from './export/model.js'
import { toXmeml } from './export/xmeml.js'
import { toFcpxml } from './export/fcpxml.js'
import { toast, plural } from './util.js'
import { resumoPreparo } from './preparo.js'
import { classificar, modeloDe, pastaDoClipe, tagsDoClipe, sessoesOrganizadas, camerasComLentes, resumoMomentos } from './momentos.js'
import { dadosRelatorio, relatorioHtml } from './relatorio.js'
import { tipoDe } from './tipos.js'

const D = globalThis.synqueiDesktop
const API = D && D.organizar
// as mesmas cores de desktop/davinci.cjs (ordem das cores dos aparelhos do Synquei)
export const CORES_RESOLVE = ['Blue', 'Orange', 'Teal', 'Yellow', 'Pink', 'Green', 'Violet', 'Apricot', 'Navy', 'Lime', 'Purple', 'Olive', 'Tan', 'Beige', 'Brown', 'Chocolate']
export const corResolve = (i) => CORES_RESOLVE[(Number(i) || 0) % CORES_RESOLVE.length]
const SUFIXO = ' · Synquei'
const PREF = 'synquei:org:davinci'

export const O = {
  ativo: !!API,
  pastas: [],
  davinci: null,
  fila: [],
  atual: null,
  etapa: '',
  esperando: false,
  // pasta livre estudada e esperando a pessoa conferir: pastaId → { projetoId, ev }
  estudos: {},
  // pasta livre já mandada para o editor nesta sessão: pastaId → quando
  enviados: {},
}

let mudouT = 0
function mudou() {
  clearTimeout(mudouT)
  mudouT = setTimeout(() => document.dispatchEvent(new CustomEvent('synquei:organizar-mudou')), 60)
}

export const mandarParaDavinci = () => {
  try {
    return localStorage.getItem(PREF) !== '0'
  } catch {
    return true
  }
}
export function setMandarParaDavinci(v) {
  try {
    localStorage.setItem(PREF, v ? '1' : '0')
  } catch {}
  mudou()
}

export async function iniciarOrganizar() {
  if (!API) return
  API.onEstado((st) => {
    O.pastas = st
    mudou()
  })
  API.onCartao((ev) => enfileirar(ev))
  D.davinci.on((st) => {
    O.davinci = st
    mudou()
  })
  D.davinci.onResposta((r) => {
    // as respostas do SFX (listar, ler, encaixar) são tratadas pela tela de SFX
    if (r.tipo) return atualizarDavinci()
    if (r.ok === false) toast(`DaVinci: ${r.erro || 'não deu certo'}`, { icon: 'warn' })
    else if (r.importados || (r.linhas && r.linhas.length)) toast(`DaVinci: ${plural(r.importados, 'clipe novo', 'clipes novos')}${r.linhas && r.linhas.length ? ` e ${r.linhas.length} linhas do tempo` : ''} em “${r.projeto}”`, { icon: 'check' })
    atualizarDavinci()
  })
  O.pastas = await API.estado()
  await atualizarDavinci()
  // o que chegou com o app fechado (ou ficou pela metade) entra na fila
  for (const p of O.pastas) if (p.ligado) for (const ev of await API.pendentes(p.id)) enfileirar(ev)
  setInterval(atualizarDavinci, 10000)
  mudou()
}

export async function atualizarDavinci() {
  if (!D || !D.davinci) return
  try {
    O.davinci = await D.davinci.status()
  } catch {}
  mudou()
}

function enfileirar(ev) {
  const k = `${ev.pastaId}|${ev.id}`
  if ((O.atual && `${O.atual.pastaId}|${O.atual.id}` === k) || O.fila.some((x) => `${x.pastaId}|${x.id}` === k)) return
  O.fila.push(ev)
  mudou()
  andar()
}

let andarT = 0
/** Próximo cartão, se der: nada rodando e o projeto aberto é do Organizar (ou nenhum). */
function andar() {
  clearTimeout(andarT)
  if (O.atual || !O.fila.length) return
  if (S.sync.running || S.probe.active) {
    andarT = setTimeout(andar, 2000)
    return
  }
  const p = S.project
  // a pessoa está mexendo em outro projeto: espera ela fechar (ou clicar em Organizar agora)
  O.esperando = !!(p && !p.org && !p.demo)
  if (O.esperando) {
    mudou()
    andarT = setTimeout(andar, 3000)
    return
  }
  const ev = O.fila.shift()
  processar(ev).finally(() => {
    O.atual = null
    O.etapa = ''
    mudou()
    andarT = setTimeout(andar, 300)
  })
}

/** "Organizar agora": fecha o projeto que estava aberto (ele fica salvo) e segue a fila. */
export function organizarAgora() {
  if (S.project && !S.project.org) closeProject()
  O.esperando = false
  andar()
}

const etapa = (t) => {
  O.etapa = t
  mudou()
}

// diária → projeto criado nesta sessão (dois cartões da mesma diária na fila não criam dois projetos)
const vinculos = new Map()

async function abrirProjetoDaDiaria(ev) {
  const nome = `${ev.projetoNome} · ${ev.diaria.nome}`
  const k = `${ev.pastaId}|${ev.diaria.n}`
  const pasta = O.pastas.find((x) => x.id === ev.pastaId)
  const id = vinculos.get(k) || (pasta && pasta.projetos && pasta.projetos[ev.diaria.n]) || ev.projetoId
  if (id && S.project && S.project.id === id) return S.project
  // o projeto que estava aberto fica gravado antes de trocar
  if (S.project && !S.project.demo) save(true)
  if (id && S.list.some((x) => x.id === id) && openProject(id)) {
    etapa('Religando os clipes que já estavam no projeto')
    await religarPorCaminho((c) => new PathFile({ abs: c.absPath, name: c.name, size: c.size, lastModified: c.lastModified }))
    return S.project
  }
  const p = createProject(nome)
  p.org = { pastaId: ev.pastaId, raiz: ev.raiz, diaria: ev.diaria.n, diariaNome: ev.diaria.nome, projetoNome: ev.projetoNome }
  if (ev.tipo) applyType({ type: ev.tipo })
  vinculos.set(k, p.id)
  await API.vincular(ev.pastaId, { diaria: ev.diaria.n, projetoId: p.id })
  save(true)
  return p
}

/** Download do Drive: um projeto do Synquei por operação (o mesmo op reabre o mesmo projeto). */
async function abrirProjetoDaOperacao(ev) {
  const chave = ev.modo === 'livre' ? 'livre' : `op:${ev.op}`
  const k = `${ev.pastaId}|${chave}`
  const pasta = O.pastas.find((x) => x.id === ev.pastaId)
  const id = vinculos.get(k) || (pasta && pasta.projetos && pasta.projetos[chave]) || ev.projetoId
  if (id && S.project && S.project.id === id) return S.project
  if (S.project && !S.project.demo) save(true)
  if (id && S.list.some((x) => x.id === id) && openProject(id)) {
    etapa('Religando os clipes que já estavam no projeto')
    await religarPorCaminho((c) => new PathFile({ abs: c.absPath, name: c.name, size: c.size, lastModified: c.lastModified }))
    return S.project
  }
  const p = createProject(ev.projetoNome)
  p.org = { pastaId: ev.pastaId, raiz: ev.raiz, diaria: chave, diariaNome: ev.diaria.nome, projetoNome: ev.projetoNome, op: ev.op || null }
  if (ev.tipo) applyType({ type: ev.tipo })
  vinculos.set(k, p.id)
  await API.vincular(ev.pastaId, { diaria: chave, projetoId: p.id })
  save(true)
  return p
}

/**
 * Pasta inteira como um projeto: download do Drive (com recibo para o SOBEDESCE) ou pasta livre (para antes do DaVinci
 * e espera a pessoa conferir o estudo, a não ser que `direto`).
 */
async function processarPasta(ev, { direto = false } = {}) {
  const drive = ev.modo === 'drive'
  const rotulo = ev.projetoNome
  try {
    if (drive) await API.recibo(ev.pastaId, ev.op, { estado: 'preparando' }).catch(() => {})
    etapa(`${rotulo}: abrindo o projeto`)
    const p = await abrirProjetoDaOperacao(ev)
    etapa(`${rotulo}: lendo ${ev.arquivos.length} arquivos`)
    const entries = ev.arquivos.map((a) => {
      const partes = a.rel.split('/')
      // subpasta de cima = "câmera" (Câmera A/…, Som/…); arquivo solto na pasta = a própria pasta
      const dono = partes.length > 1 ? partes[0] : ev.diaria.nome
      return {
        file: new PathFile({ abs: a.abs, name: partes.at(-1), size: a.size, lastModified: a.mtimeMs }),
        path: a.rel,
        org: { dono, camera: '', diaria: p.org.diaria, diariaNome: ev.diaria.nome, cartao: 1, cartaoNome: partes.length > 2 ? partes[1] : '', cor: ev.cor, op: ev.op || null },
      }
    })
    await addEntries(entries)
    if (p.clips.some((c) => c.status === 'ready')) {
      etapa(`${rotulo}: sincronizando`)
      await runSync()
      cenasDoSom(p)
      save(true)
    }
    etapa(`${rotulo}: entendendo o material`)
    const cls = estudar(p)
    await escreverArquivos(p, ev, cls).catch((e) => console.warn('relatório:', e))
    if (!drive && !direto) {
      O.estudos[ev.pastaId] = { projetoId: p.id, ev }
      await API.marcar(ev.pastaId, ev.id, 'pronto')
      toast(`${rotulo}: estudo pronto. Confira os momentos e mande para o editor.`, { icon: 'check', ms: 5000 })
      return
    }
    if (mandarParaDavinci()) {
      etapa(`${rotulo}: mandando para o DaVinci`)
      await D.davinci.enviar(await pedidoDavinci(p, ev, cls))
    }
    delete O.estudos[ev.pastaId]
    if (drive) {
      const r = resumoPreparo(p, ev)
      await API.recibo(ev.pastaId, ev.op, r)
      await API.marcar(ev.pastaId, ev.id, 'pronto', null, r.exemplos.revisar)
      const pend = (ev.conferencia ? ev.conferencia.ausentes.length + ev.conferencia.alterados.length : 0) + r.resultado.revisar
      toast(pend ? `${rotulo} preparado · ${plural(pend, 'pendência', 'pendências')}` : `${rotulo} preparado`, { icon: pend ? 'warn' : 'check' })
    } else {
      await API.marcar(ev.pastaId, ev.id, 'pronto')
      toast(`${rotulo} organizado`, { icon: 'check' })
    }
  } catch (e) {
    console.error(e)
    if (drive) await API.recibo(ev.pastaId, ev.op, { estado: 'erro', erro: e.message || String(e) }).catch(() => {})
    await API.marcar(ev.pastaId, ev.id, 'erro', e.message || String(e)).catch(() => {})
    toast(`${rotulo}: ${e.message || e}`, { icon: 'warn' })
  }
}

async function processar(ev) {
  O.atual = ev
  if (ev.modo === 'drive' || ev.modo === 'livre') return processarPasta(ev, { direto: !!ev.direto })
  const rotulo = `${ev.diaria.nome} · ${ev.dono.pasta || ev.dono.nome} · ${ev.cartao.nome || `Cartão ${String(ev.cartao.n).padStart(2, '0')}`}`
  try {
    etapa(`${rotulo}: abrindo o projeto da diária`)
    const p = await abrirProjetoDaDiaria(ev)
    etapa(`${rotulo}: lendo ${ev.arquivos.length} arquivos`)
    const dono = ev.dono.pasta || [ev.dono.nome, ev.dono.camera].filter(Boolean).join(' - ')
    const cartaoNome = ev.pasta.split('/').pop()
    const entries = ev.arquivos.map((a) => ({
      file: new PathFile({ abs: a.abs, name: a.rel.split('/').pop(), size: a.size, lastModified: a.mtimeMs }),
      path: a.rel,
      org: { dono, camera: ev.dono.camera || '', diaria: ev.diaria.n, diariaNome: ev.diaria.nome, cartao: ev.cartao.n, cartaoNome, cor: ev.cor, ...(ev.momento ? { momento: ev.momento } : {}) },
    }))
    await addEntries(entries)
    if (p.clips.some((c) => c.status === 'ready')) {
      etapa(`${rotulo}: sincronizando a diária`)
      await runSync()
      cenasDoSom(p)
      save(true)
    }
    etapa(`${rotulo}: entendendo a diária`)
    const cls = estudar(p)
    await escreverArquivos(p, ev, cls).catch((e) => console.warn('relatório:', e))
    if (mandarParaDavinci()) {
      etapa(`${rotulo}: mandando para o DaVinci`)
      await D.davinci.enviar(await pedidoDavinci(p, ev, cls))
    }
    await API.marcar(ev.pastaId, ev.id, 'pronto')
    toast(`${rotulo} organizado`, { icon: 'check' })
  } catch (e) {
    console.error(e)
    await API.marcar(ev.pastaId, ev.id, 'erro', e.message || String(e)).catch(() => {})
    toast(`${rotulo}: ${e.message || e}`, { icon: 'warn' })
  }
}

/** Classifica o projeto e guarda o resultado nele (a tela de Momentos e o relatório leem daqui). */
export function estudar(p) {
  const cls = classificar(p)
  p.momentos = { ...resumoMomentos(cls), eixo: cls.eixo, tipo: cls.tipo, quando: Date.now(), grupos: gruposDoEstudo(cls), opcoes: (modeloDe(cls.tipo).momentos || []).map((x) => ({ id: x.id, nome: x.nome })) }
  save(true)
  return cls
}

/** O estudo em grupos que a pessoa corrige de uma vez: momento × câmera (o áudio à parte). */
export function gruposDoEstudo(cls) {
  const out = []
  for (const mm of cls.momentos) {
    const porCam = new Map()
    for (const [id, x] of Object.entries(cls.clipes)) {
      if (x.momento !== mm.id) continue
      const k = x.audio ? 'Áudio' : x.camera
      if (!porCam.has(k)) porCam.set(k, { ids: [], broll: 0, sugeridos: 0, audio: x.audio })
      const g = porCam.get(k)
      g.ids.push(id)
      if (x.broll) g.broll++
      if (x.origem === 'horario' || x.origem === 'padrao') g.sugeridos++
    }
    for (const [camera, g] of [...porCam.entries()].sort((a, b) => Number(a[1].audio) - Number(b[1].audio) || a[0].localeCompare(b[0]))) out.push({ momento: mm.id, nome: mm.nome, pasta: mm.pasta, camera, ...g })
  }
  return out
}

/** O vídeo que ficou em cima de um áudio com Cena/Take (iXML do gravador) herda a cena e o take. */
export function cenasDoSom(p) {
  const sons = p.clips.filter((c) => c.kind === 'audio' && c.sync && c.meta && (c.meta.scene || c.meta.take))
  for (const v of p.clips) {
    if (v.kind === 'audio' || !v.sync) continue
    let melhor = null
    let mais = 0
    for (const a of sons) {
      if (a.sync.group !== v.sync.group) continue
      const ov = Math.min(v.sync.pos + (v.duration || 0), a.sync.pos + (a.duration || 0)) - Math.max(v.sync.pos, a.sync.pos)
      if (ov > mais) {
        mais = ov
        melhor = a
      }
    }
    v.cena = melhor ? { scene: melhor.meta.scene || '', take: melhor.meta.take || '' } : null
  }
}

const dirDe = (abs) => abs.slice(0, Math.max(abs.lastIndexOf('/'), abs.lastIndexOf('\\')) + 1)

const nomeDiaria = (p, ev) => (p.org && p.org.diariaNome) || ev.diaria.nome
const tipoLabel = (p) => (tipoDe(p.type) || {}).label || ''

/**
 * As linhas do tempo organizadas: uma por momento (casamento, evento…), por take (clipe), por música (EP) ou por
 * bloco; o b-roll de cada momento numa linha em fila; o que não sincronizou em "Sem sincronia (conferir)".
 * Devolve [{ tl, bin }] (bin: onde ela fica no Premiere e no DaVinci).
 */
export function linhasOrganizadas(p, cls) {
  const out = []
  if (p.result) {
    const sess = sessoesOrganizadas(p, cls)
    for (const tl of buildTimelines({ ...p, sessions: sess }, { ...p.export, includeUnsynced: false, splitSessions: true })) {
      const parte = cls.eixo === 'parte' && cls.partes.includes(tl.name.replace(/ \(\d+\)$/, ''))
      out.push({ tl, bin: cls.eixo === 'momento' ? tl.name.replace(/ \(\d+\)$/, '') : parte ? 'Takes e músicas' : 'Linhas do tempo' })
    }
  }
  // b-roll em fila (pela ordem de gravação), um por momento
  const ids = Object.keys(cls.clipes)
  const grupos = cls.eixo === 'momento' ? cls.momentos.map((mm) => ({ nome: `B-roll · ${mm.pasta}`, bin: mm.pasta, ids: ids.filter((k) => cls.clipes[k].broll && cls.clipes[k].momento === mm.id) })) : [{ nome: 'B-roll', bin: 'B-roll', ids: ids.filter((k) => cls.clipes[k].broll) }]
  // o que não sincronizou e não é b-roll
  grupos.push({ nome: 'Sem sincronia (conferir)', bin: 'Conferir', ids: ids.filter((k) => !cls.clipes[k].broll && !p.clips.find((c) => c.id === k).sync) })
  for (const g of grupos) {
    if (!g.ids.length) continue
    const sel = new Set(g.ids)
    const clips = p.clips.filter((c) => sel.has(c.id) && c.duration).sort((a, b) => (a.created || 0) - (b.created || 0)).map((c) => ({ ...c, sync: null }))
    if (!clips.length) continue
    const [tl] = buildTimelines({ ...p, clips, sessions: [] }, { ...p.export, includeUnsynced: true })
    if (!tl) continue
    tl.name = g.nome
    out.push({ tl, bin: g.bin })
  }
  return out
}

/** O pedido para o script do Resolve: todos os clipes da diária (o que já está lá só ganha cor, metadados e pasta). */
export async function pedidoDavinci(p, ev, cls = classificar(p)) {
  const diaria = nomeDiaria(p, ev)
  const devOf = (c) => p.devices.find((d) => d.id === c.deviceId)
  const lentes = camerasComLentes(cls)
  const rotuloTipo = tipoLabel(p)
  const itens = []
  for (const c of p.clips) {
    if (c.status !== 'ready' || !c.absPath) continue
    const info = cls.clipes[c.id]
    if (!info) continue
    const dev = devOf(c)
    const cartao = (c.org && c.org.cartaoNome) || ''
    const cena = info.audio ? (c.meta ? { scene: c.meta.scene, take: c.meta.take } : null) : c.cena
    const tags = tagsDoClipe(info, { diaria, cartao, tipoLabel: rotuloTipo })
    // Angle: a câmera (o multicâmera do DaVinci separa os ângulos por ele); Shot: o momento
    const meta = { 'Camera #': info.camera, Angle: info.camera, Shot: info.momentoNome, Keywords: tags.join(', ') }
    if (cartao) meta['Roll Card #'] = cartao
    if (info.lente) meta['Lens Type'] = info.lente
    if (cena && cena.scene) meta.Scene = String(cena.scene)
    if (cena && cena.take) meta.Take = String(cena.take)
    else if (info.parte) meta.Take = info.parte
    if (info.broll) meta.Comments = info.drone ? 'Drone · B-roll' : 'B-roll'
    const it = { caminho: c.absPath, pasta: pastaDoClipe(info, { diaria, cartao, eixo: cls.eixo, parte: cls.parte, lentes }), cor: corResolve(c.org && c.org.cor != null ? c.org.cor : dev ? dev.color : 0), meta }
    if (c.seq) it.seq = { padrao: `${dirDe(c.absPath)}${c.seq.prefix}%0${c.seq.digits}d.${c.seq.ext}`, ini: c.seq.first, fim: c.seq.last }
    itens.push(it)
  }
  // Assets do projeto (trilha, logos, artes), com as subpastas como estão
  for (const a of await API.assets(ev.pastaId)) itens.push({ caminho: a.abs, pasta: ['Assets', ...a.rel.split('/').slice(0, -1)] })
  // as linhas do tempo organizadas, gravadas em <projeto>/Synquei/Sequências/<diária>/
  const importar = []
  for (const { tl, bin } of linhasOrganizadas(p, cls)) {
    const nome = `${diaria} · ${tl.name}${SUFIXO}`
    const arquivo = await API.escrever(ev.pastaId, `Synquei/Sequências/${safeName(diaria)}/${safeName(nome)}.xml`, toXmeml([tl], p, { wrap: false }))
    importar.push({ nome, arquivo, pasta: [diaria, 'Linhas do tempo', ...(bin && bin !== 'Linhas do tempo' ? [bin] : [])] })
  }
  const cartao = ev.modo === 'drive' || ev.modo === 'livre' ? diaria : `${diaria} · ${ev.dono.pasta || ev.dono.nome} · ${ev.pasta.split('/').pop()}`
  const r = resumoMomentos(cls)
  return { projeto: ev.projetoNome, pastaId: ev.pastaId, diaria, cartao, cor: ev.cor, itens, resumo: { tipo: rotuloTipo, momentos: r.momentos.slice(0, 12).map((x) => ({ nome: x.pasta, clipes: x.clipes, sugestao: x.sugestao })), broll: r.broll, partes: r.partes, parte: r.parte }, linhas: { prefixo: `${diaria} · `, sufixo: SUFIXO, importar } }
}

/**
 * Relatório (HTML + JSON) e os arquivos para Premiere (XML com bins por momento) e Final Cut (FCPXML com keywords),
 * em <projeto>/Synquei/. Devolve os caminhos gravados.
 */
export async function escreverArquivos(p, ev, cls) {
  const diaria = nomeDiaria(p, ev)
  const base = safeName(diaria)
  const linhas = linhasOrganizadas(p, cls)
  const arquivos = {}
  if (linhas.length) {
    const bins = new Map(linhas.map(({ tl, bin }) => [tl.name, bin]))
    arquivos['Premiere Pro'] = await API.escrever(ev.pastaId, `Synquei/Premiere/${base}.xml`, toXmeml(linhas.map((x) => x.tl), p, { wrap: true, multicam: !!p.export.multicam, bins }))
  }
  const tags = new Map(Object.entries(cls.clipes).map(([id, info]) => {
    const c = p.clips.find((x) => x.id === id)
    return [id, tagsDoClipe(info, { diaria, cartao: (c && c.org && c.org.cartaoNome) || '', tipoLabel: tipoLabel(p) })]
  }))
  arquivos['Final Cut Pro'] = await API.escrever(ev.pastaId, `Synquei/Final Cut/${base}.fcpxml`, toFcpxml(linhas.map((x) => x.tl), p, { tags, evento: `${p.name}` }))
  const d = dadosRelatorio({ p, cls, diaria, tipoLabel: tipoLabel(p), linhas: linhas.map((x) => x.tl.name), arquivos: { ...arquivos } })
  arquivos['Relatório'] = await API.escrever(ev.pastaId, `Synquei/Relatório · ${base}.html`, relatorioHtml(d))
  await API.escrever(ev.pastaId, `Synquei/relatorio-${base}.json`, JSON.stringify({ ...d, arquivos }, null, 2))
  p.org = { ...(p.org || {}), arquivos }
  save(true)
  return arquivos
}

// ───────── ações da tela ─────────
export async function adicionarPasta() {
  try {
    const id = await API.escolher()
    if (id) toast('Pasta ligada. Cada cartão que terminar entra sozinho.', { icon: 'check' })
    O.pastas = await API.estado()
    for (const ev of id ? await API.pendentes(id) : []) enfileirar(ev)
  } catch (e) {
    toast(e.message || String(e), { icon: 'warn' })
  }
  mudou()
}

/** "Organizar uma pasta" (sem o SOBEDESCE): o tipo de vídeo, a pasta no SSD e o estudo. */
export async function organizarPastaLivre(tipo) {
  try {
    const id = await API.escolherLivre(tipo)
    if (!id) return null
    O.pastas = await API.estado()
    mudou()
    await estudarPastaLivre(id)
    return id
  } catch (e) {
    toast(e.message || String(e), { icon: 'warn' })
    return null
  }
}

/** Estuda (de novo) a pasta livre: a pasta inteira entra na fila; para antes do DaVinci, no estudo. */
export async function estudarPastaLivre(pastaId) {
  try {
    enfileirar(await API.estudar(pastaId))
  } catch (e) {
    toast(e.message || String(e), { icon: 'warn' })
  }
}

/** A pessoa conferiu o estudo: manda para o DaVinci (com o que ela corrigiu nos momentos). */
/** O estudo de uma pasta livre: o da sessão ou, depois de reabrir o app, o do projeto já vinculado. */
export function estudoDe(pastaId) {
  if (O.estudos[pastaId]) return O.estudos[pastaId]
  const pasta = O.pastas.find((x) => x.id === pastaId)
  const projetoId = pasta && pasta.projetos && pasta.projetos.livre
  if (!projetoId || !S.list.some((x) => x.id === projetoId)) return null
  const ev = { modo: 'livre', id: 'livre', pastaId, raiz: pasta.raiz, projetoNome: pasta.nome, projetoId, tipo: pasta.tipo, cor: 0, diaria: { n: 'livre', nome: pasta.nome }, dono: { nome: '', camera: '', pasta: '' }, cartao: { n: 1, nome: '' }, pasta: '' }
  return { projetoId, ev, depois: true }
}

/** O projeto (já salvo) de um estudo, sem abrir: a tela lê os momentos daqui. */
export function projetoDoEstudo(pastaId) {
  const e = estudoDe(pastaId)
  if (!e) return null
  if (S.project && S.project.id === e.projetoId) return S.project
  return lerProjeto(e.projetoId)
}

async function abrirEstudo(e) {
  if (S.project && S.project.id === e.projetoId) return S.project
  if (S.project && !S.project.demo) save(true)
  if (!openProject(e.projetoId)) return null
  await religarPorCaminho((c) => new PathFile({ abs: c.absPath, name: c.name, size: c.size, lastModified: c.lastModified }))
  return S.project
}

export async function mandarEstudo(pastaId) {
  const e = estudoDe(pastaId)
  if (!e) return
  const p = await abrirEstudo(e)
  if (!p) return toast('O projeto deste estudo não abre mais.', { icon: 'warn' })
  const cls = estudar(p)
  try {
    await escreverArquivos(p, e.ev, cls)
    if (mandarParaDavinci()) {
      await D.davinci.enviar(await pedidoDavinci(p, e.ev, cls))
      toast('Mandado para o DaVinci. Os arquivos de Premiere e Final Cut estão na pasta Synquei.', { icon: 'check', ms: 5000 })
    } else toast('Relatório e arquivos de Premiere e Final Cut prontos na pasta Synquei.', { icon: 'check', ms: 5000 })
    delete O.estudos[pastaId]
    O.enviados[pastaId] = Date.now()
  } catch (err) {
    toast(err.message || String(err), { icon: 'warn' })
  }
  mudou()
}

/** Corrige o momento de um grupo de clipes (fica gravado no projeto e vale para o próximo envio). */
export async function corrigirNoEstudo(pastaId, ids, momento) {
  const e = estudoDe(pastaId)
  const p = e && (await abrirEstudo(e))
  if (!p) return
  corrigirMomento(p, ids, momento)
}

/** Troca o tipo de vídeo do estudo e estuda de novo (a sincronia e os momentos mudam com o tipo). */
export async function trocarTipoDoEstudo(pastaId, { type, multicam }) {
  const e = estudoDe(pastaId)
  const p = e && (await abrirEstudo(e))
  if (!p) return
  applyType({ type, multicam })
  save(true)
  await API.tipo(pastaId, type).catch(() => {})
  O.pastas = await API.estado()
  await estudarPastaLivre(pastaId)
}

/** Abre um dos arquivos que o Synquei gravou na pasta Synquei/ do projeto (relatório, Premiere, Final Cut). */
export function mostrarArquivo(pastaId, caminho) {
  return API.mostrar(pastaId, caminho)
}

export function corrigirMomento(p, ids, momento) {
  p.momentosManual = { ...(p.momentosManual || {}) }
  for (const id of ids) {
    if (momento) p.momentosManual[id] = momento
    else delete p.momentosManual[id]
  }
  estudar(p)
  mudou()
}

export async function reorganizarTudo(pastaId) {
  for (const ev of await API.todos(pastaId)) enfileirar(ev)
}

export const api = API
