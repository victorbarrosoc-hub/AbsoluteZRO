// O parado, no computador inteiro: o mesmo "Manter ou descartar?" do site (src/components/tempo/cronometro.tsx,
// `paradoParaPerguntar` em src/lib/tempo/calculo.ts), medido pelo sistema (powerMonitor.getSystemIdleTime, a
// suspensão e a tela bloqueada) em vez dos gestos dentro da janela. Assim trabalhar no Premiere com o Maestro atrás não
// conta como parado, e o computador dormindo conta. No app o site deixa essa conta com o app (ponte).
//
// A regra: o cronômetro rodando desde antes do parado, e o parado chegou ao limite ("Perguntar parado após", do painel;
// 0 = não perguntar). A pergunta só aparece na VOLTA (quem está longe não lê), com `desde` = o último gesto (ou a hora
// em que o computador dormiu) e `ate` = a volta. Descartar fecha a sessão em `desde` e começa outra agora no mesmo card
// (`op: "parado"` da rota, a mesma do site). Puro: o teste roda em Node.

const MIN = 60_000
/** Abaixo disso a pessoa voltou (mexeu no mouse ou no teclado há pouco). */
const VOLTOU_MS = 5_000

const novo = () => ({ ausenteDesde: null })

/** Dormiu ou bloqueou a tela: o parado começa agora (se ainda não tinha começado). */
function suspender(o, agora) {
  return o.ausenteDesde === null ? { ausenteDesde: agora } : o
}

/**
 * Uma conferência (a cada poucos segundos e na volta do sistema). `ociosoMs` = há quanto tempo nada mexe no
 * computador. Devolve { o, pergunta } (pergunta: { desde, ate, registro } ou null).
 */
function conferir(o, { agora, ociosoMs, rodando, limiteMin }) {
  if (!rodando || !limiteMin) return { o: novo(), pergunta: null }
  const limite = limiteMin * MIN
  const inicio = Date.parse(rodando.inicio)
  const ultimoGesto = agora - Math.max(0, ociosoMs)
  if (ociosoMs >= VOLTOU_MS) {
    // ainda longe: guarda desde quando (o mais antigo entre o gesto e a suspensão)
    const desde = o.ausenteDesde === null ? ultimoGesto : Math.min(o.ausenteDesde, ultimoGesto)
    return { o: ociosoMs >= limite || o.ausenteDesde !== null ? { ausenteDesde: desde } : o, pergunta: null }
  }
  if (o.ausenteDesde === null) return { o, pergunta: null }
  const desde = Math.max(inicio, o.ausenteDesde)
  const ate = Math.max(desde, ultimoGesto)
  if (ate - desde >= limite) return { o: novo(), pergunta: { desde, ate, registro: rodando.id } }
  return { o: novo(), pergunta: null }
}

module.exports = { VOLTOU_MS, novo, suspender, conferir }
