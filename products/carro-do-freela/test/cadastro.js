const { chromium } = require('playwright');
const path=require('path');
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const errs=[];p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  const out={};
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});

  /* pela tela de login, sem topbar */
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  /* ⚠️ 17/out · 13: "Criar conta" deixou de abrir o cadastro direto — ele
     põe o cartão no modo de criar, e criar a conta (e-mail e senha) é que
     leva ao perfil. É o caminho de quem chega, então o teste passa por ele. */
  await p.locator('#lg-cad').click(); await p.waitForTimeout(150);
  await p.locator('#lg-email').fill('nova@exemplo.com'); await p.locator('#lg-senha').fill('senha123');
  await p.locator('#lg-ok').click(); await p.waitForTimeout(400);
  out.cadVis=await p.locator('#v-cadastro').isVisible();
  out.topbarEscondida=!(await p.locator('#topbar').isVisible());
  out.pct0=await p.locator('#cd-pct').textContent();
  out.faltando=await p.evaluate(()=>ITENS.filter(i=>!i.ok()).map(i=>i.t));
  out.selo0=(await p.locator('#cd-selo').textContent()).replace(/\s+/g,' ').trim().slice(0,60);
  await p.screenshot({path:require('path').join(__dirname,'saida','cd-1.png')});

  /* preencher o telefone leva a 100 */
  await p.locator('#cd-fone').fill('84999990000'); await p.waitForTimeout(250);
  out.pct100=await p.locator('#cd-pct').textContent();
  out.barraCheia=await p.locator('#cd-bar.full').count();

  /* zerar: vê o cadastro de quem chega agora */
  await p.locator('#cd-zero').click(); await p.waitForTimeout(350);
  out.pctZero=await p.locator('#cd-pct').textContent();
  out.verZero=await p.evaluate(()=>EU.ver);
  out.principalZero=await p.evaluate(()=>EU.principal.join("/"));
  out.tabelaVazia=(await p.locator('#cd-tab tbody').textContent()).replace(/\s+/g,' ').trim().slice(0,50);
  out.restauraVisivel=await p.locator('#cd-restaura').isVisible();
  await p.screenshot({path:require('path').join(__dirname,'saida','cd-zero.png')});

  /* ⚠️ A PORTA FICOU CURTA (22/ago). Quem chega por "entrar" vê DUAS
     etapas, não seis — as outras quatro continuam na mesma tela, mas só
     aparecem para quem entra por "Completar cadastro", em Meu perfil.
     Esta suíte mede o cadastro INTEIRO, então ela pede a porta longa; a
     porta curta tem suíte própria em `porta-e-tabela`. */
  out.portaCurtaEtapas=await p.locator('.stp:not([hidden])').count();
  out.portaCurtaSaida=await p.evaluate(()=>!v('cd-fim2').hidden);
  await p.evaluate(()=>{ cadTodo=true; drawCadPasso(); }); await p.waitForTimeout(250);
  out.portaLongaEtapas=await p.locator('.stp:not([hidden])').count();

  /* subir passo a passo */
  await p.locator('#cd-cidade').selectOption('Natal/RN'); await p.waitForTimeout(150);
  await p.locator('#cd-fone').fill('84999990000'); await p.waitForTimeout(150);
  await p.locator('#cd-port').fill('@novofreela'); await p.waitForTimeout(150);
  const p1=await p.locator('#cd-pct').textContent();
  await p.locator('.stp[data-st="2"]').click(); await p.waitForTimeout(200);
  await p.locator('#cd-func [data-cf="Op. de câmera"]').click(); await p.waitForTimeout(120);
  await p.locator('#cd-func [data-cf="Editor"]').click(); await p.waitForTimeout(120);
  await p.locator('#cd-nicho [data-cn="Corporativo"]').click(); await p.waitForTimeout(200);
  const p2=await p.locator('#cd-pct').textContent();
  await p.locator('.stp[data-st="3"]').click(); await p.waitForTimeout(200);
  await p.locator('#cd-cam').fill('Sony FX30'); await p.waitForTimeout(120);
  await p.locator('#cd-lentes').fill('18-35 / 28-75'); await p.waitForTimeout(120);
  await p.locator('#cd-transp').selectOption('CARRO'); await p.waitForTimeout(120);
  await p.locator('#cd-dro').check(); await p.waitForTimeout(200);
  const p3=await p.locator('#cd-pct').textContent();
  await p.locator('.stp[data-st="4"]').click(); await p.waitForTimeout(200);
  out.linhasTabela=await p.locator('#cd-tab tbody tr').count();
  /* ⚠️ DUAS COLUNAS POR FUNÇÃO desde 22/ago: "Só eu" (`data-cb`) e "Com meu
     equipamento" (`data-ce`). Quem preenche só uma TEM tabela — o piso é o
     que ele declarou. */
  out.colunasTabela=await p.locator('#cd-tab thead th').count();
  await p.locator('#cd-tab [data-cb="Op. de câmera"]').fill('950'); await p.waitForTimeout(150);
  await p.locator('#cd-tab [data-ce="Op. de câmera"]').fill('1300'); await p.waitForTimeout(150);
  await p.locator('#cd-hex').fill('110'); await p.waitForTimeout(120);
  await p.locator('#cd-desl').fill('200'); await p.waitForTimeout(200);
  const p4=await p.locator('#cd-pct').textContent();
  await p.locator('.stp[data-st="5"]').click(); await p.waitForTimeout(200);
  await p.locator('#cd-gar').check(); await p.waitForTimeout(150);
  out.exigeLiberado=!(await p.locator('#cd-exige').isDisabled());
  await p.locator('#cd-gcal').click(); await p.waitForTimeout(150);
  out.gcalTxt=await p.locator('#cd-gcal').textContent();
  out.progresso=[out.pctZero,p1,p2,p3,p4];
  out.passosOk=await p.locator('.stp.pronto').count();
  await p.screenshot({path:require('path').join(__dirname,'saida','cd-5.png')});

  await p.locator('.stp[data-st="6"]').click(); await p.waitForTimeout(250);
  out.passo6=await p.locator('#cd-w-lista').isVisible();
  await p.locator('#cd-fim').click(); await p.waitForTimeout(350);
  out.foiParaPracas=await p.locator('#v-pracas').isVisible();
  out.pctFinal=await p.evaluate(()=>EU.compl);
  out.verFinal=await p.evaluate(()=>EU.ver);

  /* o perfil e a busca refletem o novo cadastro */
  await p.evaluate(()=>abrirPerfil(EU.id)); await p.waitForTimeout(300);
  out.subPerfil=await p.locator('#p-sub').textContent();
  out.complPerfil=await p.evaluate(()=>document.querySelector('#p-rep .rp:nth-child(4) b').textContent);
  await p.locator('.pt[data-pt="equip"]').click(); await p.waitForTimeout(200);
  out.camPerfil=await p.evaluate(()=>[...document.querySelectorAll('#p-eq .eqrow')].map(r=>r.textContent.replace(/\s+/g,' ').trim()).slice(0,3));
  await p.screenshot({path:require('path').join(__dirname,'saida','cd-perfil.png'),fullPage:true});

  /* medidor em Meu perfil */
  await p.locator('.tab[data-tab="meu"]').click(); await p.waitForTimeout(300);
  out.mpPct=await p.locator('#mp-pct').textContent();
  /* ⚠️ "MEU PERFIL" VIROU SANFONA (23/ago): a página tinha 7,9 telas de
     iPhone com tudo aberto, e agora abre como índice. A tabela mora dentro
     do bloco "Tabela e regras", então quem quer medi-la abre o bloco —
     que é o que a pessoa faz. */
  await p.evaluate(()=>{ pfLer().add('Tabela e regras'); sanfonaPerfil(); });
  await p.waitForTimeout(300);
  out.mpTabela=await p.locator('#pr-tab tbody tr').count();
  await p.screenshot({path:require('path').join(__dirname,'saida','cd-meu.png')});
  /* o medidor e o "Completar cadastro" ficam FORA da sanfona, no topo:
     é a promessa que a porta curta faz, e promessa atrás de seta fechada
     não é promessa */
  const t2=await p.locator('#mp-cad').isVisible();
  out.completarSempreVisivel=t2;
  await p.locator('#mp-cad').click(); await p.waitForTimeout(250);
  out.voltaPorMeu=await p.locator('#v-cadastro').isVisible();
  out.topbarVisivel=await p.locator('#topbar').isVisible();
  await p.locator('#cd-back').click(); await p.waitForTimeout(250);
  out.voltou=await p.locator('#v-meu').isVisible();

  out.ov=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  const m=await b.newPage({viewport:{width:390,height:844}});
  const errsM=[];m.on('pageerror',e=>errsM.push('ERR: '+e.message));
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await m.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await m.goto(URL,{waitUntil:'networkidle'});
  await m.locator('.homenav .entrar-cta').click(); await m.waitForTimeout(200);
  await m.locator('#lg-cad').click(); await m.waitForTimeout(150);
  await m.locator('#lg-email').fill('nova@exemplo.com'); await m.locator('#lg-senha').fill('senha123');
  await m.locator('#lg-ok').click(); await m.waitForTimeout(400);
  await m.screenshot({path:require('path').join(__dirname,'saida','cd-mobile.png')});
  out.ovm=await m.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  out.errs=errs;out.errsM=errsM;
  console.log(JSON.stringify(out,null,1));
  await b.close();
})();
