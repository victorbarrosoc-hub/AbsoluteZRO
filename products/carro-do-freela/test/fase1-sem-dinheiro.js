/* A FASE 1 NÃO PROMETE DINHEIRO QUE ELA NÃO TEM (19/out).
 *
 * O critério de pronto mais importante da Fase 1 (PRD, seção 08): "nenhuma
 * tela promete garantia, custódia ou pagamento que ainda não existe". A
 * home da fase já era guardada pela `versoes`; DENTRO do app não era. A
 * revisão de 19/out achou, no build da Fase 1:
 *
 *   - propostas com "pagamento garantido" e "Sinal de 20% já reservado";
 *   - a agenda com "Em custódia R$ 3.650" e "Garantido — liberando";
 *   - o cancelamento falando em "sinal retido";
 *   - o comparativo de Montar equipe com "Contrato + sinal" e a coluna da
 *     Frota (que nem existe na fase — e desalinhava a tabela);
 *   - Planos e a assinatura vendendo "Taxa de 6% por job" e a Frota;
 *   - o caixa do Volante aceitando pedágio e saldo da carteira, duas moedas
 *     que a fase não mostra em lugar nenhum;
 *   - o brinde de P$ 200 na primeira entrada.
 *
 * E, numa segunda passada, nos MODAIS, que a varredura de tela não abre: a
 * consulta com "Pagar com sinal e contrato", o convite de quem chamou por
 * fora oferecendo o sinal, e a proposta aceita "com o sinal retido".
 *
 * ⚠️ A pergunta 5 do cadastro é conferida NO CARTÃO MONTADO, não só no
 * objeto: o getter respondia certo depois do arranque enquanto o cadastro
 * em foco nem chegava a ser montado (TDZ do `faseTem`, 19/out · 2).
 *
 * O conserto é o desenho de sempre — um portão onde a função decide
 * (garStatus, temDeposito, detPlano, pagamento, darPedagio) — e esta suíte
 * varre o TEXTO VISÍVEL das telas da fase, dos dois lados, atrás disso.
 * E confere o outro lado: no build completo tudo continua lá.
 */
const { chromium } = require('playwright');
const path = require('path');
const ok = [], bad = []; const t = (c, m) => (c ? ok : bad).push(m);
const RE = /garantid|sinal de \d|\bsinal\b|cust[óo]dia|retid|taxa de \d|ped[áa]gio|P\$ ?\d|saldo da carteira/i;

/* `novo`: conta que entra pela PRIMEIRA vez — é nela que o brinde de
   boas-vindas cai (com cdf-entrou já marcado, ele nunca viria, e "ninguém
   ganha pedágio" passaria à toa) */
async function entrar(b, arq, lado, novo) {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(novo => { try { localStorage.setItem('cdf-pv', '1'); if (!novo) localStorage.setItem('cdf-entrou', '1'); localStorage.removeItem('cdf-uso') } catch (e) {} }, !!novo);
  await p.goto('file://' + path.resolve(__dirname, '..', 'public', arq));
  await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 9000 }).catch(() => {});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(250);
  if (lado === 'contratante') await p.locator('[data-lgtipo="contratante"]').click();
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(500);
  return { p, errs };
}
/* o texto visível de uma raiz que casa com a régua do dinheiro */
const achados = (p, sel) => p.evaluate(({ sel, re }) => {
  const R = new RegExp(re, 'i'), out = new Set(), raiz = document.querySelector(sel);
  if (!raiz) return [];
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    const el = n.parentElement; if (!el || el.offsetParent === null || el.closest('.pfuturo')) continue;
    if (R.test(n.textContent)) out.add((el.innerText || n.textContent).trim().replace(/\s+/g, ' ').slice(0, 90));
  }
  return [...out];
}, { sel, re: RE.source });

