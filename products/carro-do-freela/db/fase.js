/**
 * A FASE DO LANÇAMENTO (31/out) — o ÚNICO portão da guilda e do espaço extra (docs/lancamento-fases.md).
 * É uma constante de código, não um interruptor que a pessoa veja. Fase 1 = chegada (sem guilda); fase 2 = comunidade.
 * Quando o titular disser "libera fase 2": troque o número abaixo para 2 e publique (o site e as rotas leem DAQUI).
 *   - servidor: /api/zro/guildas responde 404 enquanto a fase for menor que 2;
 *   - site: o build escreve este número em FASE_LANCAMENTO (src/build.js) e a guilda só aparece com 2 ou mais.
 * Só os testes mexem na fase sem editar este arquivo (fixarParaTeste no servidor, CDF_TESTE_FASE no build).
 */
const FASE_LANCAMENTO = 1;

let fixada = null;
const faseAtual = () => (fixada === null ? FASE_LANCAMENTO : fixada);
/** só para teste: nunca na Vercel */
function fixarParaTeste(n) {
  if (process.env.VERCEL) throw new Error('fixarParaTeste não existe em produção');
  fixada = n === null ? null : Number(n);
}
const guildaNoAr = () => faseAtual() >= 2;

module.exports = { FASE_LANCAMENTO, faseAtual, guildaNoAr, fixarParaTeste };
