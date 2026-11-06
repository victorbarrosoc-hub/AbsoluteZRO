// Relatório do que passou: a diária do Backup Automático (as linhas v1 do descargas.jsonl) ou o download do Drive (a
// linha v2 do lote). Página única, sem script (o servidor local manda com a CSP das páginas: só CSS em linha), clara
// por padrão e escura se o sistema pedir. No fim, o próximo passo: "Preparar no Synquei" (link synquei://organizar).
// Só diz "conferido" com o hash batendo: xxHash64 nos cartões, MD5 no Drive.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const plural = (n, um, varios) => `${Number(n || 0).toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

export function bytes(n) {
  const v = Number(n) || 0
  if (v < 1024) return `${v} B`
  const u = ['KB', 'MB', 'GB', 'TB']
  let x = v / 1024
  let i = 0
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024
    i++
  }
  return `${x.toLocaleString('pt-BR', { maximumFractionDigits: x < 10 ? 1 : 0 })} ${u[i]}`
}

const VIDEO = /\.(mp4|mov|mxf|braw|r3d|crm|ari|mts|m2ts|avi|mkv|insv|lrv|360)$/i
const AUDIO = /\.(wav|mp3|aif|aiff|m4a|flac|bwf)$/i
const FOTO = /\.(jpe?g|heic|heif|png|tiff?|dng|arw|cr2|cr3|nef|raf|orf|rw2)$/i

/** Vídeos, áudios e fotos de uma lista de arquivos ({ rel }). */
export function contar(arquivos = []) {
  const n = { videos: 0, audios: 0, fotos: 0, outros: 0 }
  for (const a of arquivos) {
    const r = String(a.rel || a.nome || '')
    if (VIDEO.test(r)) n.videos++
    else if (AUDIO.test(r)) n.audios++
    else if (FOTO.test(r)) n.fotos++
    else n.outros++
  }
  return n
}

const tipos = (n) =>
  [n.videos && plural(n.videos, 'vídeo', 'vídeos'), n.audios && plural(n.audios, 'áudio', 'áudios'), n.fotos && plural(n.fotos, 'foto', 'fotos')].filter(Boolean).join(' · ') || 'sem mídia reconhecida'

const quando = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * A diária do Backup Automático: cada linha do descargas.jsonl dela. Agrupa por dono/câmera e, dentro, por cartão.
 * @param {{ projeto: string, diaria: { n: number, nome: string }, linhas: object[], tipoLabel?: string, link?: string|null, agora?: Date }} o
 */
export function dadosDaDiaria({ projeto, diaria, linhas, tipoLabel = '', link = null, agora = new Date() }) {
  const doDia = (linhas || []).filter((l) => l && l.v === 1 && l.diaria && l.diaria.n === diaria.n)
  // a mesma descarga gravada de novo (repetir o cartão) fica só com a última
  const porId = new Map()
  for (const l of doDia) porId.set(`${l.id}|${l.secao || ''}`, l)
  const descargas = [...porId.values()].sort((a, b) => String(a.quando).localeCompare(String(b.quando)))
  const cameras = new Map()
  for (const l of descargas) {
    const k = (l.dono && (l.dono.pasta || l.dono.nome)) || 'Sem dono'
    if (!cameras.has(k)) cameras.set(k, { nome: k, cartoes: [], arquivos: 0, bytes: 0, n: { videos: 0, audios: 0, fotos: 0, outros: 0 } })
    const c = cameras.get(k)
    const n = contar(l.arquivos)
    c.cartoes.push({ nome: (l.cartao && l.cartao.nome) || `Cartão ${String((l.cartao && l.cartao.n) || '').padStart(2, '0')}`, pasta: (l.cartao && l.cartao.pasta) || '', secao: l.secao || 'cenas', resultado: l.resultado, copiados: l.copiados || 0, arquivos: (l.arquivos || []).length, bytes: l.bytes || 0, quando: l.quando, n })
    c.arquivos += (l.arquivos || []).length
    c.bytes += l.bytes || 0
    for (const t of Object.keys(n)) c.n[t] += n[t]
  }
  const total = { cartoes: descargas.length, arquivos: 0, bytes: 0, cameras: cameras.size, problemas: descargas.filter((l) => l.resultado !== 'ok').length }
  for (const c of cameras.values()) {
    total.arquivos += c.arquivos
    total.bytes += c.bytes
  }
  return { formato: 'sobedesce.relatorio/1', tipo: 'backup', projeto, diaria: diaria.nome, tipoLabel, quando: agora.toISOString(), total, cameras: [...cameras.values()], link }
}

