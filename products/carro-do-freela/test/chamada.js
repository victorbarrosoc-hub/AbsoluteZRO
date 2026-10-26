const { chromium } = require('playwright');
const path=require('path');
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

async function entrar(p){
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  /* montar equipe e passar as vagas abertas são da conta de contratante */
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(300);
  /* a conta de contratante é paga: fecha a assinatura para seguir */
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(350); await p.locator('#as-f').click(); await p.waitForTimeout(300);
}

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const out={};

  /* ---------- A: simulação vence a corrida ---------- */
  const p=await b.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const errs=[];p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await entrar(p);
  await p.locator('.tab[data-tab="passar"]').click(); await p.waitForTimeout(300);
  // garante que EU esteja entre os candidatos: função de Victor
  await p.evaluate(()=>{v("u-func").value=EU.func[0];v("u-cidade").value=EU.cidade;CHAMADA=null;drawPassar()});
  await p.waitForTimeout(250);
  out.candidatos=await p.locator('#u-list .sl').count();
  out.euNaLista=await p.evaluate(()=>!![...document.querySelectorAll('#u-list .sl')].find(r=>+r.dataset.id===EU.id));
  await p.locator('#u-cli').fill('Produtora Maré');
  await p.locator('#u-desc').fill('Segunda câmera na cobertura do evento.');
  const propsAntes=await p.evaluate(()=>PROPOSTAS.length);
  await p.locator('#u-send').click(); await p.waitForTimeout(300);
  out.propsDepois=await p.evaluate(()=>PROPOSTAS.length);
  out.badgeAposChamada=await p.locator('#bg-top').textContent();
  out.abertaTxt=(await p.locator('#u-result').textContent()).replace(/\s+/g,' ').trim().slice(0,80);
  out.camposTravados=await p.locator('#u-cli').isDisabled();
  await p.screenshot({path:require('path').join(__dirname,'saida','c-aberta.png')});

  await p.waitForTimeout(9000);
  out.vencedor=await p.evaluate(()=>CHAMADA&&CHAMADA.vencedor?CREW.find(c=>c.id===CHAMADA.vencedor).nome:null);
  out.status=await p.locator('#u-status').textContent();
  out.preenchidas=await p.locator('#u-list .resp.perdeu').count();
  out.recusas=await p.locator('#u-list .resp.nao2').count();
  await p.screenshot({path:require('path').join(__dirname,'saida','c-fechada.png')});
  // minha proposta virou perdida
  await p.locator('.tab[data-tab="propostas"]').click(); await p.waitForTimeout(300);
  out.minhaPerdida=await p.evaluate(()=>{const x=PROPOSTAS.find(y=>y.chamadaId);return x?x.status:null});
  out.txtPerdida=await p.locator('.prop').filter({hasText:'Vaga preenchida'}).first().locator('.pfech').textContent().catch(()=>null);
  await p.screenshot({path:require('path').join(__dirname,'saida','c-perdida.png'),fullPage:true});
  out.errsA=errs;

  /* ---------- B: eu ganho a corrida, vindo de uma vaga aberta ---------- */
  const q=await b.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const errsB=[];q.on('pageerror',e=>errsB.push('ERR: '+e.message));
  q.on('console',m=>m.type()==='error'&&errsB.push(m.text()));
  await entrar(q);
  await q.locator('.tab[data-tab="equipe"]').click(); await q.waitForTimeout(250);
  // adiciona a vaga da função do Victor e deixa aberta
  await q.evaluate(()=>{VAGAS.push({id:1,func:EU.func[0],quem:null});v("e-cidade").value=EU.cidade;drawEquipe()});
  await q.waitForTimeout(200);
  await q.locator('#e-passar').click(); await q.waitForTimeout(300);
  out.veioDaVaga=await q.evaluate(()=>vagaOrigem);
  out.funcPreset=await q.locator('#u-func').inputValue();
  out.cliPreset=await q.locator('#u-cli').inputValue();
  await q.locator('#u-send').click(); await q.waitForTimeout(300);
  out.vagaGuardada=await q.evaluate(()=>CHAMADA.vaga);
  // aceita rápido pela caixa
  await q.locator('.tab[data-tab="propostas"]').click(); await q.waitForTimeout(300);
  const semContra=await q.evaluate(()=>{
    const pr=PROPOSTAS.find(x=>x.chamadaId);
    const card=document.querySelector('.prop[data-p="'+pr.id+'"]');
    return {temContra:!!card.querySelector('[data-ct]'), pill:card.querySelector('.pill').textContent};
  });
  out.chamadaSemContra=semContra;
  const jobsAntes=await q.evaluate(()=>JOBS.length);
  await q.evaluate(()=>{const pr=PROPOSTAS.find(x=>x.chamadaId);document.querySelector('[data-ac="'+pr.id+'"]').click()});
  await q.waitForTimeout(400);
  out.jobsCriados=await q.evaluate(()=>JOBS.length)-jobsAntes;
  out.euVenceu=await q.evaluate(()=>CHAMADA.vencedor===EU.id);
  await q.waitForTimeout(9000);
  out.vencedorFinal=await q.evaluate(()=>CHAMADA.vencedor===EU.id?"eu":"outro");
  out.vagaPreenchida=await q.evaluate(()=>{const vg=VAGAS.find(x=>x.id===1);return vg?vg.quem===EU.id:null});
  await q.locator('.tab[data-tab="passar"]').click(); await q.waitForTimeout(300);
  out.painelVencedor=(await q.locator('#u-result .vencedor').textContent()).replace(/\s+/g,' ').trim().slice(0,110);
  out.temVerNaEscala=await q.locator('#u-ver').count();
  await q.screenshot({path:require('path').join(__dirname,'saida','c-ganhei.png')});
  await q.locator('#u-ver').click(); await q.waitForTimeout(300);
  out.foiParaEscala=await q.locator('#v-equipe').isVisible();
  await q.screenshot({path:require('path').join(__dirname,'saida','c-escala.png')});
  out.ov=await q.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  out.errsB=errsB;

  console.log(JSON.stringify(out,null,1));
  await b.close();
})();
