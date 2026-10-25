/**
 * SOFTSKILL — o que a função não conta.
 *
 * Pedido do Victor: declarar no cadastro, LOGO DEPOIS das funções, e
 * aparecer no perfil para quem contrata.
 *
 * O que esta suíte protege:
 *   - o campo existe no passo 2 do cadastro, depois das funções;
 *   - cadastro e Meu perfil são o MESMO dado (um muda, o outro mostra);
 *   - o teto de 8 vale nos dois;
 *   - aparece no perfil público — que é a razão de existir;
 *   - ninguém real é semeado com softskill: só o dono declara a sua.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1100},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>{ if(m.type()!=='error') return;
    if(/web3forms/.test((m.location()&&m.location().url)||'')) return; errs.push(m.text()); });
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(450);

  /* ============ ninguém real nasce com softskill ============ */
  const semeadas=await p.evaluate(()=>CREW.filter(c=>!c.me&&(c.soft||[]).length).length);
  t(semeadas===0,'nenhum cadastro real é semeado com softskill — só o dono declara a sua');

  /* ============ está no cadastro, no passo das funções ============ */
  await p.evaluate(()=>show('cadastro')); await p.waitForTimeout(350);
  await p.locator('[data-st="2"]').click(); await p.waitForTimeout(350);
  t(await p.locator('#cd-soft').isVisible(),'o campo está no passo 2 do cadastro');
  const ordem=await p.evaluate(()=>{
    const f=document.getElementById('cd-func').getBoundingClientRect().top;
    const s=document.getElementById('cd-soft').getBoundingClientRect().top;
    const n=document.getElementById('cd-nicho').getBoundingClientRect().top;
    return {depoisDaFuncao:s>f, antesDoNicho:s<n};
  });
  t(ordem.depoisDaFuncao,'logo DEPOIS das funções, como pedido');
  t(ordem.antesDoNicho,'e antes dos tipos de trabalho');
  t(/desempata/.test(await p.locator('#cd-soft').locator('..').locator('..').textContent()),
    'a tela diz para que serve: desempatar entre dois iguais');

  /* sugestão de um toque — no celular digitar oito vezes é o que faz pular o campo */
  const nsug=await p.locator('[data-softpoe]').count();
  t(nsug>=6,'as sugestões são chip de um toque ('+nsug+')');
  await p.locator('[data-softpoe]').first().click(); await p.waitForTimeout(250);
  t(await p.evaluate(()=>EU.soft.length)===1,'tocar na sugestão declara a softskill');

  /* texto livre */
  await p.locator('#cd-soft-novo').fill('Conduzo bem uma sonora');
  await p.locator('#cd-soft-add').click(); await p.waitForTimeout(250);
  t(await p.evaluate(()=>EU.soft.includes('Conduzo bem uma sonora')),'e dá para escrever a sua');
  t(await p.locator('#cd-soft .eqchip').count()===2,'as duas viram chip com o × para tirar');

  /* não duplica */
  await p.locator('#cd-soft-novo').fill('conduzo bem uma sonora');
  await p.locator('#cd-soft-add').click(); await p.waitForTimeout(250);
  t(await p.evaluate(()=>EU.soft.length)===2,'a mesma coisa escrita de novo não duplica');

  /* ============ um dado, dois lugares ============ */
  await p.evaluate(()=>show('meu')); await p.waitForTimeout(400);
  /* ⚠️ "Meu perfil" virou sanfona em 23/ago: a página tinha 7,9 telas de
     iPhone com tudo aberto, e agora abre como índice. O bloco que esta
     suíte mede precisa ser aberto — que é o que a pessoa faz. */
  await p.evaluate(()=>{ if(typeof pfLer==="function"){
    ["Demoreel","Trabalhos publicados","Clientes","O que a função não conta","Meu equipamento","Tabela e regras"]
      .forEach(k=>pfLer().add(k));
    sanfonaPerfil();
  }});
  await p.waitForTimeout(350);

  t(await p.locator('#pf-soft .eqchip').count()===2,
    'o que foi declarado no cadastro já está no Meu perfil — é um dado só');
  await p.locator('#pf-soft-novo').fill('Primeiros socorros');
  await p.locator('#pf-soft-add').click(); await p.waitForTimeout(250);
  await p.evaluate(()=>show('cadastro')); await p.waitForTimeout(300);
  await p.locator('[data-st="2"]').click(); await p.waitForTimeout(300);
  t(await p.locator('#cd-soft .eqchip').count()===3,'e o caminho de volta também vale');

  /* teto de 8 */
  await p.evaluate(()=>{ EU.soft=['a','b','c','d','e','f','g','h']; drawSoft(); });
  await p.locator('#cd-soft-novo').fill('mais uma');
  await p.locator('#cd-soft-add').click(); await p.waitForTimeout(250);
  t(await p.evaluate(()=>EU.soft.length)===8,'no oitavo o campo para de aceitar');
  t(await p.locator('[data-softpoe]').count()===0,'e as sugestões somem em vez de mentir que cabem');

  /* tirar */
  await p.locator('#cd-soft [data-softdel]').first().click(); await p.waitForTimeout(250);
  t(await p.evaluate(()=>EU.soft.length)===7,'o × tira');

  /* ============ o contratante vê ============ */
  await p.evaluate(()=>{ EU.soft=['Rápido na entrega','Dirijo van/caminhão']; drawSoft(); });
  await p.evaluate(()=>abrirPerfil(EU.id)); await p.waitForTimeout(450);
  const pub=await p.locator('#p-soft').textContent();
  t(/Rápido na entrega/.test(pub)&&/Dirijo van/.test(pub),
    'no perfil público as duas aparecem — que é a razão de o campo existir');
  t(await p.locator('#p-soft span').count()===2,'como chips, ao lado do nome');

  /* perfil de quem não declarou não inventa nada */
  const outro=await p.evaluate(()=>CREW.find(c=>!c.me).id);
  await p.evaluate(id=>abrirPerfil(id),outro); await p.waitForTimeout(400);
  t((await p.locator('#p-soft').textContent()).trim()==='',
    'e o perfil de quem não declarou fica vazio, sem inventar');

  /* mobile */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(300);
  await p.evaluate(()=>show('cadastro')); await p.waitForTimeout(300);
  await p.locator('[data-st="2"]').click(); await p.waitForTimeout(300);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no celular: '+ov);

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();
