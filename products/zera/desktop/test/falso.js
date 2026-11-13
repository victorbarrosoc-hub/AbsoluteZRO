// ZERA · um window.zera de mentira para testar a interface no Chromium (test/interface.test.mjs) e gerar as telas
// (scripts/telas.mjs) sem Electron nem disco. Imita o motor: mesmos campos (id, n, b, a, p, k, m, pt, q), a mesma
// ordem e o mesmo "resto". Um Mac de 1 TB de quem edita vídeo.
;(() => {
  const GB = 1e9
  const MB = 1e6
  const agora = Math.floor(Date.now() / 1000)
  const DIA = 86400
  const nos = []
  const ouvintes = new Set()
  const emitir = (m) => ouvintes.forEach((f) => f(m))
  const lento = Number(new URLSearchParams(location.search).get('lento') || 0)

  function no(n, pai, { b = 0, k = 5, m = agora - 30 * DIA, pasta = false } = {}) {
    const id = nos.length
    const x = { id, n, pai, b, a: pasta ? 0 : 1, p: pasta, k, m, filhos: [], vivo: true, pt: pasta ? [0, 0, 0, 0, 0, 0] : null }
    nos.push(x)
    if (pai !== null) nos[pai].filhos.push(id)
    return id
  }
  const pasta = (n, pai, m) => no(n, pai, { pasta: true, m })
  const arq = (n, pai, b, k, dias = 20) => no(n, pai, { b, k, m: agora - dias * DIA })

  const raiz = pasta('/', null)
  const users = pasta('Users', raiz)
  const ana = pasta('ana', users)
  const movies = pasta('Movies', ana)
  const aurora = pasta('Cliente Aurora', movies)
  const bruto = pasta('Bruto', aurora)
  for (let i = 1; i <= 14; i++) arq(`A00${Math.ceil(i / 5)}_C0${String(i).padStart(2, '0')}.braw`, bruto, (9 + (i % 5) * 2.3) * GB, 0, 40)
  const prox = pasta('Proxies', aurora)
  for (let i = 1; i <= 6; i++) arq(`A001_C0${i}_proxy.mov`, prox, 1.8 * GB, 0)
  arq('Aurora - corte 3.prproj', aurora, 180 * MB, 3)
  arq('entrega_final.mp4', aurora, 4.2 * GB, 0, 12)
  const noturno = pasta('Clipe Noturno.fcpbundle', movies)
  const render = pasta('Render Files', noturno)
  arq('render-01.mov', render, 18 * GB, 3)
  arq('Original Media.mov', noturno, 42 * GB, 3)
  const antigo = pasta('2023 - Institucional', movies)
  arq('master_4k.mov', antigo, 96 * GB, 0, 600)
  arq('bruto_cam_a.mxf', antigo, 140 * GB, 0, 640)
  const lib = pasta('Library', ana)
  const sup = pasta('Application Support', lib)
  const adobe = pasta('Adobe', sup)
  const common = pasta('Common', adobe)
  const mcf = pasta('Media Cache Files', common)
  arq('cache.cfa', mcf, 38 * GB, 5)
  const caches = pasta('Caches', lib)
  arq('dados', pasta('com.blackmagic-design.DaVinciResolve', caches), 12 * GB, 5)
  arq('dados', pasta('com.google.Chrome', caches), 2.4 * GB, 5)
  arq('dados', pasta('com.spotify.client', caches), 3.1 * GB, 5)
  const mobile = pasta('MobileSync', sup)
  const backup = pasta('Backup', mobile)
  arq('manifest.db', pasta('iPhone de Ana', backup), 64 * GB, 5, 200)
  const down = pasta('Downloads', ana)
  arq('DaVinci_Resolve_20.dmg', down, 3.4 * GB, 4, 120)
  arq('LUTs Pack.zip', down, 1.2 * GB, 5, 300)
  arq('Contrato.pdf', down, 2 * MB, 5, 10)
  const pics = pasta('Pictures', ana)
  const fotos = pasta('Fotos.photoslibrary', pics)
  arq('originais', fotos, 88 * GB, 2)
  const music = pasta('Music', ana)
  arq('Trilhas.aif', music, 22 * GB, 1)
  const docs = pasta('Documents', ana)
  arq('Roteiros.pages', docs, 900 * MB, 5)
  const dev = pasta('Desenvolvimento', ana)
  arq('pacotes', pasta('node_modules', pasta('site', dev)), 1.6 * GB, 5)
  const apps = pasta('Applications', raiz)
  arq('binario', pasta('DaVinci Resolve.app', apps), 6.2 * GB, 4)
  arq('binario', pasta('Adobe Premiere Pro 2026.app', apps), 9.8 * GB, 4)
  arq('binario', pasta('Final Cut Pro.app', apps), 5.1 * GB, 4)
  const sistema = pasta('System', raiz)
  arq('arquivos', sistema, 18 * GB, 4)
  const libsys = pasta('Library', raiz)
  arq('arquivos', libsys, 14 * GB, 5)
  const trash = pasta('.Trash', ana)
  arq('take ruim.mov', trash, 7 * GB, 0)
  for (let i = 0; i < 30; i++) arq(`nota-${i}.txt`, docs, 40_000 + i * 1000, 5)

  // somas de baixo para cima
  function somar(id) {
    const x = nos[id]
    if (!x.p) return x
    x.b = 0
    x.a = 0
    x.pt = [0, 0, 0, 0, 0, 0]
    for (const f of x.filhos) {
      const c = somar(f)
      if (!c.vivo) continue
      x.b += c.b
      x.a += c.a
      if (c.p) c.pt.forEach((v, i) => (x.pt[i] += v))
      else x.pt[c.k] += c.b
    }
    x.k = x.pt.indexOf(Math.max(...x.pt))
    return x
  }
  somar(raiz)

  const info = (x) => {
    const v = { id: x.id, n: x.id === 0 ? '/' : x.n, b: x.b, a: x.a, p: x.p, k: x.k, m: x.m }
    if (x.p) Object.assign(v, { q: x.filhos.length, pt: x.pt })
    return v
  }
  const vivos = (x) => x.filhos.map((f) => nos[f]).filter((c) => c.vivo).sort((a, b) => b.b - a.b)
  const caminho = (id) => {
    const partes = []
    for (let i = id; i !== 0 && i !== null; i = nos[i].pai) partes.unshift(nos[i].n)
    return partes.join('/')
  }
  const trilha = (id) => {
    const t = []
    for (let i = id; i !== null; i = nos[i].pai) t.unshift({ id: i, n: i === 0 ? '/' : nos[i].n })
    return t
  }
  const comC = (x) => ({ ...info(x), c: caminho(x.id) })

  function anel(x, niveis, corte) {
    const v = { id: x.id, n: x.n, b: x.b, k: x.k, p: x.p }
    if (x.p && niveis > 0) {
      v.f = []
      let ob = 0
      let oq = 0
      for (const c of vivos(x)) {
        if (c.b >= corte && c.b > 0) v.f.push(anel(c, niveis - 1, corte))
        else {
          ob += c.b
          oq++
        }
      }
      if (ob) v.f.push({ id: null, n: '', b: ob, o: oq, k: 5 })
    }
    return v
  }

  const grupo = (id, seguranca, lista) => ({ id, seguranca, b: lista.reduce((s, x) => s + x.b, 0), qtd: lista.length, itens: lista.map(comC) })
  const vivo = (...ids) => ids.map((i) => nos[i]).filter((x) => x.vivo)

  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  let previa = null
  let tema = 'claro'

  window.zera = {
    async info() {
      return { plataforma: 'darwin', versao: '0.1.0', tema, motor: true }
    },
    async tema(t) {
      tema = t
      return t
    },
    async discos() {
      return [
        { caminho: '/', nome: 'Macintosh HD', principal: true, total: 1000 * GB, livre: 74 * GB, usado: 926 * GB, cache: null },
        { caminho: '/Volumes/SSD Projetos', nome: 'SSD Projetos', principal: false, total: 2000 * GB, livre: 1210 * GB, usado: 790 * GB, cache: agora - 3 * 3600 },
      ]
    },
    async escolherPasta() {
      return null
    },
    async carregar() {
      return { ok: false, erro: 'sem_cache' }
    },
    async varrer() {
      const passos = lento ? 60 : 8
      const topo = vivos(nos[raiz])
      let b = 0
      for (let i = 1; i <= passos; i++) {
        await espera(lento ? 120 : 15)
        const alvo = (nos[raiz].b * i) / passos
        while (topo.length && b + topo[topo.length - 1].b <= alvo) {
          const t = topo.pop()
          b += t.b
          emitir({ t: 'parcial', n: t.n, b: t.b, pt: t.pt || [0, 0, 0, 0, 0, t.b], nivel: 1, rel: t.n })
        }
        // o 3º nível (Users/ana/*) chega antes, uma pasta por passo
        const dentro = vivos(nos[ana]).filter((f) => f.p)
        const j = i - Math.round(passos / 6)
        if (j >= 0 && j < dentro.length) emitir({ t: 'parcial', n: dentro[j].n, b: dentro[j].b, pt: dentro[j].pt, nivel: 3, rel: 'Users/ana/' + dentro[j].n })
        emitir({ t: 'progresso', b: alvo, arquivos: Math.round((nos[raiz].a * 9000 * i) / passos), pastas: i * 300, atual: '/Users/ana/Movies/Cliente Aurora/Bruto/A00' + (i % 3) + '_C0' + i + '.braw' })
      }
      return { ok: true, ms: 1840, erros: 0, sem_acesso: [], raiz: info(nos[raiz]) }
    },
    async parar() {
      return { ok: true }
    },
    async abrir(id) {
      const x = nos[id]
      if (!x || !x.vivo) return { ok: false }
      const f = vivos(x)
      const mostrar = f.slice(0, 400)
      const resto = f.slice(400)
      return { ok: true, pasta: { no: info(x), trilha: trilha(id), filhos: mostrar.map(info), resto: { qtd: resto.length, b: resto.reduce((s, c) => s + c.b, 0) }, raiz: '/', quando: agora } }
    },
    async anel(id, niveis) {
      const x = nos[id]
      if (!x || !x.vivo) return { ok: false }
      return { ok: true, anel: anel(x, niveis, 0.006 * x.b) }
    },
    async achar(c) {
      const partes = c.split('/').filter(Boolean)
      let x = nos[raiz]
      for (const p of partes) {
        const f = vivos(x).find((y) => y.n === p)
        if (!f) return { ok: false }
        x = f
      }
      return { ok: true, no: x.id }
    },
    async sugestoes() {
      const g = [
        grupo('cache-edicao', 'volta', vivo(mcf, render)),
        grupo('proxies', 'confira', vivo(prox)),
        grupo('caches', 'volta', vivos(nos[caches])),
        grupo('dev', 'volta', vivo(nos.findIndex((x) => x.n === 'node_modules'))),
        grupo('backups', 'confira', vivos(nos[backup])),
        grupo('instaladores', 'confira', vivos(nos[down]).filter((x) => x.n.endsWith('.dmg'))),
        grupo('downloads', 'confira', vivos(nos[down]).filter((x) => x.n.endsWith('.zip'))),
        grupo('esquecidos', 'confira', vivos(nos[antigo])),
        grupo('lixeira', 'lixo', vivo(trash)),
      ]
      return { ok: true, grupos: g }
    },
    async duplicados() {
      await espera(lento ? 1500 : 30)
      const e = vivo(nos.findIndex((x) => x.n === 'entrega_final.mp4'))
      if (!e.length) return { ok: true, grupos: [], desperdicio: 0, qtd: 0 }
      const copia = { ...comC(e[0]), id: 99999, c: 'Users/ana/Desktop/entrega_final cópia.mp4', n: 'entrega_final cópia.mp4' }
      return { ok: true, grupos: [{ tamanho: e[0].b, itens: [comC(e[0]), copia] }], desperdicio: e[0].b, qtd: 1 }
    },
    async previa(ids) {
      const itens = []
      const bloqueados = []
      for (const id of ids) {
        const x = nos[id]
        if (!x || !x.vivo) continue
        const it = { id, c: '/' + caminho(id), b: x.b, p: x.p, nuvem: false }
        if (id === 0) bloqueados.push({ ...it, motivo: 'É a pasta varrida inteira' })
        else if (caminho(id).startsWith('System')) bloqueados.push({ ...it, motivo: 'Arquivo do sistema' })
        else itens.push(it)
      }
      previa = { token: 't' + Date.now(), itens }
      return { ok: true, token: previa.token, itens, bloqueados, total: itens.reduce((s, i) => s + i.b, 0) }
    },
    async moverParaLixo(token) {
      if (!previa || previa.token !== token) return { ok: false }
      await espera(lento ? 600 : 20)
      for (const it of previa.itens) nos[it.id].vivo = false
      somar(raiz)
      const r = { ok: true, movidos: previa.itens.length, liberado: previa.itens.reduce((s, i) => s + i.b, 0), falhas: [], raiz: info(nos[raiz]) }
      previa = null
      window.__lixo = (window.__lixo || 0) + r.movidos
      return r
    },
    async mostrar(id) {
      window.__mostrado = id
    },
    async abrirLixo() {
      window.__abriuLixo = true
    },
    async abrirPermissoes() {},
    async pronto() {},
    aoEvento(f) {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
  }
})()
