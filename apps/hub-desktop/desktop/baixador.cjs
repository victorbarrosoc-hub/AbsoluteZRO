// Download rápido dos instaladores (ADR 0043, 06/11/2026): no Brasil, o servidor de arquivos do GitHub chegava a 5–64
// KB/s numa internet de 210 Mbps (a rota do GitHub até o provedor, não a internet da pessoa). Daqui saem os dois
// remédios do lado da central:
//
// - Vários endereços, em ordem (`baixarComReserva`): o espelho em São Paulo primeiro (/baixar/…?origem=espelho, o HUB
//   só manda para lá quando o arquivo está no espelho), o GitHub de reserva. Arquivo que não confere com o SHA-256 do
//   catálogo também passa para o próximo endereço. Nada é instalado sem conferir.
// - Num endereço (`baixarDe`): se o servidor aceita Range e o tamanho é conhecido, pedaços de 8 MB em até 6 conexões,
//   escritos direto na posição certa do arquivo. Pedaço que cai ou para de andar (30 s) volta de onde parou; link
//   assinado que venceu no meio (o do GitHub dura minutos) é renovado pelo endereço original. Sem Range: uma conexão,
//   como antes.
//
// Sem Electron aqui: `abrir` (primeiro salto, com cada redirecionamento conferido: download.cjs) e `direto` (os pedaços,
// no endereço final, IPv4 primeiro) entram por parâmetro; os testes usam servidores falsos.

const { createHash } = require('node:crypto')

const CONEXOES = 6
const PEDACO = 8 * 1024 * 1024
const PARADO_MS = 30_000
const TENTATIVAS = 5

/** Erro com marca: `conferencia` (o arquivo não é o esperado), `recusado` (endereço fora da regra), `cancelado`. */
const erro = (mensagem, marca = {}) => Object.assign(new Error(mensagem), marca)
const cancelado = () => erro('Download cancelado.', { cancelado: true })

/** [0, total) em pedaços de `tamanho` bytes: [{ ini, fim }] com `fim` incluído (como no cabeçalho Range). */
function dividir(total, tamanho = PEDACO) {
  const out = []
  if (!(total > 0) || !(tamanho > 0)) return out
  for (let ini = 0; ini < total; ini += tamanho) out.push({ ini, fim: Math.min(total, ini + tamanho) - 1 })
  return out
}

/** "bytes 0-0/1234" → { ini: 0, fim: 0, total: 1234 } (total null com "*"); null se não for um Content-Range válido. */
function lerContentRange(valor) {
  const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(String(valor || '').trim())
  if (!m) return null
  const ini = Number(m[1])
  const fim = Number(m[2])
  const total = m[3] === '*' ? null : Number(m[3])
  if (fim < ini || (total != null && fim >= total)) return null
  return { ini, fim, total }
}

const esperar = (ms, signal) =>
  new Promise((ok, falha) => {
    if (signal && signal.aborted) return falha(cancelado())
    const t = setTimeout(ok, ms)
    if (signal)
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t)
          falha(cancelado())
        },
        { once: true },
      )
  })

/** SHA-256 de um arquivo do disco. */
function hashDoArquivo(fs, arquivo) {
  return new Promise((ok, falha) => {
    const h = createHash('sha256')
    fs.createReadStream(arquivo)
      .on('data', (d) => h.update(d))
      .on('end', () => ok(h.digest('hex')))
      .on('error', falha)
  })
}

/** Sinal que dispara com o de fora ou com `abortar()` (cada pedaço tem o seu, para o relógio de "parado"). */
function sinalFilho(pai) {
  const ac = new globalThis.AbortController()
  const repassar = () => ac.abort(pai.reason)
  if (pai) {
    if (pai.aborted) ac.abort(pai.reason)
    else pai.addEventListener('abort', repassar, { once: true })
  }
  return { signal: ac.signal, abortar: (motivo) => ac.abort(motivo), soltar: () => pai && pai.removeEventListener('abort', repassar) }
}

const cancelar = (r) => {
  try {
    const p = r && r.body && r.body.cancel && r.body.cancel()
    if (p && p.catch) p.catch(() => {})
  } catch {
    // já fechou
  }
}

