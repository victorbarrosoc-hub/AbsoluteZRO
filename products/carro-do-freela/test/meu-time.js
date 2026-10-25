const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const entrarContratante=async p=>{
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto('file://'+path.resolve(__dirname,'..','public','index.html'),{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(450);
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(350);
  await p.locator('#as-f').click(); await p.waitForTimeout(300);
};
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1200},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await entrarContratante(p);
  await p.locator('.tab[data-tab="equipe"]').click(); await p.waitForTimeout(500);

  /* ---- o painel existe e está agrupado por função ---- */
  const grupos=await p.locator('#e-time .tfunc').count();
  const linhas=await p.locator('#e-time .tp').count();
  t(grupos>=4,'favoritos agrupados por função: '+grupos+' grupos');
  t(linhas>=grupos,'com gente em cada grupo: '+linhas+' linhas');
  const funcs=await p.locator('#e-time .tfunc > .lab').allTextContents();
  t(funcs.join()===[...funcs].sort((a,b)=>a.localeCompare(b,'pt')).join(),'funções em ordem alfabética');
  const catalogo=await p.evaluate(()=>FUNCOES);
  t(funcs.every(f=>catalogo.includes(f)),'toda função do painel está no catálogo');

  /* ---- estado na data escolhida ---- */
  const selos=await p.locator('#e-time .selo').allTextContents();
  t(selos.length===linhas,'toda linha diz o estado na data');
  t(selos.some(x=>/Na escuta/.test(x)),'tem gente livre marcada');
  const cab=(await p.locator('#e-time .thd').textContent()).replace(/\s+/g,' ');
  t(/favoritos? · \d+ livres? em/.test(cab),'cabeçalho resume quantos e quantos livres: "'+cab+'"');
  /* o número do cabeçalho bate com o que dá para escalar */
  const nLivre=+cab.match(/· (\d+) livre/)[1];
  t(nLivre===await p.locator('#e-time .tp:not([disabled])').count(),'e o número bate com os escaláveis: '+nLivre);

  /* ---- quem não está livre não é clicável, mas aparece ---- */
  const ocupados=await p.locator('#e-time .tp[disabled]').count();
  t(ocupados>0,'quem está ocupado ou segurando aparece assim mesmo: '+ocupados);
  t(await p.locator('#e-time .tp[disabled] .selo').first().textContent().then(x=>!/Na escuta/.test(x)),'e o selo dele não diz "na escuta"');

  /* ---- escalar com um clique ---- */
  const alvo=p.locator('#e-time .tp:not([disabled])').first();
  const nome=(await alvo.locator('.nm b').textContent()).trim();
  const func=(await alvo.evaluate(e=>e.closest('.tfunc').querySelector('.lab').textContent)).trim();
  await alvo.click(); await p.waitForTimeout(450);
  const vagas=await p.evaluate(()=>VAGAS.map(x=>({f:x.func,q:x.quem})));
  t(vagas.length===1,'clicar cria uma vaga: '+vagas.length);
  t(vagas[0].f===func,'na função do grupo em que ele estava: '+vagas[0].f);
  const escalado=await p.evaluate(id=>{const v=VAGAS[0];const c=CREW.find(x=>x.id===v.quem);return c&&titulo(c.nome)},null);
  t(escalado===nome,'e já vem preenchida com a pessoa: '+escalado);
  const naVaga=await p.locator('#e-vagas [data-sel]').first().evaluate(e=>e.selectedOptions[0].textContent);
  t(naVaga.includes(nome.split(' ')[0]),'a vaga na escala mostra a pessoa: '+naVaga);

  /* quem já está na escala vira "na escala" e para de ser clicável.
     O rótulo perdeu o "já" quando virou chip: dentro de um chip a
     palavra a mais é ruído, e o [disabled] já diz que não dá pra clicar. */
  const marcado=await p.locator('#e-time .tp[disabled] .add').allTextContents();
  t(marcado.some(x=>/na escala/.test(x)),'quem entrou vira "na escala"');
  await p.screenshot({path:require('path').join(__dirname,'saida','mt-escalado.png'),fullPage:true});

  /* ---- trocar a data repinta o estado ---- */
  const antes=await p.locator('#e-time .tp:not([disabled])').count();
  const selosAntes=(await p.locator('#e-time .selo').allTextContents()).join();
  await p.locator('#scrub .day').nth(5).click(); await p.waitForTimeout(600);
  const selosDepois=(await p.locator('#e-time .selo').allTextContents()).join();
  t(selosAntes!==selosDepois,'trocar a data muda quem está livre');
  const cab2=(await p.locator('#e-time .thd').textContent()).replace(/\s+/g,' ');
  t(!cab2.includes(cab.split('em ')[1]),'e o cabeçalho passa a falar da data nova');

  /* ---- a estrela alimenta o painel ---- */
  const n0=await p.evaluate(()=>FAV.size);
  await p.evaluate(()=>show('buscar')); await p.waitForTimeout(500);
  await p.locator('#rows .star[aria-pressed="false"]').first().click(); await p.waitForTimeout(300);
  t(await p.evaluate(()=>FAV.size)===n0+1,'favoritar na busca aumenta o time');
  await p.locator('.tab[data-tab="equipe"]').click(); await p.waitForTimeout(500);
  const cab3=await p.locator('#e-time .thd').textContent();
  t(cab3.includes((n0+1)+' favoritos'),'e o painel já conta a pessoa nova: '+cab3.replace(/\s+/g,' '));

  /* ---- sem favorito, estado vazio que ensina ---- */
  await p.evaluate(()=>{FAV.clear();drawEquipe()}); await p.waitForTimeout(300);
  t(await p.locator('#e-time .vazio3').count()===1,'sem estrela, o painel explica para que serve');
  t(await p.locator('#e-time .tp').count()===0,'e não lista ninguém');

  /* ---- o painel é do contratante assinante ---- */
  await p.evaluate(()=>{ASSINANTE=false;aplicarModo()}); await p.waitForTimeout(400);
  t(await p.locator('#e-time .tp').count()===0,'sem assinatura o painel não mostra ninguém');
  t(await p.locator('#e-time .thd').count()===0,'nem o cabeçalho');

  /* ---- mobile ---- */
  await p.evaluate(()=>{ASSINANTE=true;aplicarModo()}); await p.waitForTimeout(300);
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no mobile: '+ov);
  await p.screenshot({path:require('path').join(__dirname,'saida','mt-mobile.png')});

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();
