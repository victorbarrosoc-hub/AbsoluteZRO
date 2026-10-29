// "Abrir do SOBEDESCE": lê a pasta de um projeto do SOBEDESCE e lista os cartões que terminaram e foram conferidos,
// com os vídeos e áudios de cada um, para entrarem direto no editor (vídeo de uma câmera não precisa do Synquei).
// O mesmo formato que o Organizar do Synquei lê (products/synquei/desktop/organizador.cjs):
//  1. <projeto>/.sobedesce/descargas.jsonl: uma linha por cartão (diária, dono, câmera, pasta e arquivos);
//  2. sem ele (SOBEDESCE antigo ou pasta copiada à mão): Diária NN/Cenas/<Dono>/Cartão NN com o relatório
//     SOBEDESCE_copia_*.xxh64, que só aparece quando o cartão terminou e foi conferido.
// Só leitura: nada é movido, renomeado ou criado na pasta do projeto. Nada aqui importa o Electron.

const fsp = require('node:fs/promises')
const fs = require('node:fs')
const path = require('node:path')

const RESUMO = path.join('.sobedesce', 'descargas.jsonl')
const IGNORAR = /(^|\/)(\.sobedesce-anteriores|\.sobedesce|\.Spotlight-V100|\.Trashes|\.fseventsd)(\/|$)|\.sobedesce-parcial$|(^|\/)\._|(^|\/)\.DS_Store$|(^|\/)SOBEDESCE_copia_[^/]*\.xxh64$/
const MIDIA = /\.(mp4|m4v|mov|mxf|mkv|webm|avi|mts|m2ts|wav|mp3|m4a|aac|aif|aiff|flac)$/i
const SO_AUDIO = /\.(wav|mp3|m4a|aac|aif|aiff|flac)$/i

const dentro = (pai, filho) => {
  const r = path.relative(pai, filho)
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r))
}

async function listar(dir) {
  try {
    return await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

async function arquivosDe(raiz, rel = '') {
  const out = []
  for (const e of await listar(path.join(raiz, rel))) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (IGNORAR.test(r)) continue
    if (e.isDirectory()) out.push(...(await arquivosDe(raiz, r)))
    else if (e.isFile()) out.push(r)
  }
  return out
}

const numeroDiaria = (nome) => {
  const m = /^Di[aá]ria\s*(\d+)/i.exec(nome || '')
  return m ? Number(m[1]) : null
}
const numeroCartao = (nome) => {
  const m = /^Cart[aã]o\s*(\d+)/i.exec(nome || '')
  return m ? Number(m[1]) : null
}

/** "Aladim - FX30" → { nome: 'Aladim', camera: 'FX30' } */
function donoDaPasta(pasta) {
  const i = pasta.lastIndexOf(' - ')
  return i > 0 ? { nome: pasta.slice(0, i), camera: pasta.slice(i + 3) } : { nome: pasta, camera: '' }
}

/** Arquivos de mídia de um cartão: [{ nome, abs, rel, tamanho, audio }] (rel a partir da raiz do projeto). */
async function midiasDe(raiz, pastaCartao, rels) {
  const out = []
  for (const rel of rels) {
    if (IGNORAR.test(rel) || !MIDIA.test(rel)) continue
    const abs = path.join(raiz, ...pastaCartao.split('/'), ...rel.split('/'))
    if (!dentro(raiz, abs)) continue
    try {
      const st = await fsp.stat(abs)
      if (st.isFile() && st.size > 0) out.push({ nome: path.basename(abs), abs, rel: `${pastaCartao}/${rel}`, tamanho: st.size, audio: SO_AUDIO.test(rel) })
    } catch {}
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel, 'pt-BR', { numeric: true }))
}