(async () => {
  const b = await require('./_navegador.js').abrir();

  /* ============ Fase 1: o texto das telas, dos dois lados ============ */
  for (const lado of ['freela', 'contratante']) {
    const { p, errs } = await entrar(b, 'fase-1.html', lado, lado === 'freela');
    const telas = lado === 'freela'
      ? ['feed', 'propostas', 'agenda', 'jobs', 'meu', 'planos', 'brecho', 'achar', 'cadastro']
      : ['feed', 'propostas', 'equipe', 'passar', 'jobs', 'minhaprod', 'planos', 'brecho', 'buscar'];
    for (const tela of telas) {
      await p.evaluate(x => show(x), tela); await p.waitForTimeout(250);
      const a = await achados(p, '#v-' + tela);
      t(!a.length, 'Fase 1 · ' + lado + ' · ' + tela + ': nenhuma promessa de garantia, sinal, custódia, taxa ou moeda' + (a.length ? ' — ' + a.slice(0, 3).join(' | ') : ''));
    }
    if (lado === 'freela') {
      /* o cadastro passo a passo: a pergunta 5 não fala em "receber com garantia" */
      const q = await p.evaluate(() => (CAD_PERG.find(x => x.st === 5) || {}).t);
      t(q === 'Como você se identifica?', 'a pergunta do passo 5 na Fase 1 é sobre identificação, não sobre garantia (' + q + ')');
      const cart = await p.evaluate(() => { const q = CAD_PERG.find(x => x.st === 5);
        return { foco: !!document.querySelector('#v-cadastro.foco'), t: q && q.box ? q.box.querySelector('.cdq-t').textContent : null } });
      t(cart.foco && cart.t === 'Como você se identifica?', '⟶⟶ e o cadastro em foco é montado, com essa pergunta no cartão (' + JSON.stringify(cart) + ')');
      /* o convite de quem chamou por fora: sem o sinal opcional */
      await p.evaluate(() => { abrirConvite(); verConvite() }); await p.waitForTimeout(200);
      const cv = await p.evaluate(() => ({ escondido: v('cv2-sinal').hidden, caixa: !!v('cv2-sn') }));
      const cvTxt = await achados(p, '#ovl-cv2');
      t(cv.escondido && !cv.caixa && !cvTxt.length, 'o convite de quem chamou por fora não oferece sinal na Fase 1' + (cvTxt.length ? ' — ' + cvTxt.join(' | ') : ''));
      await p.evaluate(() => fecharConvite2());
      /* a proposta aceita: sem "sinal retido" */
      const aceita = await p.evaluate(() => { const pr = PROPOSTAS.find(x => x.status === 'novo' && x.gar && !x.chamadaId);
        if (!pr) return null; aceitar(pr.id); show('propostas'); return pr.id });
      await p.waitForTimeout(300);
      const pTxt = await achados(p, '#v-propostas');
      t(aceita && !pTxt.length, 'aceitar uma proposta semeada com garantia não fala em sinal retido' + (pTxt.length ? ' — ' + pTxt.join(' | ') : ''));
      t(await p.evaluate(() => pedagio()) === 0, 'ninguém ganha pedágio na primeira entrada da Fase 1');
    } else {
      /* o comparativo: só Carona e Volante, e cada linha com 2 células */
      const cmp = await p.evaluate(() => { show('equipe'); const c = document.querySelector('#v-equipe .cmp'); if (!c) return null;
        return { cab: [...c.querySelectorAll('.ccab.cplano b')].map(x => x.textContent), cel: c.children.length,
          virar: [...c.querySelectorAll('[data-virar]')].map(x => x.dataset.virar) } });
      t(cmp && cmp.cab.join() === 'Carona,Volante', 'o comparativo da Fase 1 tem só Carona e Volante (' + (cmp && cmp.cab) + ')');
      t(cmp && cmp.cel % 3 === 0, 'e cada linha tem as três células da grade — a tabela não desalinha (' + (cmp && cmp.cel) + ')');
      t(cmp && cmp.virar.join() === 'volante', 'e o único botão de assinar é o do Volante');
      /* a assinatura: sem Frota, sem taxa, sem pedágio nem carteira no caixa */
      await p.evaluate(() => abrirAssinatura('frota')); await p.waitForTimeout(300);
      const as = await p.evaluate(() => ({
        frota: [...document.querySelectorAll('#as-plano [data-pl]')].filter(x => x.offsetParent !== null).map(x => x.dataset.pl),
        seg: !v('as-plano').hidden, escolhido: planoEscolhido,
        lista: v('as-lista').innerText, comp: v('as-comp').textContent,
        metodos: [...document.querySelectorAll('#as-pgm [data-m]')].map(x => x.dataset.m) }));
      t(as.escolhido === 'volante' && !as.seg && !as.frota.includes('frota'), '⟶⟶ pedir a Frota na Fase 1 abre o Volante, sem a chave da Frota');
      t(!RE.test(as.lista) && !as.comp, 'a lista do Volante não cita taxa nem sinal, e não compara com a Frota');
      t(as.metodos.join() === 'pix,cartao', '⟶⟶ o caixa da Fase 1 é Pix e cartão — sem pedágio nem saldo da carteira (' + as.metodos + ')');
      /* a consulta a quem aceita garantia: acerto direto, e a proposta nasce sem gar */
      await p.evaluate(() => { fecharAssinatura && fecharAssinatura(); abrirConsulta(CREW.find(c => c.gar && !c.me).id) });
      await p.waitForTimeout(300);
      const mTxt = await achados(p, '#ovl');
      t(!mTxt.length, 'a consulta a quem aceita garantia não oferece sinal nem contrato na Fase 1' + (mTxt.length ? ' — ' + mTxt.join(' | ') : ''));
      await p.evaluate(() => v('m-send').click()); await p.waitForTimeout(250);
      const env = await p.evaluate(() => ({ gar: PROPOSTAS[0].gar, txt: v('ok-txt').textContent + ' ' + v('ok-res').innerText }));
      t(env.gar === false && !RE.test(env.txt), 'e a consulta enviada nasce em acerto direto, sem falar em sinal (' + env.txt.slice(0, 90) + ')');
    }
    t(!errs.length, 'Fase 1 · ' + lado + ' sem exceção: ' + errs.slice(0, 2).join(' · '));
    await p.close();
  }

  /* ============ o build completo continua inteiro ============ */
  {
    const { p } = await entrar(b, 'index.html', 'freela', true);
    await p.evaluate(() => abrirConsulta(CREW.find(c => c.gar && !c.me).id)); await p.waitForTimeout(250);
    t(await p.evaluate(() => /sinal/i.test(v('m-gar').innerText)), 'no build completo a consulta a quem aceita garantia continua oferecendo sinal e contrato');
    await p.evaluate(() => { v('ovl').hidden = true; abrirConvite(); verConvite() }); await p.waitForTimeout(200);
    t(await p.evaluate(() => !v('cv2-sinal').hidden && !!v('cv2-sn')), 'e o convite continua oferecendo o sinal opcional');
    await p.evaluate(() => fecharConvite2());
    await p.evaluate(() => show('agenda')); await p.waitForTimeout(250);
    t(await p.evaluate(() => { const k = v('k-cust').closest('.kpi'); return k && k.offsetParent !== null }), 'no build completo a agenda continua com "Em custódia"');
    await p.evaluate(() => show('propostas')); await p.waitForTimeout(250);
    t((await achados(p, '#v-propostas')).some(x => /garantid/i.test(x)), 'e as propostas continuam com "pagamento garantido"');
    t(await p.evaluate(() => pedagio()) > 0, 'e o brinde de boas-vindas continua chegando');
    await p.evaluate(() => abrirAssinatura('frota')); await p.waitForTimeout(300);
    const as = await p.evaluate(() => ({ escolhido: planoEscolhido, lista: v('as-lista').innerText,
      metodos: [...document.querySelectorAll('#as-pgm [data-m]')].map(x => x.dataset.m) }));
    t(as.escolhido === 'frota' && /taxa/i.test(as.lista), 'e a assinatura da Frota continua vendendo a taxa menor');
    t(as.metodos.includes('ped'), 'e o caixa continua aceitando o pedágio');
    await p.close();
  }
  await b.close();
  console.log(ok.length + ' ok, ' + bad.length + ' falhas');
  bad.forEach(m => console.log('  ✗ ' + m));
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
