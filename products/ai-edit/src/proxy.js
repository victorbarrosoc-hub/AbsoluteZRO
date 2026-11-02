// RAW de câmera (BRAW, R3D, ARRIRAW, Cinema RAW Light, N-RAW) não abre no navegador: nenhum decodificador do sistema
// lê esses formatos (o BRAW só com o SDK da Blackmagic, nativo). O AEON edita pelo proxy, o arquivo leve que a câmera
// grava junto (ou que o SOBEDESCE e o DaVinci geram) com o mesmo nome-base, na mesma pasta ou numa subpasta Proxy, e a
// mídia do projeto continua com o nome do original: os exportadores (XML, FCPXML, OTIO, EDL) apontam para o RAW.
// Puro: só nomes e caminhos relativos.

export const RAW = ['.braw', '.r3d', '.ari', '.arx', '.crm', '.nev']
export const EXT_PROXY = ['.mp4', '.mov', '.m4v']
/** Para o accept do seletor de arquivos. */
export const ACCEPT_RAW = RAW.join(',')

const ext = (nome) => {
  const m = /\.[^./\\]+$/.exec(String(nome || ''))
  return m ? m[0].toLowerCase() : ''
}
/** Arquivo de controle do Mac (AppleDouble "._A001_C001.braw"): não é mídia. */
export const ehControle = (nome) => String(nome || '').startsWith('._')
export const ehRaw = (nome) => !ehControle(nome) && RAW.includes(ext(nome))
export const ehProxy = (nome) => !ehControle(nome) && EXT_PROXY.includes(ext(nome))
/** Nome-base para parear: sem extensão, sem sufixo "_Proxy"/" Proxy", sem diferença de caixa. */
export const baseDe = (nome) =>
  String(nome || '')
    .replace(/\.[^./\\]+$/, '')
    .replace(/[ _-]proxy$/i, '')
    .toLowerCase()

/** Proxy numa subpasta Proxy/Proxies vale mais (é o que a câmera grava); depois .mp4 antes de .mov. */
function nota(e) {
  const pasta = /(^|\/)prox(y|ies)\//i.test(e.relativo || '') ? 0 : 1
  return pasta * 10 + EXT_PROXY.indexOf(ext(e.nome))
}

/**
 * Pareia o que a pessoa escolheu. entradas: [{ nome, relativo? }] (relativo = webkitRelativePath, quando veio de uma
 * pasta). Devolve { pares: [{ original, proxy }], semProxy: [raw], outras: [entrada] } na ordem em que vieram. Um
 * proxy que encontrou o seu RAW não entra de novo como mídia solta; arquivos de controle do Mac somem.
 */
export function parear(entradas) {
  const lista = (entradas || []).filter((e) => e && !ehControle(e.nome))
  const raws = lista.filter((e) => ehRaw(e.nome))
  const proxies = new Map()
  for (const e of lista) {
    if (!ehProxy(e.nome)) continue
    const b = baseDe(e.nome)
    const atual = proxies.get(b)
    if (!atual || nota(e) < nota(atual)) proxies.set(b, e)
  }
  const usados = new Set()
  const pares = []
  const semProxy = []
  for (const r of raws) {
    const p = proxies.get(baseDe(r.nome))
    if (p) {
      pares.push({ original: r, proxy: p })
      usados.add(p)
    } else semProxy.push(r)
  }
  // proxy da subpasta Proxy sem o RAW junto também é mídia: só sai da lista o que pareou
  const outras = lista.filter((e) => !ehRaw(e.nome) && !usados.has(e))
  return { pares, semProxy, outras }
}

/**
 * Da pasta inteira (cartão), só o que importa: os proxies dos RAW pedidos. faltam: [raw]; arquivos: [{ nome, relativo }].
 * Devolve { pares, faltam } (faltam = os RAW que seguem sem proxy).
 */
export function proxiesNaPasta(faltam, arquivos) {
  const nomes = new Set((faltam || []).map((r) => baseDe(r.nome)))
  const candidatos = (arquivos || []).filter((e) => ehProxy(e.nome) && nomes.has(baseDe(e.nome)))
  const { pares, semProxy } = parear([...(faltam || []), ...candidatos])
  return { pares, faltam: semProxy }
}