async function doResumo(raiz) {
  const texto = await fsp.readFile(path.join(raiz, RESUMO), 'utf8')
  const vistos = new Map()
  for (const l of texto.split('\n')) {
    if (!l.trim()) continue
    let d
    try {
      d = JSON.parse(l)
    } catch {
      continue
    }
    if (!d || d.v !== 1 || !d.cartao || typeof d.cartao.pasta !== 'string' || d.resultado === 'cancelado') continue
    const partes = d.cartao.pasta.split('/')
    const rels = (Array.isArray(d.arquivos) ? d.arquivos : []).map((a) => a && a.rel).filter((r) => typeof r === 'string')
    // a segunda leva do mesmo cartão substitui a primeira (o SOBEDESCE grava outra linha)
    vistos.set(d.cartao.pasta, {
      id: String(d.id || `${d.cartao.pasta}|${d.quando}`),
      quando: d.quando || null,
      diaria: { n: Number(d.diaria && d.diaria.n) || numeroDiaria(partes[0]) || 1, nome: (d.diaria && d.diaria.nome) || partes[0] },
      dono: { nome: (d.dono && d.dono.nome) || donoDaPasta(partes[2] || '').nome, camera: (d.dono && d.dono.camera) || donoDaPasta(partes[2] || '').camera },
      cartao: { n: Number(d.cartao.n) || numeroCartao(partes.at(-1)) || 1, nome: d.cartao.nome || partes.at(-1) },
      pasta: d.cartao.pasta,
      // o SOBEDESCE grava ok, falta (arquivo faltando ou alerta), erro ou cancelado (este nem entra)
      conferido: (d.resultado || 'ok') === 'ok',
      resultado: d.resultado || 'ok',
      rels,
    })
  }
  return [...vistos.values()]
}

async function dasPastas(raiz) {
  const out = []
  for (const d of await listar(raiz)) {
    const nd = d.isDirectory() ? numeroDiaria(d.name) : null
    if (nd == null) continue
    const cenas = path.join(raiz, d.name, 'Cenas')
    for (const o of await listar(cenas)) {
      if (!o.isDirectory()) continue
      for (const c of await listar(path.join(cenas, o.name))) {
        if (!c.isDirectory() || numeroCartao(c.name) == null) continue
        const dir = path.join(cenas, o.name, c.name)
        const relatorios = (await listar(dir)).filter((e) => e.isFile() && /^SOBEDESCE_copia_.*\.xxh64$/.test(e.name)).map((e) => e.name).sort()
        // sem relatório o cartão ainda está passando (ou não foi conferido): não entra
        if (!relatorios.length) continue
        let quando = null
        try {
          quando = (await fsp.stat(path.join(dir, relatorios.at(-1)))).mtime.toISOString()
        } catch {}
        const pasta = [d.name, 'Cenas', o.name, c.name].join('/')
        out.push({ id: `${pasta}|${relatorios.at(-1)}`, quando, diaria: { n: nd, nome: d.name }, dono: donoDaPasta(o.name), cartao: { n: numeroCartao(c.name), nome: c.name }, pasta, conferido: true, resultado: 'ok', rels: await arquivosDe(dir) })
      }
    }
  }
  return out
}

/**
 * Projeto do SOBEDESCE → { raiz, nome, origem, cartoes: [{ id, diaria, dono, cartao, pasta, conferido, midias }] }.
 * Cartões sem mídia ficam de fora. Ordem: diária, dono, cartão.
 */
async function lerProjeto(raiz) {
  raiz = path.resolve(String(raiz || ''))
  let st
  try {
    st = await fsp.stat(raiz)
  } catch {
    throw new Error('Essa pasta não existe ou não abre.')
  }
  if (!st.isDirectory()) throw new Error('Escolha a pasta do projeto, não um arquivo.')
  const temResumo = fs.existsSync(path.join(raiz, RESUMO))
  const brutos = temResumo ? await doResumo(raiz) : await dasPastas(raiz)
  if (!temResumo && !brutos.length && !(await listar(raiz)).some((e) => e.isDirectory() && numeroDiaria(e.name) != null))
    throw new Error('Não achei um projeto do SOBEDESCE aqui. Escolha a pasta que tem "Diária 01", "Diária 02"…')
  const cartoes = []
  for (const b of brutos) {
    const midias = await midiasDe(raiz, b.pasta, b.rels)
    if (!midias.length) continue
    const { rels, ...resto } = b
    cartoes.push({ ...resto, midias })
  }
  cartoes.sort((a, b) => a.diaria.n - b.diaria.n || a.dono.nome.localeCompare(b.dono.nome, 'pt-BR') || a.cartao.n - b.cartao.n)
  return { raiz, nome: path.basename(raiz), origem: temResumo ? 'resumo' : 'pastas', cartoes }
}

module.exports = { lerProjeto, RESUMO, MIDIA }
