/* VAGAS E OPORTUNIDADES (17/out · 9) — produção publica, freela mostra interesse.
 *
 * Victor aprovou a tela ("pode executar o que vc solicitou e sugeriu"). A
 * REGRA que esta suíte jura é a que segura o modelo de negócio: PUBLICAR
 * vaga é do Volante — o mesmo degrau de Passar o carro —, e VER e MOSTRAR
 * INTERESSE é de graça. Se o Carona publicasse, a vaga pública seria o
 * Passar o carro de graça e esvaziaria o Volante (o risco que o PRD já
 * registra como "feed que vira classificado").
 *
 * E as duas regras de dado de sempre: a diária da vaga sai da faixa da
 * praça (REFERENCIA), nunca escrita à mão; e o interesse que chega na vaga
 * de demonstração é SIMULAÇÃO e se declara como tal.
 *
 * Roda em origem http (_servir.js): o interesse tem de sobreviver ao reload,
 * e reload em file:// perde localStorage de vez em quando. */
const { chromium } = require('playwright');
const path=require('path');
const {servir,URL}=require('./_servir.js');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);

async function abrir(b,vp,lado){
  const ctx=await b.newContext(vp);
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  p.errs=errs;
  await servir(p);
  await p.addInitScript(()=>{ try{
    localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-entrou','1'); localStorage.setItem('cdf-guia','1');
  }catch(e){} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
  await p.locator('[data-lgtipo="'+lado+'"]').click(); await p.waitForTimeout(170);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);
  return p;
}

(async()=>{
  const b=await require('./_navegador.js').abrir();

  /* ============ 1. a porta existe, nos dois lados e no celular ============ */
  let p=await abrir(b,{viewport:{width:1440,height:900}},'freela');
  let m=await p.evaluate(()=>{
    const vis=e=>e&&e.offsetParent!==null;
    const lado=vis(document.querySelector('.top .tab[data-tab="vagas"]'));
    MODO='contratante'; aplicarModo();
    const ladoC=vis(document.querySelector('.top .tab[data-tab="vagas"]'));
    MODO='freela'; aplicarModo();
    return {lado,ladoC};
  });
  t(m.lado&&m.ladoC,'⟶⟶ Vagas tem porta na lateral, do lado do freela e do lado de quem contrata');

  /* ============ 2. o que vem semeado ============ */
  await p.evaluate(()=>show('vagas')); await p.waitForTimeout(500);
  m=await p.evaluate(()=>{
    const nomes=new Set(CREW.map(c=>titulo(c.nome)));
    return {
      n:VGP.length,
      linhas:document.querySelectorAll('#vgp-lista .vgp-it').length,
      diariaDaPraca:VGP.every(g=>{ const r=REFERENCIA[g.func]||[600,1000];
        return g.diaria===Math.round((r[0]+r[1])/2/50)*50 }),
      funcoesDaBase:VGP.every(g=>FUNCOES.includes(g.func)),
      tiposDoCatalogo:VGP.every(g=>TIPOS.includes(g.tipo)),
      ninguemReal:VGP.every(g=>!nomes.has(g.de)),
      nenhumaMinha:VGP.every(g=>!g.minha),
      cabeca:(document.querySelector('#v-vagas .pghero h1')||{}).textContent||'',
      pubFreela:(document.getElementById('vgp-pub')||{hidden:true}).hidden
    };
  });
  t(m.n>=5&&m.linhas===m.n,'a tela abre com as vagas da praça: '+m.linhas);
  t(m.diariaDaPraca,'⟶⟶ a diária de toda vaga é a da FAIXA DA PRAÇA (REFERENCIA), nunca escrita à mão');
  t(m.funcoesDaBase&&m.tiposDoCatalogo,'função e tipo saem dos catálogos fechados (FUNCOES, TIPOS)');
  t(m.ninguemReal,'quem publica as vagas semeadas é produtora fictícia, nunca um dos perfis');
  t(m.nenhumaMinha,'e nenhuma nasce como "sua"');
  t(/Vagas e oportunidades/.test(m.cabeca),'o cabeçalho diz o que é a tela');
  t(m.pubFreela,'o freela não vê "Publicar vaga"');

  /* ============ 3. filtrar ============ */
  m=await p.evaluate(()=>{
    const tipo=VGP[0].tipo;
    document.querySelector('#vgp-tipos [data-vgt="'+tipo+'"]').click();
    const so=[...document.querySelectorAll('#vgp-lista [data-vgabre]')].map(b=>VGP.find(g=>g.id===b.dataset.vgabre).tipo);
    document.querySelector('#vgp-tipos [data-vgt=""]').click();
    const minha=(EU.func||[]);
    v('vgp-sominha').checked=true; drawVagas();
    const dele=[...document.querySelectorAll('#vgp-lista [data-vgabre]')].map(b=>VGP.find(g=>g.id===b.dataset.vgabre).func);
    v('vgp-sominha').checked=false; drawVagas();
    return {tipo,so,dele,minha};
  });
  t(m.so.length>0&&m.so.every(x=>x===m.tipo),'o filtro de tipo deixa só aquele tipo: '+m.tipo);
  t(m.dele.every(f=>m.minha.includes(f)),'"Só da minha função" deixa só as vagas das funções que o freela declarou');

  /* ============ 4. mostrar interesse é de graça, e sobrevive ============ */
  await p.locator('[data-vgabre="vg1"]').click(); await p.waitForTimeout(300);
  t(await p.locator('#ovl-vgp').isVisible(),'tocar na vaga abre o detalhe');
  t(/faixa da praça/.test(await p.locator('#vgp-fatos').textContent()),'e o detalhe diz de onde vem a diária');
  await p.locator('#vgp-quero').click(); await p.waitForTimeout(300);
  m=await p.evaluate(()=>({int:VGP_INT.includes('vg1'),bt:v('vgp-quero').textContent,
    planoFreela:PLANO_FREELA||'base'}));
  t(m.int&&/Retirar/.test(m.bt),'⟶⟶ "Tenho interesse" registra o interesse — de graça, no plano '+m.planoFreela);
  await p.locator('#vgp-salvar').click(); await p.waitForTimeout(200);
  await p.locator('#vgp-x').click(); await p.waitForTimeout(200);
  t(await p.locator('[data-vgsal="vg1"]').getAttribute('aria-pressed')==='true','salvar marca a vaga na lista');
  t(/interesse enviado/.test(await p.locator('[data-vgabre="vg1"]').textContent()),'e a linha diz que o interesse foi');
  await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1200);
  m=await p.evaluate(()=>({int:VGP_INT.includes('vg1'),sal:VGP_SALVAS.includes('vg1')}));
  t(m.int&&m.sal,'⟶⟶ interesse e salvos sobrevivem ao recarregar — são declaração da pessoa (DEPOSITOS)');
  t(p.errs.length===0,'freela: zero erro de console/página'+(p.errs.length?' — '+p.errs[0]:''));
  await p.context().close();

  /* ============ 5. publicar é do Volante ============ */
  p=await abrir(b,{viewport:{width:1440,height:900}},'contratante');
  await p.evaluate(()=>show('vagas')); await p.waitForTimeout(400);
  t(await p.locator('#vgp-pub').isVisible(),'quem contrata vê "Publicar vaga" no cabeçalho');
  t(!await p.locator('#vgp-quero').isVisible(),'e não tem "Tenho interesse" (interesse é de quem trabalha na função)');
  const antes=await p.evaluate(()=>VGP.length);
  await p.locator('#vgp-pub').click(); await p.waitForTimeout(300);
  m=await p.evaluate(()=>({tranca:!v('vgp-tranca').hidden,txt:v('vgp-tranca').textContent,
    modal:!v('ovl-vgpn').hidden,n:VGP.length}));
  t(m.tranca&&!m.modal,'⟶⟶ no Carona, "Publicar vaga" mostra a vitrine em vez do formulário');
  t(/Volante/.test(m.txt)&&/R\$\s?89/.test(m.txt),'e a vitrine diz o degrau e o preço: Volante, R$ 89');
  t(/de graça/.test(m.txt),'e diz o que continua de graça');
  t(m.n===antes,'nenhuma vaga nasce sem o degrau');

  await p.evaluate(()=>{ ASSINANTE=true; aplicarModo(); show('vagas') }); await p.waitForTimeout(300);
  t(!await p.locator('#vgp-tranca').isVisible(),'com o Volante a vitrine sai de cena');
  await p.locator('#vgp-pub').click(); await p.waitForTimeout(300);
  t(await p.locator('#ovl-vgpn').isVisible(),'e "Publicar vaga" abre o formulário');
  await p.selectOption('#vgpn-func','Op. de câmera');
  await p.fill('#vgpn-tit','Institucional de escola');
  const nota=await p.locator('#vgpn-diaria').textContent();
  await p.locator('#vgpn-ok').click(); await p.waitForTimeout(400);
  m=await p.evaluate(()=>{ const g=VGP.find(x=>x.minha);
    const r=REFERENCIA['Op. de câmera'];
    return {tem:!!g,tit:g&&g.titulo,diaria:g&&g.diaria,ref:Math.round((r[0]+r[1])/2/50)*50,
      minhas:document.querySelectorAll('#vgp-minhas .vgp-it').length,
      naLista:!!document.querySelector('#vgp-lista [data-vgabre="'+(g&&g.id)+'"]')} });
  t(m.tem&&m.tit==='Institucional de escola','⟶⟶ com o Volante a vaga é publicada');
  t(m.diaria===m.ref&&new RegExp(m.ref.toLocaleString('pt-BR').replace('.','\\.')).test(nota),
    'e a diária é a da faixa da praça, dita no formulário antes de publicar: '+m.diaria);
  t(m.minhas===1&&!m.naLista,'a vaga própria aparece em "Suas vagas", fora da lista das outras produções');

  /* o outro lado é simulado, e se declara */
  await p.waitForTimeout(6200);
  m=await p.evaluate(()=>{ const g=VGP.find(x=>x.minha);
    return {n:g.int.length,
      todosLivres:g.int.every(id=>{const c=CREW.find(x=>x.id===id);return c&&c.func.includes(g.func)&&status(c,g.off)==='livre'}),
      sim:[...document.querySelectorAll('#avisos .avz')].filter(a=>/Interesse na sua vaga/.test(a.textContent)).every(a=>/simulação/.test(a.textContent)),
      avisos:[...document.querySelectorAll('#avisos .avz')].filter(a=>/Interesse na sua vaga/.test(a.textContent)).length} });
  t(m.n>0&&m.todosLivres,'chegam interessados — só gente com a função e livre na data: '+m.n);
  t(m.avisos>0&&m.sim,'⟶⟶ e todo aviso de interesse se declara simulação');
  t(p.errs.length===0,'contratante: zero erro de console/página'+(p.errs.length?' — '+p.errs[0]:''));
  await p.context().close();

  /* ============ 6. no celular ============ */
  p=await abrir(b,{viewport:{width:390,height:844},isMobile:true},'freela');
  m=await p.evaluate(()=>{
    abrirGaveta();
    const porta=[...document.querySelectorAll('.gaveta .gitem')].some(e=>e.offsetParent&&/Vagas/.test(e.textContent));
    fecharGaveta(); show('vagas');
    return {porta};
  });
  await p.waitForTimeout(500);
  m.ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  m.fileira=await p.evaluate(()=>new Set([...document.querySelectorAll('#vgp-tipos button')].map(x=>Math.round(x.getBoundingClientRect().top))).size);
  t(m.porta,'no celular a porta é o menu (a barra de baixo já está cheia)');
  t(m.ov<=1,'sem rolagem lateral na página: '+m.ov);
  t(m.fileira===1,'os tipos ficam numa fileira só, que rola de lado');
  await p.context().close();

  console.log('VAGAS');
  ok.forEach(x=>console.log('  ✓ '+x));
  bad.forEach(x=>console.log('  ✗ '+x));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();