/** Uma conexão só (servidor sem Range): grava em ordem e calcula o SHA-256 no caminho. */
async function emSequencia(r, fh, { tamanho, maxBytes, aoProgresso, paradoMs, signal }) {
  const total = Number(r.headers.get('content-length')) || tamanho || 0
  if (tamanho && total && total !== tamanho) {
    cancelar(r)
    throw erro('O arquivo baixado não confere com o original.', { conferencia: true })
  }
  if (maxBytes && total > maxBytes) {
    cancelar(r)
    throw erro('O instalador é grande demais.', { conferencia: true })
  }
  const hash = createHash('sha256')
  const leitor = r.body.getReader()
  let recebido = 0
  let parou = false
  let relogio = null
  const cutucar = () => {
    clearTimeout(relogio)
    relogio = setTimeout(() => {
      parou = true
      leitor.cancel().catch(() => {})
    }, paradoMs)
  }
  const aoCancelar = () => leitor.cancel().catch(() => {})
  if (signal) signal.addEventListener('abort', aoCancelar, { once: true })
  try {
    cutucar()
    if (aoProgresso) aoProgresso(0, total)
    for (;;) {
      const { done, value } = await leitor.read()
      if (signal && signal.aborted) throw cancelado()
      if (parou) throw erro('O download parou de andar.')
      if (done) break
      recebido += value.length
      // maior que o catálogo diz: não confere de jeito nenhum (e não enche o disco)
      if ((tamanho && recebido > tamanho) || (maxBytes && recebido > maxBytes)) {
        await leitor.cancel().catch(() => {})
        throw erro('O arquivo baixado não confere com o original.', { conferencia: true })
      }
      hash.update(value)
      await fh.write(value)
      cutucar()
      if (aoProgresso) aoProgresso(recebido, total)
    }
  } finally {
    clearTimeout(relogio)
    if (signal) signal.removeEventListener('abort', aoCancelar)
  }
  if (total && recebido !== total) throw erro('O download veio incompleto.')
  return { sha256: hash.digest('hex'), tamanho: recebido }
}

/**
 * Baixa `url` para `arquivo`. Devolve { sha256, tamanho, url (endereço final), paralelo }.
 * o: { abrir(url, { headers, signal }), direto?(url, { headers, signal }), fs, tamanho?, maxBytes?, signal?,
 *      aoProgresso?(recebido, total), permitirHttp?, conexoes?, pedaco?, paradoMs?, tentativas?, espera? }
 * `abrir` e `direto` devolvem { ok, status, url, headers.get, body (Web stream) }, como um fetch.
 */
