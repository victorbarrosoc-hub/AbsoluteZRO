const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1100},deviceScaleFactor:2});
  const errs=[];p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  p.on('pageerror',e=>errs.push('ERR: '+e.message));
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto('file://'+path.resolve(__dirname,'..','public','index.html'),{waitUntil:'networkidle'});

  /* ============ a moeda na home, antes de qualquer login ============ */
  await p.locator('#h-moeda').scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
  t(await p.locator('#h-moeda').isVisible(),'a home apresenta a moeda própria');
  t(/moeda própria/i.test(await p.locator('#h-moeda').textContent()),'e diz com todas as letras que existe moeda própria');
  t(await p.locator('#cv-moeda-home').isVisible(),'com a moeda em 3D girando na página');
  t(await p.evaluate(()=>!!moedaLoops['cv-moeda-home']),'o laço da moeda da home está rodando');
  t(/T\$ 1/.test(await p.locator('.moedapar').textContent()),'e a paridade fixa aparece junto');
  await p.locator('#h-moeda [data-ajuda="moeda"]').click(); await p.waitForTimeout(600);
  t(await p.locator('#v-ajuda').isVisible(),'o botão da home leva pro artigo do take');
  t(await p.evaluate(()=>!moedaLoops['cv-moeda-home']),'e a moeda da home para de girar fora da home');
  await p.evaluate(()=>show('home')); await p.waitForTimeout(200);

  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(350);

  await p.locator('#menu-bt:visible, #bt-menu:visible').first().click(); await p.waitForTimeout(300);
  /* desde 17/out · 10 a documentação mora no grupo Ajuda, recolhido */
  { const ab=p.locator('#gaveta [data-sanf="ajuda"] .mn-abre'); if(await ab.getAttribute('aria-expanded')!=='true'){ await ab.click(); await p.waitForTimeout(250) } }
  t(await p.locator('.gitem[data-ajuda="moeda"]').isVisible(),'item "O take" no menu lateral');
  await p.locator('.gitem[data-ajuda="moeda"]').click(); await p.waitForTimeout(600);
  t(await p.locator('#v-ajuda').isVisible(),'página de ajuda abre');
  const tit=await p.locator('#aj-tit').textContent();
  t(/take/i.test(tit),'título fala do take: "'+tit+'"');
  t(await p.locator('#cv-moeda').isVisible(),'canvas da moeda presente');

  // a moeda realmente desenha e realmente gira
  const px=async()=>p.locator('#cv-moeda').evaluate(cv=>{
    const c=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
    let soma=0,n=0; for(let i=0;i<c.length;i+=4*97){ soma+=c[i]+c[i+1]+c[i+2]; n++ }
    return Math.round(soma/n);
  });
  const a1=await px(); await p.waitForTimeout(700); const a2=await px();
  t(a1>0,'canvas não está em branco: '+a1);
  t(a1!==a2,'a moeda está girando ('+a1+' → '+a2+')');

  // paridade e o bloco do "não recarrega"
  const par=await p.locator('.paridade').textContent();
  t(/T\$\s*1/.test(par)&&/R\$\s*1,00/.test(par),'paridade 1:1 visível: '+par.replace(/\s+/g,' ').trim());
  const nv=await p.locator('.naovende').textContent();
  t(/recarregar/i.test(nv),'diz que não existe recarregar carteira');
  const corpo=await p.locator('#aj-corpo').textContent();
  t(/nasce de recebimento/i.test(corpo),'a regra "nasce de recebimento" está escrita');
  t(!/comprar take|compre take|recarregue/i.test(corpo),'em lugar nenhum oferece comprar take');
  await p.screenshot({path:require('path').join(__dirname,'saida','mo-1-dark.png'),fullPage:true});

  // o laço morre ao sair da tela
  await p.locator('#aj-back').click(); await p.waitForTimeout(500);
  const rodando=await p.evaluate(()=>!!moedaLoops['cv-moeda']);
  t(!rodando,'a animação para quando a página sai da tela');

  // e volta a rodar ao reabrir
  await p.locator('#menu-bt:visible, #bt-menu:visible').first().click(); await p.waitForTimeout(250);
  { const ab=p.locator('#gaveta [data-sanf="ajuda"] .mn-abre'); if(await ab.getAttribute('aria-expanded')!=='true'){ await ab.click(); await p.waitForTimeout(250) } }
  await p.locator('.gitem[data-ajuda="moeda"]').click(); await p.waitForTimeout(500);
  const b1=await px(); await p.waitForTimeout(600); const b2=await px();
  t(b1!==b2,'volta a girar ao reabrir ('+b1+' → '+b2+')');
  const umLoop=await p.evaluate(()=>typeof moedaLoops['cv-moeda']==='number');
  t(umLoop,'existe exatamente um laço ativo por moeda');

  // tema claro
  await p.evaluate(()=>document.documentElement.classList.add('app-light')); await p.waitForTimeout(700);
  const cl=await px();
  t(cl>0&&cl!==a1,'a moeda repinta no tema claro: '+cl);
  await p.screenshot({path:require('path').join(__dirname,'saida','mo-2-light.png'),fullPage:true});
  await p.evaluate(()=>document.documentElement.classList.remove('app-light')); await p.waitForTimeout(300);

  // mobile
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(500);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no mobile: '+ov);
  const larg=await p.locator('#cv-moeda').evaluate(e=>e.getBoundingClientRect().width);
  t(larg>120&&larg<=390,'moeda cabe na tela do celular: '+Math.round(larg)+'px');
  await p.screenshot({path:require('path').join(__dirname,'saida','mo-3-mobile.png')});

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();
