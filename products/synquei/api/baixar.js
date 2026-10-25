// /baixar/mac, /baixar/windows e /baixar/versao (vercel.json reescreve para cá).
// Lê o Release do app de desktop no GitHub e manda o visitante direto para o instalador: nada passa pela Vercel.
// Fontes, na ordem: o Release "synquei-app-desktop" do repositório AbsoluteZRO (fonte oficial desde 25/10/2026) e,
// enquanto ele não tiver instalador, o Release "app-desktop" do repositório antigo victorbarrosoc-hub/synquei
// (arquivado). O download nunca fica sem destino na virada.
// Repositório privado: com GITHUB_TOKEN (só leitura de conteúdo) nas variáveis da Vercel, o GitHub devolve um endereço
// assinado e temporário do arquivo. Repositório público: funciona sem token, pelo link normal.
// `?build=N` (instaladores de uma linha e atualizador): o instalador exatamente daquele build, em qualquer das fontes.
// /baixar/diag: diz por que o download não sai (sem token, token recusado, sem acesso), sem mostrar o token.

const FONTES = [
  { repo: process.env.SYNQUEI_REPO || 'victorbarrosoc-hub/AbsoluteZRO', tag: process.env.SYNQUEI_TAG || 'synquei-app-desktop' },
  { repo: 'victorbarrosoc-hub/synquei', tag: 'app-desktop' },
]
const CACHE_MS = 2 * 60_000
const cache = new Map()

// colado no painel da Vercel às vezes vem com espaço ou quebra de linha no fim
const token = () => (process.env.GITHUB_TOKEN || '').trim()
const auth = () => (token() ? { authorization: `Bearer ${token()}` } : {})
const releaseUrl = (f) => `https://api.github.com/repos/${f.repo}/releases/tags/${f.tag}`

/** Arquivos do Release de uma fonte ([] se ele não existe ou não responde). */
async function assetsDe(f) {
  const k = `${f.repo}#${f.tag}`
  const c = cache.get(k)
  if (c && Date.now() - c.em < CACHE_MS) return c.assets
  let lista = []
  try {
    const r = await fetch(releaseUrl(f), { headers: { accept: 'application/vnd.github+json', ...auth() }, signal: AbortSignal.timeout(10_000) })
    if (r.ok) {
      const j = await r.json()
      lista = Array.isArray(j.assets) ? j.assets : []
    } else await r.body?.cancel().catch(() => {})
  } catch {
    if (c) return c.assets
    throw new Error('github indisponível')
  }
  cache.set(k, { em: Date.now(), assets: lista })
  return lista
}

/** A primeira fonte com instalador (com versao.json) vale; sem nenhuma, a primeira com qualquer arquivo. */
async function fonteAtual() {
  const todas = []
  for (const f of FONTES) {
    const assets = await assetsDe(f).catch(() => [])
    todas.push({ ...f, assets })
    if (assets.some((a) => a.name === 'versao.json') && assets.some((a) => QUAL.mac(a.name) || QUAL.windows(a.name))) return { atual: { ...f, assets }, todas }
  }
  return { atual: todas.find((t) => t.assets.length) || null, todas }
}