async function baixarDe(url, arquivo, o) {
  const { abrir, fs, signal } = o
  const direto = o.direto || null
  const conexoes = Math.max(1, o.conexoes || CONEXOES)
  const paradoMs = o.paradoMs || PARADO_MS
  const tentativas = Math.max(1, o.tentativas || TENTATIVAS)
  const espera = o.espera ?? 500
  if (signal && signal.aborted) throw cancelado()

  const conferirEndereco = (u) => {
    if (u && !/^https:\/\//.test(u) && !o.permitirHttp) throw erro('Endereço de download recusado.', { recusado: true })
  }

  // primeiro salto: um byte só, para saber se o servidor aceita Range, o tamanho e o endereço final
  const r = await abrir(url, { headers: { range: 'bytes=0-0' }, signal })
  conferirEndereco(r.url)
  const faixa = r.status === 206 ? lerContentRange(r.headers.get('content-range')) : null
  const fh = await fs.promises.open(arquivo, 'w')
  let fechado = false
  const fechar = async () => {
    if (fechado) return
    fechado = true
    await fh.close().catch(() => {})
  }
  try {
    if (!faixa || faixa.ini !== 0 || faixa.total == null) {
      if (!r.ok || !r.body || r.status === 206) {
        cancelar(r)
        throw erro(`O site respondeu ${r.status}.`)
      }
      const s = await emSequencia(r, fh, { ...o, paradoMs })
      await fechar()
      return { ...s, url: r.url || url, paralelo: false }
    }
    cancelar(r)
    const total = faixa.total
    if ((o.tamanho && total !== o.tamanho) || (o.maxBytes && total > o.maxBytes))
      throw erro('O arquivo baixado não confere com o original.', { conferencia: true })

    let final = r.url || url
    let renovando = null
    // link assinado vencido (GitHub): pergunta ao endereço original de novo, uma vez para todos os pedaços
    const renovar = () =>
      (renovando ||= (async () => {
        try {
          const n = await abrir(url, { headers: { range: 'bytes=0-0' }, signal })
          cancelar(n)
          const f = n.status === 206 ? lerContentRange(n.headers.get('content-range')) : null
          if (f && f.total === total && n.url) {
            conferirEndereco(n.url)
            final = n.url
          }
        } finally {
          renovando = null
        }
      })())

    const pedacos = dividir(total, o.pedaco || PEDACO).map((p) => ({ ...p, feito: 0 }))
    let recebido = 0
    let ultimoAviso = -1
    const avisar = () => {
      if (!o.aoProgresso || recebido === ultimoAviso) return
      ultimoAviso = recebido
      o.aoProgresso(recebido, total)
    }
    if (o.aoProgresso) o.aoProgresso(0, total)

    const geral = sinalFilho(signal)
    const fila = [...pedacos]
    // o caminho direto (https do Node) não passa pelo proxy do sistema: se ele nunca deu certo e já falhou 3 vezes,
    // os pedaços seguem pelo caminho do primeiro salto (o do Chromium)
    let diretoOk = 0
    let diretoErros = 0

    const umaVez = async (p, tentativa) => {
      const ini = p.ini + p.feito
      const tamanhoPedaco = p.fim - p.ini + 1
      const filho = sinalFilho(geral.signal)
      let parou = false
      let relogio = null
      const cutucar = () => {
        clearTimeout(relogio)
        relogio = setTimeout(() => {
          parou = true
          filho.abortar(erro('O download parou de andar.'))
        }, paradoMs)
      }
      // as primeiras tentativas vão direto ao endereço final (IPv4); depois, pelo caminho do primeiro salto
      const usarDireto = direto && tentativa < Math.ceil(tentativas / 2) && !(diretoErros >= 3 && diretoOk === 0)
      try {
        cutucar()
        const resp = await (usarDireto ? direto : abrir)(final, { headers: { range: `bytes=${ini}-${p.fim}` }, signal: filho.signal })
        conferirEndereco(resp.url)
        if ([401, 403, 404, 410].includes(resp.status)) {
          cancelar(resp)
          await renovar().catch(() => {})
          throw erro(`O site respondeu ${resp.status}.`)
        }
        const cr = resp.status === 206 ? lerContentRange(resp.headers.get('content-range')) : null
        if (!cr || cr.ini !== ini || cr.fim !== p.fim || (cr.total != null && cr.total !== total)) {
          cancelar(resp)
          throw erro(`O site respondeu ${resp.status} sem o pedaço pedido.`)
        }
        const leitor = resp.body.getReader()
        for (;;) {
          const { done, value } = await leitor.read()
          if (done) break
          if (p.feito + value.length > tamanhoPedaco) {
            await leitor.cancel().catch(() => {})
            throw erro('O arquivo baixado não confere com o original.', { conferencia: true })
          }
          await fh.write(value, 0, value.length, p.ini + p.feito)
          p.feito += value.length
          recebido += value.length
          avisar()
          cutucar()
        }
        if (p.feito !== tamanhoPedaco) throw erro('O download veio incompleto.')
        if (usarDireto) diretoOk++
      } catch (e) {
        if (usarDireto) diretoErros++
        if (signal && signal.aborted) throw cancelado()
        if (geral.signal.aborted && !parou) throw geral.signal.reason || cancelado()
        throw parou ? erro('O download parou de andar.') : e
      } finally {
        clearTimeout(relogio)
        filho.soltar()
      }
    }

    const comTentativas = async (p) => {
      for (let t = 0; ; t++) {
        try {
          return await umaVez(p, t)
        } catch (e) {
          if (e.cancelado || e.conferencia || e.recusado || t + 1 >= tentativas) throw e
          await esperar(espera * 2 ** Math.min(t, 4), geral.signal)
        }
      }
    }

    let falhou = null
    const trabalhador = async () => {
      while (!falhou && fila.length) {
        const p = fila.shift()
        try {
          await comTentativas(p)
        } catch (e) {
          if (!falhou) {
            falhou = e
            geral.abortar(e)
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(conexoes, pedacos.length) }, trabalhador))
    geral.soltar()
    if (signal && signal.aborted) throw cancelado()
    if (falhou) throw falhou
    await fechar()
    return { sha256: await hashDoArquivo(fs, arquivo), tamanho: total, url: final, paralelo: true }
  } finally {
    await fechar()
  }
}

/**
 * Tenta cada endereço em ordem. Com `sha256`, o primeiro que bater vale ({ confere: true }); arquivo que não bate passa
 * para o próximo endereço. Se só o último deu arquivo e não bateu, devolve { confere: false, sha256 } com ele no disco
 * (o atualizador ainda pergunta ao site se saiu um build mais novo). Erro de rede em todos: o último erro.
 */
async function baixarComReserva(urls, arquivo, o) {
  const lista = (Array.isArray(urls) ? urls : [urls]).filter(Boolean)
  let ultimo = null
  for (let i = 0; i < lista.length; i++) {
    if (o.signal && o.signal.aborted) throw cancelado()
    const ultimoEndereco = i === lista.length - 1
    try {
      const r = await baixarDe(lista[i], arquivo, o)
      const confere = !o.sha256 || r.sha256 === String(o.sha256).toLowerCase()
      if (confere || ultimoEndereco) return { ...r, confere }
      if (o.log) o.log('[download] o arquivo não conferiu; tentando o próximo endereço')
      ultimo = erro('O arquivo baixado não confere com o original.', { conferencia: true })
    } catch (e) {
      if (e && e.cancelado) throw e
      if (o.signal && o.signal.aborted) throw cancelado()
      if (o.log) o.log('[download] endereço falhou:', e && e.message)
      ultimo = e
    }
    await o.fs.promises.rm(arquivo, { force: true }).catch(() => {})
  }
  throw ultimo || erro('Sem endereço para baixar.')
}

/** O endereço do HUB com ?origem=<valor> (troca o que já houver). */
function comOrigem(url, origem) {
  try {
    const u = new URL(url)
    u.searchParams.set('origem', origem)
    return u.href
  } catch {
    return url
  }
}

module.exports = { baixarDe, baixarComReserva, dividir, lerContentRange, comOrigem, hashDoArquivo, CONEXOES, PEDACO }
