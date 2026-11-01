// Animações do site: revelar ao rolar, o palco do topo (as faixas se alinham) e o fluxo SOBEDESCE + Synquei. Cada laço
// só roda enquanto está na tela; com "reduzir movimento", tudo para.

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s))
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const ease = (t) => 1 - Math.pow(1 - t, 3)

// ───────────── revelar ao rolar ─────────────
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      e.target.classList.add('in')
      io.unobserve(e.target)
    }
  },
  { rootMargin: '0px 0px -10% 0px' },
)
$$('.reveal').forEach((el) => io.observe(el))

function loop(el, tick) {
  let raf = 0
  let last = 0
  let on = false
  const frame = (now) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
    last = now
    tick(dt, now)
    raf = requestAnimationFrame(frame)
  }
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !on && !reduce) {
      on = true
      last = 0
      raf = requestAnimationFrame(frame)
    } else if (!e.isIntersecting && on) {
      on = false
      cancelAnimationFrame(raf)
    }
  }).observe(el)
}

// cena "falada": envelope de sílabas e pausas, com ataques nítidos
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function scenePeaks(n, seed) {
  const r = rng(seed)
  const out = new Float32Array(n)
  let i = 0
  while (i < n) {
    const talk = 20 + Math.floor(r() * 60)
    for (let k = 0; k < talk && i < n; ) {
      const syl = 3 + Math.floor(r() * 6)
      const amp = 0.35 + r() * 0.65
      for (let j = 0; j < syl && i < n; j++, i++, k++) out[i] = amp * Math.sin((Math.PI * (j + 0.5)) / syl) * (0.75 + r() * 0.25)
      i += Math.floor(r() * 2)
    }
    if (r() < 0.3 && i < n) out[i++] = 1
    i += 4 + Math.floor(r() * 14)
  }
  return out
}
function drawStrip(cv, peaks, from, to, color, seed, noise = 0.06) {
  const dpr = Math.min(2, devicePixelRatio || 1)
  const w = (cv.width = Math.max(1, cv.clientWidth * dpr))
  const h = (cv.height = Math.max(1, cv.clientHeight * dpr))
  const ctx = cv.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = color
  const r = rng(seed)
  const step = 3 * dpr
  for (let x = 0; x < w; x += step) {
    const i = Math.floor(from + (x / w) * (to - from))
    const v = Math.min(1, (peaks[i] || 0) * (0.85 + r() * 0.3) + r() * noise)
    const bh = Math.max(dpr, v * h * 0.92)
    ctx.fillRect(x, (h - bh) / 2, Math.max(1, step - dpr), bh)
  }
}

// ───────────── palco do topo ─────────────
const stage = $('#stage')
if (stage) {
  const N = 1000
  const peaks = scenePeaks(N, 7)
  const LANES = [
    { name: 'CAM A', c: '#0a84ff', a: 0.06, b: 0.52 },
    { name: 'CAM B', c: '#bf5af2', a: 0.18, b: 0.9 },
    { name: 'CAM C', c: '#30d158', a: 0.38, b: 0.97 },
    { name: 'CELULAR', c: '#ff9f0a', a: 0.58, b: 0.86 },
    { name: 'GRAVADOR', c: '#ff375f', a: 0.0, b: 1.0 },
  ]
  const host = $('#lanes')
  const offs = [-90, 70, -55, 110, 0]
  const clips = LANES.map((l, k) => {
    const lane = document.createElement('div')
    lane.className = 'lane'
    lane.innerHTML = `<span class="lane-name"><i style="--c:${l.c}"></i>${l.name}</span><div class="lane-track"><div class="lane-clip" style="--c:${l.c};left:${l.a * 100}%;width:${(l.b - l.a) * 100}%"><canvas></canvas><span class="lane-conf" style="--k:${k}">${k === 4 ? 'âncora' : 98 + (k % 2) + '%'}</span></div></div>`
    host.appendChild(lane)
    return { el: lane.querySelector('.lane-clip'), cv: lane.querySelector('canvas'), l, k }
  })
  const paint = () => clips.forEach(({ cv, l, k }) => drawStrip(cv, peaks, l.a * N, l.b * N, 'rgba(255,255,255,0.82)', k + 3))
  paint()
  addEventListener('resize', paint)
  // ataque forte comum a quase todas as faixas
  let T = 0.6
  for (let i = Math.floor(N * 0.58); i < N * 0.66; i++) if (peaks[i] > peaks[Math.floor(T * N)]) T = i / N
  const line = $('#syncLine')
  const tag = $('#syncTag')
  const state = $('#stState')
  const place = () => {
    const tr = clips[4].el.parentElement.getBoundingClientRect()
    const hr = host.getBoundingClientRect()
    const x = tr.left - hr.left + T * tr.width
    line.style.left = x + 'px'
    tag.style.left = x + 'px'
  }
  const set = (aligned) => clips.forEach(({ el, k }) => (el.style.transform = aligned ? 'none' : `translateX(${offs[k]}px)`))
  place()
  addEventListener('resize', place)
  if (reduce) {
    set(true)
    stage.classList.add('done')
    state.textContent = 'Sincronizado'
  } else set(false)
  let t = 0
  let phase = -1
  loop(stage, (dt) => {
    t = (t + dt) % 9
    const p = t < 0.3 ? 0 : t < 1.8 ? 1 : t < 3.2 ? 2 : t < 8.4 ? 3 : 4
    if (p === phase) return
    phase = p
    if (p === 0) {
      stage.classList.remove('done')
      set(false)
      state.textContent = 'Lendo o som'
    } else if (p === 1) {
      stage.classList.add('scanning')
      state.textContent = 'Comparando'
    } else if (p === 2) {
      stage.classList.remove('scanning')
      set(true)
      state.textContent = 'Encaixando'
    } else if (p === 3) {
      place()
      stage.classList.add('done')
      state.textContent = 'Sincronizado · 5 de 5'
    } else if (p === 4) {
      stage.classList.remove('done')
    }
  })
}

