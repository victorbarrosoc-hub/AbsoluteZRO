const { chromium } = require('playwright');
const path=require('path');
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--autoplay-policy=no-user-gesture-required']});
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

  /* espiona o Web Audio: registra que nós foram criados, sem precisar ouvir */
  await p.evaluate(()=>{
    window.__sons=[];
    const AC=window.AudioContext;
    const of=AC.prototype.createOscillator, bf=AC.prototype.createBufferSource;
    AC.prototype.createOscillator=function(){window.__sons.push("osc");return of.call(this)};
    AC.prototype.createBufferSource=function(){window.__sons.push("ruido");return bf.call(this)};
  });

  out.somPadrao=await p.evaluate(()=>SOM);
  out.botaoSomExiste=await p.evaluate(()=>!!document.getElementById('g-som'));

  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(300);
  out.aposPrimeiroClique=await p.evaluate(()=>window.__sons.length);
  out.contextoCriado=await p.evaluate(()=>!!ac && ac.state);

  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(400);
  const n1=await p.evaluate(()=>window.__sons.length);

  /* trocar de aba usa "passo" (ruído) */
  await p.evaluate(()=>window.__sons=[]);
  await p.locator('.tab[data-tab="agenda"]').click(); await p.waitForTimeout(250);
  out.abaGeraRuido=await p.evaluate(()=>window.__sons.includes("ruido"));

  /* a travessia de tela cheia é do momento em que a chamada SAI, não do
     botão que leva até a tela — montar equipe é de contratante, troca de
     lado antes */
  await p.evaluate(()=>{MODO="contratante";ASSINANTE=true;aplicarModo()}); await p.waitForTimeout(250);
  await p.locator('.tab[data-tab="equipe"]').click(); await p.waitForTimeout(350);
  await p.evaluate(()=>{VAGAS.length=0;VAGAS.push({id:1,func:"Op. de câmera",quem:null});drawEquipe()});
  await p.waitForTimeout(250);
  await p.locator('#e-passar').click(); await p.waitForTimeout(160);
  out.miniCarroNoBotao=await p.evaluate(()=>v('e-passar').classList.contains('rodou'));
  out.travessiaAindaNao=!(await p.locator('#pista').isVisible());
  await p.waitForTimeout(500);

  await p.evaluate(()=>window.__sons=[]);
  await p.locator('#u-send').click(); await p.waitForTimeout(160);
  out.pistaVisivel=await p.locator('#pista').isVisible();
  out.motorTemOscEruido=await p.evaluate(()=>({osc:window.__sons.filter(x=>x==="osc").length,
    ruido:window.__sons.filter(x=>x==="ruido").length}));
  await p.screenshot({path:require('path').join(__dirname,'saida','som-carro.png')});
  await p.waitForTimeout(1700);
  out.pistaSumiu=!(await p.locator('#pista').isVisible());

  /* volta para o lado de freela: o resto da suíte usa telas de freela */
  await p.evaluate(()=>{MODO="freela";aplicarModo()}); await p.waitForTimeout(250);

  /* desligar silencia tudo */
  await p.evaluate(()=>{show("pracas")}); await p.waitForTimeout(250);
  await p.evaluate(()=>{abrirGaveta();document.getElementById('g-som').click();fecharGaveta()}); await p.waitForTimeout(250);
  out.somDepoisDeDesligar=await p.evaluate(()=>SOM);
  await p.evaluate(()=>window.__sons=[]);
  await p.locator('.tab[data-tab="brecho"]').click(); await p.waitForTimeout(300);
  await p.locator('.tab[data-tab="agenda"]').click(); await p.waitForTimeout(300);
  out.silencioTotal=await p.evaluate(()=>window.__sons.length)===0;
  out.iconeMudou=await p.evaluate(()=>{abrirGaveta();const r=document.getElementById('g-som-t').textContent;fecharGaveta();return r.includes('desligado')});

  /* religar toca a assinatura na hora */
  await p.evaluate(()=>window.__sons=[]);
  await p.evaluate(()=>{abrirGaveta();document.getElementById('g-som').click();fecharGaveta()}); await p.waitForTimeout(300);
  out.religouEToca=await p.evaluate(()=>window.__sons.length)>0;

  /* a escolha sobrevive ao recarregar */
  await p.evaluate(()=>{abrirGaveta();document.getElementById('g-som').click();fecharGaveta()}); await p.waitForTimeout(200);
  await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(400);
  out.lembrouDesligado=await p.evaluate(()=>SOM)===false;
  await p.evaluate(()=>{try{localStorage.removeItem("cf-app-som")}catch(e){}});

  out.ov=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  out.errs=errs;
  console.log(JSON.stringify(out,null,1));
  await b.close();
})();
