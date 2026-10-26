// Revela · peças visuais das telas: ícones (traço único, 24×24) e o glifo de cada destino (o formato da tela onde o
// vídeo vai passar). Menos texto, mais forma: a pessoa reconhece 16:9, 9:16, TV e película antes de ler.

const traco = (corpo, extra = '') =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${corpo}</svg>`

export const ICONES = {
  soltar: traco('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/>'),
  baixar: traco('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/>'),
  imagem: traco('<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>'),
  filme: traco('<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M3.5 9h17M3.5 15h17M8 5v4M12 5v4M16 5v4M8 15v4M12 15v4M16 15v4"/>'),
  gota: traco('<path d="M12 3.5s-6 6.6-6 10.8a6 6 0 0 0 12 0C18 10.1 12 3.5 12 3.5Z"/>'),
  copiar: traco('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  pasta: traco('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>'),
  ok: traco('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  x: traco('<path d="M6 6l12 12M18 6 6 18"/>'),
  aviso: traco('<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.5M12 17.2v.1"/>'),
  cadeado: traco('<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  info: traco('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>'),
  converter: traco('<path d="M4 8h13l-3.5-3.5"/><path d="M20 16H7l3.5 3.5"/>'),
  lut: traco('<path d="M12 3.5 19.5 8v8L12 20.5 4.5 16V8Z"/><path d="M12 12 19.5 8M12 12v8.5M12 12 4.5 8"/>'),
  entrega: traco('<path d="M5 12h12"/><path d="m13 7 5 5-5 5"/><path d="M5 5v14"/>'),
}

/** Nome curto para o cartão; o nome inteiro vai no rótulo acessível. */
export const NOME_CURTO = {
  reels: 'Reels',
  'tv-aberta': 'TV aberta',
  streaming: 'Streaming',
  master: 'Master',
}

/** O formato onde o vídeo passa: moldura na proporção certa e um sinal dentro. */
export function glifo(d) {
  const vertical = Boolean(d.video.altura && d.video.altura > d.video.largura)
  const play = (cx, cy, s) => `<path d="M${cx - s * 0.4} ${cy - s * 0.55}v${s * 1.1}l${s * 0.95}-${s * 0.55}Z" fill="currentColor" stroke="none"/>`
  let corpo
  if (vertical) corpo = `<rect x="15" y="4" width="18" height="32" rx="4"/>${play(24, 20, 6)}`
  else if (d.id === 'tv-aberta') corpo = `<rect x="5" y="6" width="38" height="23" rx="4"/><path d="M17 35h14M24 29v6"/>${play(24, 17.5, 6)}`
  else if (d.id === 'master' || d.id === 'streaming')
    corpo = `<rect x="4" y="8" width="40" height="24" rx="4"/><path d="M4 13h40M4 27h40"/>${[10, 18, 26, 34, 42]
      .map((x) => `<path d="M${x - 2} 8v5M${x - 2} 27v5"/>`)
      .join('')}`
  else corpo = `<rect x="4" y="8" width="40" height="24" rx="4"/>${play(24, 20, 7)}`
  const hdr = d.cor?.nome?.includes('HDR')
    ? '<text x="40" y="39" text-anchor="end" font-size="8" font-weight="700" fill="currentColor" stroke="none">HDR</text>'
    : ''
  return `<svg class="glifo" viewBox="0 0 48 40" width="48" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${corpo}${hdr}</svg>`
}

/** Elemento a partir de HTML confiável (só os SVGs daqui). */
export function svg(html) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstChild
}

/** Pontos de entrada com escalonamento: cada `.entra` recebe a ordem dele (a animação fica no CSS). */
export function escalonar(raiz = document) {
  raiz.querySelectorAll('.entra').forEach((n, i) => n.style.setProperty('--i', String(i)))
}

/** Troca cada `[data-icone]` pelo ícone. */
export function icones(raiz = document) {
  raiz.querySelectorAll('[data-icone]').forEach((n) => n.replaceChildren(svg(ICONES[n.dataset.icone])))
}
