// Revela · roda o controle de qualidade em todos os looks do motor profissional e imprime a tabela.
// Uso: node scripts/qc-looks.mjs [id-do-look]
import { GRUPOS, criarMotor } from '../src/cor/pelicula.js'
import { avaliarLook } from '../src/cor/qc.js'

const so = process.argv[2]
let falhas = 0
for (const g of GRUPOS)
  for (const p of g.looks) {
    if (so && p.id !== so) continue
    const r = avaliarLook(criarMotor(p), { veu: p.veu > 0, pb: !!p.pb, tingeMax: p.tingeMax })
    if (!r.ok) falhas++
    const linha = r.verificacoes.map((v) => `${v.ok ? '·' : '✗'}${v.id}=${v.valor}`).join(' ')
    console.log(`${r.ok ? 'OK   ' : 'FALHA'} ${p.id.padEnd(18)} ${linha}`)
    if (so) for (const v of r.verificacoes) console.log(`   ${v.nome}: ${v.valor} / ${v.limite} · ${v.detalhe}`)
  }
process.exitCode = falhas ? 1 : 0
