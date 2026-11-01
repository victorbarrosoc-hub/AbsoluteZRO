// A separação de faixas da NOSSOM, chamada daqui (app irmão, products/nossom/lib/server/irmaos.ts). O navegador da
// pessoa fala direto com quasar.absolutezro.com levando a sessão dela na NOSSOM (mesmo site, cookie SameSite=Lax); a
// NOSSOM confere tudo do lado dela (sessão, portão de lançamento, franquia, um pedido por conta) e só aceita separar
// faixas (stems-v1). O caminho é o mesmo do estúdio da NOSSOM (lib/cloud-audio.ts): preparar, enviar em partes direto
// para o armazenamento privado dela, confirmar, acompanhar, receber as cinco faixas, conferir e liberar a cópia de lá.
// Nada sobe sem a pessoa pedir: o Inspector pergunta antes, com os minutos que o pedido usa.

import { PRESET_NOSSOM, partesDoPacote, relatorioValido, STEMS } from '../src/faixas.js'

export const NOSSOM = 'https://quasar.absolutezro.com'
const ESPERA_MS = 2500
const PRAZO_MS = 35 * 60_000

export class Cancelado extends Error {
  constructor(m = 'Separação cancelada. O som original segue no clipe.') {
    super(m)
    this.name = 'AbortError'
  }
}

