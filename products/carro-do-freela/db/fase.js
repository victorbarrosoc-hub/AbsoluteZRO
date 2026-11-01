/**
 * A FASE DO LANÇAMENTO (31/out; recursos por fase em 01/11) — o ÚNICO portão do que o Carro abre por fase
 * (docs/lancamento-fases.md). É uma constante de código, não um interruptor que a pessoa veja.
 *
 * Cada recurso diz em que fase entra (RECURSOS). `null` = ainda sem fase: fica desligado em QUALQUER fase até o titular
 * decidir. O site e as rotas leem DAQUI:
 *   - servidor: a rota de um recurso fora do ar responde 404 (guilda: /api/zro/guildas, /sede e /sede-imagem);
 *   - site: o build escreve a fase em FASE_LANCAMENTO e o que está no ar em RECURSOS_LANCAMENTO (src/build.js).
 *
 * Decisão do titular, 01/11/2026: a GUILDA entra na fase 1, GRÁTIS (criar, entrar, convidar, Sede, chat, mural, memória,
 * XP, cor/logo, missões e a marca de guilda nas propostas; 15 lugares + o bônus de nível, que também é grátis).
 * A VENDA da guilda (fundação paga, +5 e +15 lugares) não tem fase: com ela desligada ninguém compra nada, o servidor
 * ignora qualquer sinal de pacote na conta e a tela mostra só o limite ("15 lugares"). Ligar a venda é decisão do
 * titular, junto com os planos do HUB (rascunho em docs/carro-guilda-venda-rascunho.md).
 *
 * "Libera fase N" = trocar FASE_LANCAMENTO e publicar. Só os testes mexem na fase sem editar este arquivo
 * (fixarParaTeste no servidor, CDF_TESTE_FASE no build).
 */
const FASE_LANCAMENTO = 1;

const RECURSOS = Object.freeze({
  /** a guilda inteira, grátis (01/11/2026) */
  guilda: 1,
  /** fundação paga e lugares extras pagos: só quando a cobrança for ligada (sem fase hoje) */
  venda_guilda: null,
});

let fixada = null, recursosFixados = null;
const faseAtual = () => (fixada === null ? FASE_LANCAMENTO : fixada);
/** só para teste: nunca na Vercel. `recursos` troca a fase de um recurso (ex.: { venda_guilda: 1 } para provar o código
 * guardado da venda); `null` volta tudo ao que está escrito acima. */
function fixarParaTeste(n, recursos) {
  if (process.env.VERCEL) throw new Error('fixarParaTeste não existe em produção');
  fixada = n === null ? null : Number(n);
  recursosFixados = recursos || null;
}
/** o recurso está no ar na fase dada (padrão: a atual)? Recurso desconhecido é erro, não "desligado". */
function noAr(recurso, fase = faseAtual()) {
  if (!Object.prototype.hasOwnProperty.call(RECURSOS, recurso)) throw new Error('recurso sem fase: ' + recurso);
  const f = recursosFixados && Object.prototype.hasOwnProperty.call(recursosFixados, recurso) ? recursosFixados[recurso] : RECURSOS[recurso];
  return f !== null && fase >= f;
}
/** o mapa { recurso: true|false } de uma fase (o que o build escreve no site) */
const recursosDa = (fase = faseAtual()) => Object.fromEntries(Object.keys(RECURSOS).map(k => [k, noAr(k, fase)]));
const guildaNoAr = () => noAr('guilda');
const vendaDaGuildaNoAr = () => noAr('venda_guilda');

module.exports = { FASE_LANCAMENTO, RECURSOS, faseAtual, noAr, recursosDa, guildaNoAr, vendaDaGuildaNoAr, fixarParaTeste };
