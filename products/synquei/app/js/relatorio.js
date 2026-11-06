// Relatório da diária (ou da pasta): o que o Synquei entendeu do material e onde pôs cada coisa. Vai para
// <projeto>/Synquei/Relatório · <diária>.html (abre em qualquer navegador, sem script) e um .json ao lado para outros
// apps. Os números saem do projeto e da classificação de momentos (app/js/momentos.js): nada é inventado; o que é
// sugestão aparece como sugestão.

import { pastaDoClipe, camerasComLentes } from './momentos.js'

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

export function duracao(seg) {
  const s = Math.round(seg || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`
  if (m) return `${m} min`
  return `${s} s`
}

const ORIGEM = { marcado: ['Marcado', 'is-ok'], pasta: ['Pela pasta', 'is-ok'], horario: ['Sugerido pelo horário', 'is-warn'], padrao: ['Sugerido', 'is-warn'] }

/** Os números do relatório (também vão no .json). */
export function dadosRelatorio({ p, cls, diaria, tipoLabel = '', linhas = [], arquivos = {}, quando = Date.now() }) {
  const porId = new Map(p.clips.map((c) => [c.id, c]))
  const ids = Object.keys(cls.clipes)
  const clips = ids.map((k) => porId.get(k)).filter(Boolean)
  const lentes = camerasComLentes(cls)
  const video = clips.filter((c) => !cls.clipes[c.id].audio)
  const porSom = (c) => c.sync && String(c.sync.method || '').startsWith('audio')
  const cameras = new Map()
  for (const c of clips) {
    const x = cls.clipes[c.id]
    if (x.audio) continue
    if (!cameras.has(x.camera)) cameras.set(x.camera, { nome: x.camera, lentes: new Set(), cartoes: new Set(), clipes: 0, duracao: 0, sincronizados: 0, broll: 0 })
    const k = cameras.get(x.camera)
    if (x.lente) k.lentes.add(x.lente)
    if (c.org && c.org.cartaoNome) k.cartoes.add(c.org.cartaoNome)
    k.clipes++
    k.duracao += c.duration || 0
    if (c.sync) k.sincronizados++
    if (x.broll) k.broll++
  }
  const audios = new Map()
  for (const c of clips) {
    const x = cls.clipes[c.id]
    if (!x.audio) continue
    if (!audios.has(x.camera)) audios.set(x.camera, { nome: x.camera, clipes: 0, duracao: 0, sincronizados: 0 })
    const a = audios.get(x.camera)
    a.clipes++
    a.duracao += c.duration || 0
    if (c.sync) a.sincronizados++
  }
  const semSincronia = video.filter((c) => !c.sync && !cls.clipes[c.id].broll).map((c) => c.relPath)
  const revisar = clips.filter((c) => c.sync && porSom(c) && c.sync.conf < 0.5).map((c) => c.relPath)
  const ignorados = (p.ignored || []).length + p.clips.filter((c) => c.status === 'error').length
  return {
    formato: 'synquei.relatorio/1',
    quando: new Date(quando).toISOString(),
    projeto: p.name,
    diaria,
    tipo: tipoLabel,
    totais: {
      arquivos: clips.length,
      cameras: cameras.size,
      audios: audios.size,
      duracao: clips.reduce((t, c) => t + (cls.clipes[c.id].audio ? 0 : c.duration || 0), 0),
      sincronizados: clips.filter((c) => c.sync).length,
      porSom: clips.filter(porSom).length,
      broll: video.filter((c) => cls.clipes[c.id].broll).length,
      ignorados,
    },
    momentos: cls.momentos.map((mm) => ({ nome: mm.nome, pasta: mm.pasta, clipes: mm.clipes, broll: mm.broll, audio: mm.audio, duracao: mm.duracao, cameras: mm.cameras, origem: mm.origens.includes('marcado') ? 'marcado' : mm.origens.includes('pasta') ? 'pasta' : mm.origens.includes('horario') ? 'horario' : 'padrao' })),
    partes: cls.partes,
    cameras: [...cameras.values()].map((k) => ({ ...k, lentes: [...k.lentes], cartoes: [...k.cartoes].sort() })),
    audios: [...audios.values()],
    linhas,
    arquivos,
    pendencias: { semSincronia: semSincronia.slice(0, 200), revisar: revisar.slice(0, 200), totalSemSincronia: semSincronia.length, totalRevisar: revisar.length },
    pastas: [...new Set(clips.map((c) => pastaDoClipe(cls.clipes[c.id], { diaria, cartao: (c.org && c.org.cartaoNome) || '', eixo: cls.eixo, parte: cls.parte, lentes }).join(' › ')))].sort(),
  }
}

const CSS = `
:root{--bg:#fbfbfd;--card:#fff;--fg:#1d1d1f;--sub:#6e6e73;--hair:rgba(0,0,0,.08);--ok:#1f8a3b;--okbg:rgba(52,199,89,.14);--warn:#a35a00;--warnbg:rgba(255,159,10,.16);--accent:#6250d6}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#161618;--fg:#f5f5f7;--sub:#a1a1a6;--hair:rgba(255,255,255,.1);--ok:#4cd471;--okbg:rgba(48,209,88,.16);--warn:#ffb340;--warnbg:rgba(255,159,10,.18);--accent:#9085e9}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:980px;margin:0 auto;padding:48px 16px 64px}
.marca{display:flex;align-items:center;gap:8px;color:var(--sub);font-size:13px;font-weight:600;letter-spacing:.02em}
h1{font-size:clamp(34px,6vw,56px);line-height:1.04;letter-spacing:-.025em;margin:14px 0 8px;font-weight:800}
h1 .fino{font-weight:300}
.lead{color:var(--sub);font-size:17px;margin:0 0 32px}
h2{font-size:22px;letter-spacing:-.01em;margin:44px 0 14px}
.grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.num{background:var(--card);border:1px solid var(--hair);border-radius:18px;padding:18px}
.num b{display:block;font-size:30px;letter-spacing:-.02em;line-height:1.1}
.num span{color:var(--sub);font-size:13px}
.lista{background:var(--card);border:1px solid var(--hair);border-radius:18px;overflow:hidden}
.linha{display:grid;grid-template-columns:1fr auto;gap:6px 16px;padding:14px 18px;border-top:1px solid var(--hair);align-items:center}
.linha:first-child{border-top:0}
.linha b{font-size:15px}
.linha small{display:block;color:var(--sub);font-size:13px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.chip{display:inline-block;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;background:var(--hair);color:var(--fg)}
.chip.is-ok{background:var(--okbg);color:var(--ok)}
.chip.is-warn{background:var(--warnbg);color:var(--warn)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;word-break:break-all}
details{background:var(--card);border:1px solid var(--hair);border-radius:18px;padding:14px 18px;margin-top:12px}
summary{cursor:pointer;font-weight:600}
ul.arq{margin:10px 0 0;padding-left:18px}
.pe{margin-top:48px;color:var(--sub);font-size:13px;text-align:center}
@media (max-width:520px){.linha{grid-template-columns:1fr}}
`

/** A página do relatório (HTML completo, sem script). */
export function relatorioHtml(d) {
  const t = d.totais
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')
  const num = (v, rot) => `<div class="num"><b>${esc(v)}</b><span>${esc(rot)}</span></div>`
  const momentos = d.momentos
    .map((mm) => {
      const [rot, cls] = ORIGEM[mm.origem] || ORIGEM.padrao
      return `<div class="linha"><div><b>${esc(mm.pasta)}</b><small>${esc(plural(mm.clipes, 'arquivo', 'arquivos'))} · ${esc(duracao(mm.duracao))}${mm.broll ? ` · ${esc(plural(mm.broll, 'b-roll', 'b-rolls'))}` : ''}${mm.audio ? ` · ${esc(plural(mm.audio, 'áudio', 'áudios'))}` : ''}</small>${mm.cameras.length ? `<div class="chips">${mm.cameras.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}</div><span class="chip ${cls}">${esc(rot)}</span></div>`
    })
    .join('')
  const cameras = d.cameras
    .map((k) => `<div class="linha"><div><b>${esc(k.nome)}</b><small>${esc(plural(k.clipes, 'clipe', 'clipes'))} · ${esc(duracao(k.duracao))}${k.cartoes.length ? ` · ${esc(k.cartoes.join(', '))}` : ''}${k.broll ? ` · ${esc(plural(k.broll, 'b-roll', 'b-rolls'))}` : ''}</small>${k.lentes.length ? `<div class="chips">${k.lentes.map((l) => `<span class="chip">${esc(l)}</span>`).join('')}</div>` : ''}</div><span class="chip ${k.sincronizados === k.clipes ? 'is-ok' : 'is-warn'}">${esc(pct(k.sincronizados, k.clipes))} sincronizado</span></div>`)
    .join('')
  const audios = d.audios.map((a) => `<div class="linha"><div><b>${esc(a.nome)}</b><small>${esc(plural(a.clipes, 'arquivo', 'arquivos'))} · ${esc(duracao(a.duracao))}</small></div><span class="chip ${a.sincronizados === a.clipes ? 'is-ok' : 'is-warn'}">${esc(pct(a.sincronizados, a.clipes))} sincronizado</span></div>`).join('')
  const linhas = d.linhas.length ? `<div class="lista">${d.linhas.map((l) => `<div class="linha"><div><b>${esc(l)}</b></div></div>`).join('')}</div>` : '<p class="lead">Nenhuma linha do tempo nesta passada.</p>'
  const p = d.pendencias
  const pend = p.totalSemSincronia + p.totalRevisar
  const arquivos = Object.entries(d.arquivos || {}).filter(([, v]) => v)
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark">
<title>Relatório · ${esc(d.diaria)} · Synquei</title><style>${CSS}</style></head>
<body><main>
<div class="marca">Synquei · Relatório</div>
<h1><span class="fino">${esc(d.diaria)}</span><br>${esc(d.projeto)}</h1>
<p class="lead">${esc(d.tipo || 'Projeto')} · ${esc(new Date(d.quando).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }))}</p>
<div class="grade">
${num(t.arquivos, 'arquivos')}${num(t.cameras, t.cameras === 1 ? 'câmera' : 'câmeras')}${num(t.audios, t.audios === 1 ? 'gravador de áudio' : 'gravadores de áudio')}${num(duracao(t.duracao), 'de vídeo')}${num(pct(t.sincronizados, t.arquivos), 'sincronizado')}${num(t.broll, 'b-roll')}
</div>
<h2>Momentos</h2><div class="lista">${momentos || '<div class="linha"><div><small>Nada ainda.</small></div></div>'}</div>
${d.partes.length ? `<p class="lead" style="margin-top:12px">${esc(plural(d.partes.length, 'parte', 'partes'))}: ${esc(d.partes.join(', '))}</p>` : ''}
<h2>Câmeras</h2><div class="lista">${cameras || '<div class="linha"><div><small>Nenhuma câmera.</small></div></div>'}</div>
${audios ? `<h2>Áudio</h2><div class="lista">${audios}</div>` : ''}
<h2>Linhas do tempo</h2>${linhas}
<h2>Para conferir</h2>
${pend ? `<div class="lista">${p.totalSemSincronia ? `<div class="linha"><div><b>${esc(plural(p.totalSemSincronia, 'vídeo sem sincronia', 'vídeos sem sincronia'))}</b><small>Não acharam som em comum nem timecode. Estão na linha “Sem sincronia (conferir)”.</small></div><span class="chip is-warn">Conferir</span></div>` : ''}${p.totalRevisar ? `<div class="linha"><div><b>${esc(plural(p.totalRevisar, 'encaixe com confiança baixa', 'encaixes com confiança baixa'))}</b><small>Aparecem em laranja na linha do tempo do Synquei.</small></div><span class="chip is-warn">Revisar</span></div>` : ''}</div>
<details><summary>Ver os arquivos</summary><ul class="arq">${[...p.semSincronia.map((r) => `<li class="mono">Sem sincronia: ${esc(r)}</li>`), ...p.revisar.map((r) => `<li class="mono">Revisar: ${esc(r)}</li>`)].join('')}</ul></details>` : '<div class="lista"><div class="linha"><div><b>Tudo certo</b><small>Todo vídeo encaixou pelo som ou pelo timecode, ou é b-roll.</small></div><span class="chip is-ok">Pronto</span></div></div>'}
<h2>Onde ficou</h2>
<div class="lista">${arquivos.map(([k, v]) => `<div class="linha"><div><b>${esc(k)}</b><small class="mono">${esc(v)}</small></div></div>`).join('')}<div class="linha"><div><b>Pastas no editor</b><small>${esc(plural(d.pastas.length, 'pasta', 'pastas'))}</small></div></div></div>
<details><summary>Ver as pastas</summary><ul class="arq">${d.pastas.map((x) => `<li class="mono">${esc(x)}</li>`).join('')}</ul></details>
<p class="pe">Os arquivos originais não foram movidos nem renomeados. Os momentos marcados como sugestão podem ser corrigidos no Synquei, em Organizar.</p>
</main></body></html>
`
}