async function json(caminho, { metodo = 'GET', corpo, sinal } = {}) {
  let r
  try {
    r = await fetch(NOSSOM + caminho, {
      method: metodo,
      credentials: 'include',
      cache: 'no-store',
      signal: sinal,
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
  } catch (e) {
    if (e?.name === 'AbortError') throw new Cancelado()
    throw Object.assign(new Error('O Quasar não respondeu. Confira a internet e tente de novo.'), { estado: 'fora' })
  }
  const dados = await r.json().catch(() => ({}))
  if (r.status === 401) throw Object.assign(new Error('Entre no Quasar com a sua conta Absolute ZRO.'), { estado: 'entrar' })
  if (r.status === 403 && dados.code === 'product_closed') throw Object.assign(new Error('O Quasar ainda não abriu para a sua conta.'), { estado: 'fechada' })
  if (!r.ok) throw Object.assign(new Error(dados.error || 'O Quasar não conseguiu agora. Tente de novo em instantes.'), { estado: 'erro', status: r.status })
  return dados
}

/**
 * Como está a pessoa na NOSSOM: { estado: 'ok', restante (s) | null (sem limite), plano } ou { estado: 'entrar' |
 * 'fechada' | 'fora' | 'erro', erro }.
 */
export async function conta() {
  try {
    const u = await json('/api/usage')
    if (!u.allowed) return { estado: 'sem-franquia', plano: u.planName || null, renova: u.resetAt || null }
    return { estado: 'ok', restante: u.unlimited ? null : (u.remainingSeconds ?? null), plano: u.planName || null }
  } catch (e) {
    return { estado: e.estado || 'erro', erro: e.message }
  }
}

/** O pedido em andamento desta conta na NOSSOM (um por vez), ou null. */
export async function pendente() {
  const r = await json('/api/audio/jobs')
  return r.pending || null
}

const dormir = (ms, sinal) =>
  new Promise((ok, erro) => {
    const t = setTimeout(ok, ms)
    sinal?.addEventListener('abort', () => (clearTimeout(t), erro(new Cancelado())), { once: true })
  })

/**
 * Separa um áudio (Blob WAV/FLAC de até 100 MB e 10 min) em cinco faixas. aoEstado(texto), aoProgresso(0–1 ou -1 quando
 * a NOSSOM não diz quanto falta), aoPedido(id) logo que o pedido existe (para retomar). retomar: id de um pedido desta
 * conta que ficou no meio. { id, faixas: [Blob × 5] na ordem de STEMS, ganhoDb }
 */
export async function separar(audio, duracao, { sinal, aoEstado = () => {}, aoProgresso = () => {}, aoPedido = () => {}, retomar = null } = {}) {
  let id = retomar
  try {
    // retomar um pedido que parou no meio do envio não tem como terminar: cancela e começa de novo
    if (id) {
      const st = await json(`/api/audio/jobs?id=${encodeURIComponent(id)}`, { sinal }).catch(() => null)
      if (!st || ['uploading', 'failed', 'cancelled', 'released'].includes(st.status)) {
        if (st?.status === 'uploading') await json('/api/audio/jobs', { metodo: 'POST', corpo: { action: 'cancel', id } }).catch(() => {})
        id = null
      }
    }
    if (!id) {
      aoEstado('Preparando o envio privado…')
      const plano = await json('/api/audio/jobs', { metodo: 'POST', corpo: { action: 'prepare', bytes: audio.size, duration: duracao }, sinal })
      id = plano.id
      aoPedido(id)
      for (let i = 0; i < plano.uploadUrls.length; i++) {
        aoEstado(plano.uploadUrls.length > 1 ? `Enviando o som · ${i + 1}/${plano.uploadUrls.length}` : 'Enviando o som')
        let r
        try {
          r = await fetch(plano.uploadUrls[i], { method: 'PUT', signal: sinal, headers: { 'Content-Type': 'application/octet-stream' }, body: audio.slice(i * plano.partBytes, (i + 1) * plano.partBytes) })
        } catch (e) {
          if (e?.name === 'AbortError') throw new Cancelado()
          throw new Error('O envio do som falhou. O original segue no clipe.')
        }
        if (!r.ok) throw new Error('O envio do som falhou. O original segue no clipe.')
        aoProgresso((i + 1) / plano.uploadUrls.length)
      }
      aoEstado('Confirmando o pedido…')
      aoProgresso(-1)
      await json('/api/audio/jobs', { metodo: 'POST', corpo: { action: 'submit', id, preset: PRESET_NOSSOM }, sinal })
    }
    // a NOSSOM diz a etapa (fila, separando), não a porcentagem: a barra fica andando, sem número inventado
    const desde = Date.now()
    let st
    while (Date.now() - desde < PRAZO_MS) {
      st = await json(`/api/audio/jobs?id=${encodeURIComponent(id)}`, { sinal })
      if (st.status === 'completed') break
      if (['failed', 'cancelled', 'released'].includes(st.status)) throw new Error('O Quasar não conseguiu separar este trecho. O original segue no clipe.')
      const s = Math.floor((Date.now() - desde) / 1000)
      aoEstado(st.status === 'running' ? 'Separando voz e instrumental…' : `Na fila do Quasar${s >= 60 ? ` há ${Math.floor(s / 60)} min` : ''}`)
      aoProgresso(-1)
      await dormir(ESPERA_MS, sinal)
    }
    if (st?.status !== 'completed' || !relatorioValido(st.report) || !Array.isArray(st.downloadUrls)) throw new Error('A separação demorou demais. Tente de novo mais tarde.')
    aoEstado('Recebendo as faixas…')
    const partes = []
    let recebido = 0
    for (const [i, url] of st.downloadUrls.entries()) {
      const r = await fetch(url, { signal: sinal, cache: 'no-store' })
      if (!r.ok) throw new Error('Não deu para receber as faixas.')
      const b = await r.blob()
      if (b.size !== st.report.chunks[i]?.bytes) throw new Error('As faixas chegaram incompletas.')
      partes.push(b)
      recebido += b.size
      aoProgresso(recebido / st.report.totalBytes)
    }
    const pacote = new Blob(partes)
    const faixas = []
    for (const p of partesDoPacote(st.report)) {
      const f = new Blob([pacote.slice(p.ini, p.fim)], { type: 'audio/flac' })
      if (new TextDecoder().decode(await f.slice(0, 4).arrayBuffer()) !== 'fLaC') throw new Error('Uma das faixas chegou estragada.')
      faixas.push(f)
    }
    if (faixas.length !== STEMS.length) throw new Error('Faltou faixa no que voltou.')
    return { id, faixas, ganhoDb: st.report.gainDb }
  } catch (e) {
    if (sinal?.aborted && id) {
      // cancelar: avisa a NOSSOM (sem repetir sozinho se ela não confirmar)
      await json('/api/audio/jobs', { metodo: 'POST', corpo: { action: 'cancel', id } }).catch(() => {})
      throw new Cancelado()
    }
    throw e
  }
}

/** Depois de guardar as faixas aqui: a NOSSOM apaga a cópia privada dela. */
export const liberar = (id) => json('/api/audio/jobs', { metodo: 'POST', corpo: { action: 'release', id } })