async function link(asset) {
  if (!token()) return asset.browser_download_url
  const r = await fetch(asset.url, { headers: { accept: 'application/octet-stream', ...auth() }, redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  const loc = r.headers.get('location')
  await r.body?.cancel().catch(() => {})
  return loc
}

async function versao(fonte) {
  const f = fonte || (await fonteAtual()).atual
  const a = f && f.assets.find((x) => x.name === 'versao.json')
  if (!a) return null
  const url = await link(a)
  if (!url) return null
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!r.ok) return null
  const v = await r.json()
  const sha = (s) => (typeof s === 'string' && /^[0-9a-f]{64}$/i.test(s) ? s.toLowerCase() : null)
  return { build: Number(v.build) || null, versao: v.versao || null, data: v.data || null, arquivoMac: v.arquivoMac || null, sha256Mac: sha(v.sha256Mac), arquivoWindows: v.arquivoWindows || null, sha256Windows: sha(v.sha256Windows) }
}

const buildDe = (nome) => {
  const m = /-b(\d{1,9})-/.exec(nome)
  return m ? Number(m[1]) : -1
}
const QUAL = { mac: (n) => n.endsWith('-mac-universal.dmg'), windows: (n) => n.endsWith('-windows-setup.exe') }

/** Diagnóstico sem segredos: tem token? de que tipo? o GitHub aceita? o Release tem os instaladores? */
async function diag() {
  const bruto = process.env.GITHUB_TOKEN || ''
  const t = token()
  const out = {
    token: !!t,
    tipoToken: !t ? null : t.startsWith('github_pat_') ? 'fino' : t.startsWith('ghp_') ? 'clássico' : 'outro formato',
    espacoNasPontas: !!t && bruto !== t,
    repositorio: FONTES[0].repo,
    tag: FONTES[0].tag,
    reserva: `${FONTES[1].repo} (${FONTES[1].tag})`,
  }
  const r = await fetch(releaseUrl(FONTES[0]), { headers: { accept: 'application/vnd.github+json', ...auth() }, signal: AbortSignal.timeout(10_000) }).catch((e) => ({ ok: false, status: String(e && e.message) }))
  out.githubRelease = r.status
  out.motivo = r.ok ? null : r.status === 401 ? 'token recusado pelo GitHub (inválido, incompleto ou expirado)' : r.status === 404 ? (t ? 'token sem acesso ao repositório (ou Release inexistente)' : 'repositório privado e sem token') : r.status === 403 ? 'token sem permissão (Contents: Read-only) ou limite de uso' : 'falha ao falar com o GitHub'
  if (r.ok) {
    const j = await r.json()
    const a = Array.isArray(j.assets) ? j.assets : []
    out.mac = a.filter((x) => QUAL.mac(x.name)).length
    out.windows = a.filter((x) => QUAL.windows(x.name)).length
    const v = a.find((x) => x.name === 'versao.json')
    out.versaoJson = !!v
    if (v) out.linkAssinado = !!(await link(v).catch(() => null))
  }
  const { atual } = await fonteAtual().catch(() => ({ atual: null }))
  out.entregandoDe = atual ? `${atual.repo} (${atual.tag})` : null
  return out
}

export default async function handler(req, res) {
  const p = String((req.query && req.query.p) || '')
  try {
    if (p === 'diag') {
      res.setHeader('cache-control', 'no-store')
      return res.status(200).json(await diag())
    }
    if (p === 'versao') {
      const v = await versao()
      res.setHeader('cache-control', 'public, max-age=60, s-maxage=120')
      if (!v) return res.status(503).json({ ok: false })
      return res.status(200).json({ ok: true, ...v, mac: '/baixar/mac', windows: '/baixar/windows' })
    }
    if (!QUAL[p]) return res.redirect(302, '/#baixar')
    const pedido = req.query.build && /^\d{1,9}$/.test(String(req.query.build)) ? Number(req.query.build) : null
    const { atual, todas } = await fonteAtual()
    let alvo
    if (pedido != null) {
      // o build pedido pode estar em qualquer fonte (os do repositório antigo têm números menores)
      for (const f of todas) {
        alvo = f.assets.find((a) => QUAL[p](a.name) && buildDe(a.name) === pedido)
        if (alvo) break
      }
      if (!alvo) {
        for (const f of FONTES.slice(todas.length)) {
          alvo = (await assetsDe(f).catch(() => [])).find((a) => QUAL[p](a.name) && buildDe(a.name) === pedido)
          if (alvo) break
        }
      }
    } else if (atual) {
      // o que o versao.json aponta (conferido); sem ele, o de maior build
      const lista = atual.assets.filter((a) => QUAL[p](a.name))
      let nome = null
      try {
        const v = await versao(atual)
        nome = v ? (p === 'mac' ? v.arquivoMac : v.arquivoWindows) : null
      } catch {}
      alvo = (nome && lista.find((a) => a.name === nome)) || lista.sort((a, b) => buildDe(b.name) - buildDe(a.name))[0]
    }
    if (!alvo) {
      if (pedido != null) return res.status(404).send('Instalador deste build não está mais no ar.')
      return res.redirect(302, '/?baixar=indisponivel#baixar')
    }
    const destino = await link(alvo)
    if (!destino) return res.redirect(302, '/?baixar=indisponivel#baixar')
    res.setHeader('cache-control', 'no-store')
    return res.redirect(302, destino)
  } catch (e) {
    console.error('[baixar]', p, e && e.message)
    if (p === 'versao') return res.status(503).json({ ok: false })
    return res.redirect(302, '/?baixar=indisponivel#baixar')
  }
}