/** O download do Drive: a linha v2 do lote (arquivos com MD5 conferido ou não), agrupada pela pasta de cima. */
export function dadosDoDrive({ linha, tipoLabel = '', link = null, agora = new Date() }) {
  const grupos = new Map()
  for (const a of linha.arquivos || []) {
    const partes = String(a.rel || '').split('/')
    const k = partes.length > 1 ? partes[0] : linha.destino?.pasta || 'Pasta'
    if (!grupos.has(k)) grupos.set(k, { nome: k, arquivos: 0, bytes: 0, conferidos: 0, n: { videos: 0, audios: 0, fotos: 0, outros: 0 } })
    const g = grupos.get(k)
    g.arquivos++
    g.bytes += a.size || 0
    if (a.conferido) g.conferidos++
    const n = contar([a])
    for (const t of Object.keys(n)) g.n[t] += n[t]
  }
  const v = linha.verificacao || {}
  return {
    formato: 'sobedesce.relatorio/1',
    tipo: 'drive',
    projeto: linha.destino?.pasta || linha.origem?.pasta || 'Download do Drive',
    diaria: 'Download do Drive',
    tipoLabel,
    quando: agora.toISOString(),
    feitoEm: linha.quando,
    total: { arquivos: v.total || 0, conferidos: v.conferidos || 0, semConferencia: v.sem_conferencia || 0, bytes: linha.bytes || 0, grupos: grupos.size },
    grupos: [...grupos.values()],
    caminho: linha.destino?.caminho || '',
    link,
  }
}

const CSS = `:root{--bg:#f5f5f7;--card:#fff;--fg:#1d1d1f;--sub:#6e6e73;--line:#e5e5ea;--fill:#f2f2f4;--ok:#1f8a4c;--warn:#b25e00}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#161618;--fg:#f5f5f7;--sub:#a1a1a6;--line:#2c2c2e;--fill:#1f1f22;--ok:#30d158;--warn:#ffb340}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Inter,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:860px;margin:0 auto;padding:56px 20px 72px}
.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--sub);margin:0 0 10px}
h1{font-size:44px;line-height:1.05;letter-spacing:-.03em;font-weight:300;margin:0}h1 b{font-weight:800}
.lead{color:var(--sub);margin:12px 0 0;font-size:17px}
.nums{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:36px 0}
.num{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px 18px 16px}.num b{display:block;font-size:28px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.num span{color:var(--sub);font-size:13px}
h2{font-size:22px;letter-spacing:-.01em;font-weight:600;margin:40px 0 12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;margin-bottom:12px}
.topo{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)}.topo b{font-size:16px}.topo small{color:var(--sub)}
.linha{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 18px}.linha+.linha{border-top:1px solid var(--line)}
.linha small{display:block;color:var(--sub);font-size:12.5px}
.chip{display:inline-block;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;background:var(--fill);color:var(--sub);white-space:nowrap}
.chip.ok{color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent)}.chip.warn{color:var(--warn);background:color-mix(in srgb,var(--warn) 14%,transparent)}
.prox{display:flex;align-items:center;justify-content:space-between;gap:16px;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:22px 22px;margin-top:40px}
.prox p{margin:4px 0 0;color:var(--sub);font-size:14px}
.btn{display:inline-block;text-decoration:none;color:#fff;background:rgba(29,29,31,.92);border:1px solid rgba(255,255,255,.18);box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 6px 20px rgba(0,0,0,.12);padding:11px 20px;border-radius:999px;font-weight:600;white-space:nowrap}
@media (prefers-color-scheme:dark){.btn{color:#1d1d1f;background:rgba(245,245,247,.94)}}
.pe{margin-top:44px;color:var(--sub);font-size:12.5px;text-align:center}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;word-break:break-all}
@media (max-width:640px){h1{font-size:34px}.nums{grid-template-columns:repeat(2,minmax(0,1fr))}.prox{flex-direction:column;align-items:flex-start}}
@media print{body{background:#fff}.prox .btn{display:none}}`

const num = (v, rot) => `<div class="num"><b>${esc(v)}</b><span>${esc(rot)}</span></div>`

