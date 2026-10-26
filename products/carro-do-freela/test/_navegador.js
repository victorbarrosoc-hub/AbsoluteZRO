/* ABRE O CHROMIUM DAS SUÍTES — um lugar só para todas (26/out).
 *
 * ⚠️ `--allow-file-access-from-files` É O QUE MANTÉM AS GUARDAS DE CSS DE PÉ.
 * Desde 26/out o CSS mora num arquivo próprio (m/app.<hash>.css) e as suítes
 * abrem a página por file://. Sem a flag, o Chromium trata a folha como de
 * outra origem e `cssRules` estoura — e as sete suítes que varrem regras
 * (colisao, feedback, guilda-social, identidade, movimento, tela-de-inicio,
 * uso-real) engolem o erro num try/catch e leem ZERO regra: a guarda vira
 * verde à toa. `movimento` agora reprova se a varredura vier vazia.
 *
 * Etapa 3 (26/out): se o `run.js` subiu um navegador compartilhado, a suíte
 * se conecta a ele em vez de abrir um novo; `close()` numa conexão só fecha
 * os contextos desta suíte e desconecta. Rodada sozinha (`node test/x.js`),
 * abre o próprio navegador, como sempre.
 */
const { chromium } = require('playwright');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--allow-file-access-from-files'];
/* `extra`: flags que só esta suíte precisa (o `som` liga o autoplay) — com
   elas a suíte abre o navegador dela, porque o compartilhado já nasceu */
function abrir(extra) {
  if (process.env.CDF_NAVEGADOR && !extra) return chromium.connect(process.env.CDF_NAVEGADOR);
  return chromium.launch({ executablePath: CHROME, args: ARGS.concat(extra || []) });
}
module.exports = { abrir, CHROME, ARGS };
