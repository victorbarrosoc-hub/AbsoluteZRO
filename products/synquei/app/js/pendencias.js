// Balões da barra lateral e da barra de abas: quantas coisas em cada aba esperam uma ação da pessoa. Só conta o que
// o próprio app já pede na tela (religar a mídia, sincronizar, conferir clipe em laranja, cartão esperando, versão
// nova pronta). Função pura: recebe o estado e devolve { aba: { n, t } }; o main.js desenha.

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

/**
 * @param {object} e
 * @param {object|null} e.project projeto aberto (S.project)
 * @param {{active:boolean}} e.probe leitura dos arquivos (S.probe)
 * @param {{running:boolean,error:string|null}} e.sync sincronia (S.sync)
 * @param {(clip:object)=>boolean} e.temMidia o arquivo do clipe está ligado nesta sessão (hasMedia)
 * @param {{esperando:boolean,fila:any[],davinci:object|null}} [e.org] Organizar (só no app de computador)
 * @param {object|null} [e.atualizacao] estado da atualização (só no app de computador)
 */
export function pendencias({ project: p, probe, sync, temMidia, org, atualizacao } = {}) {
  const out = {}
  const ocupado = !!(probe && probe.active) || !!(sync && sync.running)
  if (p && !p.demo && !ocupado) {
    const prontos = p.clips.filter((c) => c.status === 'ready')
    const comMidia = prontos.filter(temMidia).length
    // Mídia: sem sincronia ainda, cada clipe sem o arquivo ligado precisa da pasta solta de novo (midia.js, "religar")
    const semMidia = p.result ? 0 : prontos.length - comMidia
    if (semMidia > 0) out.midia = { n: semMidia, t: `${plural(semMidia, 'clipe sem mídia', 'clipes sem mídia')}: solte as mesmas pastas para religar` }
    // Sincronizar: a última tentativa falhou, ou há clipes prontos e nenhuma sincronia ainda
    if (sync && sync.error) out.sincronizar = { n: 1, t: 'A sincronização falhou: tente de novo' }
    else if (!p.result && comMidia > 0) out.sincronizar = { n: 1, t: 'Falta sincronizar' }
    // Linha do tempo: clipes em laranja (confiança baixa) que ainda não foram ajustados à mão
    if (p.result) {
      const conferir = prontos.filter((c) => c.sync && c.sync.conf < 0.5 && !String(c.sync.method || '').startsWith('manual')).length
      if (conferir > 0) out.linha = { n: conferir, t: `${plural(conferir, 'clipe para conferir', 'clipes para conferir')} na linha do tempo` }
    }
  }
  // Organizar: cartões parados esperando a pessoa fechar o projeto dela, e o DaVinci esperando um projeto ser aberto
  if (org) {
    const cartoes = org.esperando ? org.fila.length : 0
    const dv = org.davinci && org.davinci.esperando ? 1 : 0
    if (cartoes + dv > 0) {
      const t = [cartoes ? `${plural(cartoes, 'cartão esperando', 'cartões esperando')} você fechar o projeto aberto` : '', dv ? `o DaVinci espera o projeto ${org.davinci.esperando}` : ''].filter(Boolean).join(' · ')
      out.organizar = { n: cartoes + dv, t: t[0].toUpperCase() + t.slice(1) }
    }
  }
  // Ajustes: versão nova (quem atualiza é a central Absolute ZRO)
  const a = atualizacao
  if (a && a.nova) out.ajustes = { n: 1, t: 'Atualização disponível' }
  return out
}

/** Número do balão: até 99, depois "99+". */
export const numeroBalao = (n) => (n > 99 ? '99+' : String(n))
/** Texto para leitor de tela. */
export const rotuloBalao = (n) => `${n} ${n === 1 ? 'pendência' : 'pendências'}`