// ───────────── SOBEDESCE + Synquei: o cartão vai do leitor ao DaVinci ─────────────
const cd = $('#comboDemo')
if (cd) {
  const CARTOES = [
    { sd: 'FX30', dono: 'Marina - FX30', c: '#3987e5', tl: [6, 70] },
    { sd: 'F8', dono: 'Som - F8', c: '#d95926', tl: [2, 94] },
    { sd: 'A7S', dono: 'Bia - A7SIII', c: '#199e70', tl: [18, 62] },
  ]
  const ESTADO = ['Esperando o cartão', 'Espetou o cartão', 'Backup conferido nos 2 HDs', 'Sincronizado pelo som', 'Organizado no DaVinci']
  const pastas = $('#cdPastas')
  const tl = $('#cdTl')
  const estado = $('#cdEstado')
  // a mesma "fala" nas duas ondas: quando alinham, o desenho casa
  const ALT = Array.from({ length: 34 }, (_, i) => 0.18 + Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.37)) * 0.82)
  for (const id of ['#cdOndaA', '#cdOndaB']) $(id).innerHTML = ALT.map((h) => `<i style="height:${Math.round(h * 100)}%"></i>`).join('')
  const fase = (n, k) => {
    cd.dataset.fase = n
    estado.textContent = ESTADO[n]
    cd.classList.toggle('done', n === 4)
    if (n !== 4) return
    const c = CARTOES[k]
    const p = document.createElement('div')
    p.className = 'cd-pasta'
    p.style.setProperty('--c', c.c)
    p.innerHTML = `<i></i>${c.dono} › Cartão 01`
    pastas.appendChild(p)
    const t = document.createElement('i')
    t.style.setProperty('--c', c.c)
    t.style.marginLeft = c.tl[0] + '%'
    t.style.width = c.tl[1] + '%'
    tl.appendChild(t)
  }
  const cartao = (k) => {
    const c = CARTOES[k]
    cd.style.setProperty('--c', c.c)
    $('#cdSdNome').textContent = c.sd
  }
  if (reduce) {
    // sem movimento: o fim da história, com os três cartões no DaVinci
    CARTOES.forEach((_, k) => {
      cartao(k)
      fase(4, k)
    })
  } else {
    const PASSO = [450, 850, 950, 950, 1300]
    let on = false
    let k = 0
    let n = 0
    let timer = 0
    const tick = () => {
      if (!on) return
      n++
      if (n > 4) {
        n = 0
        k++
        if (k >= CARTOES.length) {
          k = 0
          pastas.innerHTML = ''
          tl.innerHTML = ''
        }
        cartao(k)
      }
      fase(n, k)
      timer = setTimeout(tick, PASSO[n])
    }
    cartao(0)
    fase(0, 0)
    new IntersectionObserver(([e]) => {
      on = e.isIntersecting
      clearTimeout(timer)
      if (on) timer = setTimeout(tick, PASSO[n])
    }).observe(cd)
  }
}
