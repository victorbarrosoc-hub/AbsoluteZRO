/* CONSENTIMENTO E ORIGEM DO DADO (26/out · 3).
 *
 * Antes de abrir para o público, perfil de gente real precisa de consentimento
 * registrado e de origem conhecida. Esta suíte jura:
 *   1. a caixa "Mostrar meu perfil para quem contrata" nasce DESMARCADA
 *      (caixa pré-marcada não é consentimento) e diz que o WhatsApp nunca aparece;
 *   2. concluir sem marcar não registra consentimento, e a origem do perfil é
 *      "autodeclarado";
 *   3. marcar registra a versão do texto e a data; desmarcar depois registra a
 *      retirada (com data), e o registro sobrevive ao recarregar;
 *   4. os cadastros da prévia (seed fictício) não têm consentimento atribuído:
 *      ninguém fictício "autorizou" nada.
 */
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'public', 'index.html');
const ok = [], bad = []; const t = (c, m) => (c ? ok : bad).push(m);
(async () => {
  const b = await require('./_navegador.js').abrir();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('cdf-pv', '1'); localStorage.setItem('cdf-entrou', '1'); localStorage.setItem('cdf-guia', '1') } catch (e) {} });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 }).catch(() => {});
  await p.evaluate(() => { try { localStorage.removeItem('cdf-uso') } catch (e) {} });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 }).catch(() => {});

  await p.evaluate(() => { cdPasso = 1; abrirCadastro('meu'); document.querySelectorAll('#v-cadastro .pn').forEach(el => el.hidden = (+el.dataset.pn !== 1)) });
  await p.waitForTimeout(300);
  const caixa = await p.evaluate(() => { const c = document.getElementById('cd-consente'), l = c && c.closest('label');
    return { existe: !!c, marcada: c && c.checked, visivel: !!(c && c.offsetParent), texto: l && l.textContent.trim(), dica: l && l.title } });
  t(caixa.existe && caixa.visivel, '⟶⟶ a caixa de consentimento está no cadastro, à vista');
  t(caixa.marcada === false, 'e nasce DESMARCADA');
  t(caixa.texto === 'Mostrar meu perfil para quem contrata', 'texto curto: ' + caixa.texto);
  t(/WhatsApp nunca aparece/.test(caixa.dica || '') && /portfólio/.test(caixa.dica || ''), 'a dica diz o que é mostrado e que o WhatsApp nunca aparece');

  await p.evaluate(() => concluirCadastro()); await p.waitForTimeout(200);
  const sem = await p.evaluate(() => ({ c: EU.consentimento || null, o: EU.origem }));
  t(sem.c === null, '⟶⟶ concluir sem marcar não registra consentimento');
  t(sem.o === 'autodeclarado', 'e a origem do perfil é "autodeclarado"');

  await p.evaluate(() => { abrirCadastro('meu'); document.getElementById('cd-consente').checked = true; concluirCadastro() });
  await p.waitForTimeout(200);
  const com = await p.evaluate(() => EU.consentimento);
  t(com && com.mostrar === true && com.versao === '2026-10-26' && !isNaN(Date.parse(com.em)), '⟶⟶ marcar registra versão e data (' + JSON.stringify(com) + ')');
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 }).catch(() => {});
  const depois = await p.evaluate(() => { abrirCadastro('meu'); return { c: EU.consentimento, caixa: document.getElementById('cd-consente').checked } });
  t(depois.c && depois.c.mostrar === true && depois.caixa === true, 'o registro sobrevive ao recarregar, e a caixa volta marcada');

  await p.evaluate(() => { document.getElementById('cd-consente').checked = false; concluirCadastro() });
  const retirada = await p.evaluate(() => EU.consentimento);
  t(retirada && retirada.mostrar === false && !isNaN(Date.parse(retirada.em)), '⟶⟶ desmarcar registra a retirada, com data');

  const seed = await p.evaluate(() => CREW.filter(c => c !== EU && (c.consentimento || c.origem === 'autodeclarado')).length);
  t(seed === 0, '⟶⟶ ninguém da prévia (fictício) aparece como tendo autorizado algo (' + seed + ')');
  t(erros.length === 0, 'sem erro de página: ' + erros.slice(0, 2).join(' · '));

  await b.close();
  console.log('\n== OK =='); ok.forEach(x => console.log('  ✓ ' + x));
  if (bad.length) { console.log('\n== FALHAS =='); bad.forEach(x => console.log('  ✗ ' + x)) }
  console.log('\n' + ok.length + ' ok, ' + bad.length + ' falhas');
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
