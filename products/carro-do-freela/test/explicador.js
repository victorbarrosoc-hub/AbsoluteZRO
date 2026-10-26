/* O EXPLICADOR — CONTEÚDO PRIMEIRO (04/out) e SEM "COMO FUNCIONA" (17/out · 5).
 *
 * (17/out · 5) Victor: "explicação sobre como funciona … é cara de
 * protótipo". O botão saiu de todo cabeçalho: a tela fica com a linha
 * curta, que é o subtítulo, e o parágrafo longo fica recolhido sem porta —
 * explicação mora na Ajuda. Esta suíte guarda as duas metades: a linha
 * curta em toda tela, e nenhum "Como funciona" em lugar nenhum de dentro.
 *
 * A regra mudou de propósito, e esta suíte guarda a nova. Antes: o
 * parágrafo de topo aparecia inteiro na primeira visita e recolhia num
 * "?" a partir do carregamento seguinte. Medido na revisão de 04/out, isso
 * fazia Propostas abrir no celular com uma tela inteira de texto e nenhuma
 * proposta à vista. Victor pediu a plataforma "com cara de empresa
 * gigante", e aprovou o corte: toda tela abre NO CONTEÚDO.
 *
 * Agora: tela com `data-lead` mostra UMA linha curta e um "Como funciona"
 * que abre o parágrafo inteiro — desde a primeira visita, para sempre. O
 * que não tem `data-lead` (o comparativo das moedas) segue a regra antiga
 * da primeira visita, e quem guarda essa é `duas-moedas`.
 */
const { chromium } = require('playwright');
const path=require('path');
/* ⚠️ ORIGEM http: a suíte recarrega, e file:// perde localStorage. */
const {servir,URL}=require('./_servir.js');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const errs=[];p.on('pageerror',e=>errs.push('ERR: '+e.message));
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-entrou','1');
    localStorage.removeItem('cdf-uso');
  } catch(e) {} });
  await servir(p);
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(400);
  await p.evaluate(()=>show('pracas')); await p.waitForTimeout(300);

  const estado=async tab=>p.evaluate(tb=>{
    const pg=document.querySelector('p.explica[data-exp="'+tb+'"]');
    if(!pg) return null;
    const row=pg.previousElementSibling, bt=row&&row.querySelector('.explitog');
    const lc=row&&row.querySelector('.leadc');
    return { rec:pg.classList.contains('rec'), linha:!!lc, lead:lc?lc.textContent:'',
             dataLead:pg.dataset.lead, btVis:!!bt&&!bt.hidden&&bt.offsetParent!==null,
             aria:bt&&bt.getAttribute('aria-expanded'), rot:bt&&bt.textContent };
  },tab);

  /* ---- toda tela de topo tem a linha curta ---- */
  const sem=await p.evaluate(()=>[...document.querySelectorAll('p.lead.explica:not([data-lead])')].map(x=>x.dataset.exp));
  t(sem.length===0,'⟶⟶ nenhum parágrafo de topo ficou sem linha curta (data-lead): '+(sem.join(', ')||'todos têm'));

  /* ---- primeira visita: já abre na linha curta ---- */
  const e1=await estado('pracas');
  t(e1&&e1.rec,'⟶⟶ primeira visita: o parágrafo longo já vem recolhido — a tela abre no conteúdo');
  t(e1&&e1.linha&&e1.lead===e1.dataLead,'e a linha curta está no lugar dele: "'+(e1&&e1.lead)+'"');
  t(e1&&!e1.btVis,'⟶⟶ e SEM "Como funciona" do lado dela');
  const como=await p.evaluate(()=>{
    const r=[];
    for(const sec of document.querySelectorAll('section:not(#v-home)')){
      const was=sec.hidden; sec.hidden=false;
      if(/Como funciona/.test(sec.innerText)||sec.querySelector('.explitog.txt')) r.push(sec.id);
      sec.hidden=was;
    }
    return r;
  });
  t(como.length===0,'⟶⟶ nenhuma tela de dentro mostra "Como funciona": '+(como.join(', ')||'nenhuma'));

  /* ---- e continua assim depois de recarregar: não é regra de visita ---- */
  await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(400);
  const e4=await estado('pracas');
  t(e4&&e4.rec&&e4.linha,'no carregamento seguinte continua na linha curta');
  const e5=await estado('guildas');
  t(e5&&e5.rec&&e5.linha,'tela nunca visitada (guildas) também abre na linha curta');

  /* ---- a linha curta é UMA linha no computador ---- */
  const altas=await p.evaluate(()=>{
    const r=[];
    for(const sec of document.querySelectorAll('section')){
      const lc=sec.querySelector('.leadc'); if(!lc) continue;
      const was=sec.hidden; sec.hidden=false;
      const lh=parseFloat(getComputedStyle(lc).lineHeight)||22;
      if(lc.offsetParent&&lc.getBoundingClientRect().height>lh*1.5) r.push(sec.id);
      sec.hidden=was;
    }
    return r;
  });
  t(altas.length===0,'⟶⟶ cada linha curta cabe numa linha a 1280px: '+(altas.join(', ')||'todas'));

  await p.screenshot({path:path.join(__dirname,'saida','ex-recolhido.png')});

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();