function pagina({ titulo, eyebrow, lead, nums, corpo, link, tipoLabel, rodape }) {
  const prox = link
    ? `<div class="prox"><div><b>Próximo passo: o Synquei</b><p>Ele lê este backup${tipoLabel ? ` como ${esc(tipoLabel)}` : ''}, separa por momento, câmera e cartão e monta o projeto no editor.</p></div><a class="btn" href="${esc(link)}">Preparar no Synquei</a></div>`
    : ''
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark">
<title>${esc(titulo)} · SOBEDESCE</title><style>${CSS}</style></head>
<body><main><p class="eyebrow">${esc(eyebrow)}</p><h1>${titulo}</h1><p class="lead">${esc(lead)}</p>
<div class="nums">${nums.join('')}</div>${corpo}${prox}
<p class="pe">${esc(rodape)}<br>SOBEDESCE · Absolute ZRO</p></main></body></html>`
}

export function relatorioHtml(d) {
  if (d.tipo === 'drive') {
    const t = d.total
    const corpo = `<h2>Pastas</h2><div class="card">${d.grupos
      .map((g) => `<div class="linha"><div><b>${esc(g.nome)}</b><small>${esc(tipos(g.n))} · ${esc(bytes(g.bytes))}</small></div><span class="chip ${g.conferidos === g.arquivos ? 'ok' : 'warn'}">${g.conferidos === g.arquivos ? 'Conferido (MD5)' : `${esc(plural(g.arquivos - g.conferidos, 'sem conferência', 'sem conferência'))}`}</span></div>`)
      .join('')}</div>${d.caminho ? `<p class="mono" style="color:var(--sub)">${esc(d.caminho)}</p>` : ''}`
    return pagina({
      titulo: `<b>${esc(d.projeto)}</b>`,
      eyebrow: `Download do Drive${d.feitoEm ? ` · ${quando(d.feitoEm)}` : ''}`,
      lead: t.semConferencia ? `${plural(t.semConferencia, 'arquivo ficou', 'arquivos ficaram')} sem conferência de MD5.` : 'Tudo baixado e conferido com o MD5 do Google.',
      nums: [num(t.arquivos.toLocaleString('pt-BR'), 'arquivos'), num(bytes(t.bytes), 'baixados'), num(t.conferidos.toLocaleString('pt-BR'), 'conferidos'), num(t.grupos, t.grupos === 1 ? 'pasta' : 'pastas')],
      corpo,
      link: d.link,
      tipoLabel: d.tipoLabel,
      rodape: 'Nada foi apagado do Drive. Conferido quer dizer MD5 batendo com o do Google.',
    })
  }
  const t = d.total
  const corpo = d.cameras.length
    ? `<h2>Câmeras e cartões</h2>${d.cameras
        .map(
          (c) =>
            `<div class="card"><div class="topo"><b>${esc(c.nome)}</b><small>${esc(plural(c.cartoes.length, 'cartão', 'cartões'))} · ${esc(tipos(c.n))} · ${esc(bytes(c.bytes))}</small></div>${c.cartoes
              .map((k) => `<div class="linha"><div><b>${esc(k.nome)}${k.secao === 'fotos' ? ' · Fotos' : ''}</b><small>${esc(plural(k.arquivos, 'arquivo', 'arquivos'))} · ${esc(bytes(k.bytes))}${k.quando ? ` · ${esc(quando(k.quando))}` : ''}</small></div><span class="chip ${k.resultado === 'ok' ? 'ok' : 'warn'}">${k.resultado === 'ok' ? 'Conferido' : 'Conferir'}</span></div>`)
              .join('')}</div>`,
        )
        .join('')}`
    : '<p class="lead">Nenhum cartão passou nesta diária ainda.</p>'
  return pagina({
    titulo: `${esc(d.diaria)} · <b>${esc(d.projeto)}</b>`,
    eyebrow: `Backup Automático${d.tipoLabel ? ` · ${d.tipoLabel}` : ''}`,
    lead: t.problemas ? `${plural(t.problemas, 'cartão pede', 'cartões pedem')} atenção antes de formatar.` : t.cartoes ? 'Tudo copiado e conferido com xxHash64. Pode formatar os cartões.' : 'Espete um cartão para começar.',
    nums: [num(t.cartoes, t.cartoes === 1 ? 'cartão' : 'cartões'), num(t.cameras, t.cameras === 1 ? 'câmera' : 'câmeras'), num(t.arquivos.toLocaleString('pt-BR'), 'arquivos'), num(bytes(t.bytes), 'no projeto')],
    corpo,
    link: t.cartoes ? d.link : null,
    tipoLabel: d.tipoLabel,
    rodape: 'Os originais ficam onde o SOBEDESCE copiou. Conferido quer dizer xxHash64 batendo entre o cartão e cada destino.',
  })
}
