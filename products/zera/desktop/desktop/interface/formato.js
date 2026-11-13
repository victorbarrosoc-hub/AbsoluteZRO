// ZERA · números e datas em português. No Mac os tamanhos são decimais (como o Finder: 1 GB = 1000 MB); no Windows,
// binários (como o Explorer), para os números baterem com o que a pessoa vê no sistema.
'use strict'

window.Z = window.Z || {}

Z.fmt = {
  base: 1000,

  bytes(b) {
    const u = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB']
    let v = Math.max(0, Number(b) || 0)
    let i = 0
    while (v >= this.base && i < u.length - 1) {
      v /= this.base
      i++
    }
    const casas = i === 0 ? 0 : v < 100 ? 1 : 0
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas }).format(v) + ' ' + u[i]
  },

  num(n) {
    return new Intl.NumberFormat('pt-BR').format(Number(n) || 0)
  },

  /** "há 3 horas", "agora" (de segundos desde 1970). */
  relativo(seg) {
    if (!seg) return ''
    const d = Math.round(Date.now() / 1000 - seg)
    if (d < 60) return 'agora'
    const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
    const passos = [
      [60, 'second', 1],
      [3600, 'minute', 60],
      [86400, 'hour', 3600],
      [86400 * 30, 'day', 86400],
      [86400 * 365, 'month', 86400 * 30],
      [Infinity, 'year', 86400 * 365],
    ]
    for (const [lim, unidade, div] of passos) {
      if (d < lim) return rtf.format(-Math.floor(d / div), unidade)
    }
    return ''
  },

  pct(parte, todo) {
    if (!todo) return '0%'
    const p = (parte / todo) * 100
    if (p > 0 && p < 1) return '< 1%'
    return Math.round(p) + '%'
  },
}

Z.TIPOS = ['Vídeo', 'Áudio', 'Imagens', 'Projetos', 'Apps', 'Outros']
