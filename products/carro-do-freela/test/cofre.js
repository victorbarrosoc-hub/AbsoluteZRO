/* O COFRE — painel financeiro dos dois lados, sem conta própria.
 *
 * O que esta suíte jura:
 * 1. O COFRE NÃO INVENTA NÚMERO: cada total é rederivável das mesmas
 *    fontes das telas de sempre (JOBS/garStatus/recebido; PAGOS/ESCALAS/
 *    faseVaga). A asserção refaz a conta pelas primitivas e compara com o
 *    que está pintado.
 * 2. Metas e guardas são escritas PELA pessoa, sobrevivem ao reload, e
 *    apagar a meta NÃO apaga o registro do dinheiro.
 * 3. "Nada de dinheiro dentro do Cofre" está ESCRITO na tela — é a linha
 *    regulatória, não um detalhe.
 * 4. Acerto direto nunca aparece como se a plataforma fosse cobrar.
 *
 * ⚠️ Origem http (test/_servir.js): o teste de persistência recarrega, e
 * file:// descarta localStorage ~1 em 14 vezes.
 */
const { chromium } = require('playwright');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const {servir,URL}=require('./_servir.js');
const PRE=pg=>pg.addInitScript(()=>{ try{
  localStorage.setItem('cdf-pv','1');
  localStorage.setItem('cdf-entrou','1');
  localStorage.setItem('cdf-guia','1');
}catch(e){} });

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const ctx=await b.newContext({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await servir(p); await PRE(p);
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(170);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);
  await p.evaluate(()=>show('cofre')); await p.waitForTimeout(900);

  /* ============ a moldura honesta ============ */
  let m=await p.evaluate(()=>({
    visivel:!v('v-cofre').hidden,
    aviso:(document.querySelector('#v-cofre .aviso')||{}).textContent||'',
    limite:(document.querySelector('#v-cofre .limite')||{}).textContent||'',
    explica:!!document.querySelector('.explica[data-exp="cofre"]'),
    noMenu:(pintarGaveta(),v('g-ferr').textContent.includes('Cofre'))
  }));
  t(m.visivel,'a view do cofre abre');
  /* (17/out · 5) A PRÉVIA SE DECLARA NUM LUGAR SÓ. Victor: "tira as mensagens
     de protótipo". O banner desta tela saiu; quem diz o que é ilustrativo é o
     selo "Prévia" ao lado da marca — e é ele que esta asserção cobra. */
  t(!m.aviso&&await p.evaluate(()=>[...document.querySelectorAll('[data-previa]')].some(b=>b.offsetParent!==null)),'sem banner de demonstração no Cofre — a prévia se declara no selo');
  t(/Nada de dinheiro dentro do Cofre/.test(m.limite),'a linha regulatória está escrita: nada de dinheiro aqui');
  t(/não recebe/.test(m.limite)&&/não guarda/.test(m.limite),'e diz o que ele NÃO faz, com verbos');
  t(m.explica,'o explicador da tela existe e recolhe como os outros');
  t(m.noMenu,'o Cofre está no menu, grupo Você');

  /* ============ visão do freela: números rederiváveis ============ */
  m=await p.evaluate(()=>{
    const tiles=[...document.querySelectorAll('#cof-mes .coft b')].map(x=>x.textContent);
    const abertos=JOBS.filter(j=>!j.hold&&!recebido(j));
    const gar=abertos.filter(j=>garStatus(j)).reduce((t,j)=>t+j.valor,0);
    const dir=abertos.filter(j=>!garStatus(j)).reduce((t,j)=>t+j.valor,0);
    const entrou=cofEntradasFreela().reduce((t,e)=>t+e.valor,0);
    return {tiles,esp:[brl(entrou),brl(gar),brl(dir),brl(cofTaxasFreela())]};
  });
  t(m.tiles.length===4,'quatro medidores na visão');
  t(m.tiles[0]===m.esp[0],'“Entrou” = jobs recebidos + vendas da carteira: '+m.tiles[0]);
  t(m.tiles[1]===m.esp[1],'“Garantido a caminho” = a MESMA conta da custódia da agenda: '+m.tiles[1]);
  t(m.tiles[2]===m.esp[2],'“Direto” = o que falta combinar por fora: '+m.tiles[2]);
  t(m.tiles[3]===m.esp[3],'“Taxas” = só o que saiu de venda/impulso — job não desconta do freela');

  m=await p.evaluate(()=>({
    cols:document.querySelectorAll('.cofcol').length,
    altas:[...document.querySelectorAll('.cofcol u')].filter(u=>+u.style.getPropertyValue('--h')>0).length,
    rotulo:(document.querySelector('.cofbars')||{}).getAttribute?.('aria-label')||''
  }));
  t(m.cols===8,'o gráfico cobre 8 semanas');
  t(m.altas>0,'e alguma barra subiu — as entradas semeadas aparecem');
  t(/semana/.test(m.rotulo),'o gráfico se apresenta ao leitor de tela');

  /* ============ a receber: prazo, nome e a régua do vencido ============ */
  await p.click('[data-cof="fluxo"]'); await p.waitForTimeout(400);
  m=await p.evaluate(()=>{
    const abertos=JOBS.filter(j=>!j.hold&&!recebido(j));
    const gar=abertos.filter(j=>garStatus(j)).reduce((t,j)=>t+j.valor,0);
    const dir=abertos.filter(j=>!garStatus(j)).reduce((t,j)=>t+j.valor,0);
    return {
      rot:v('cof-aba-fluxo').textContent,
      linhas:document.querySelectorAll('#cof-fluxo .coflin').length,
      esperado:abertos.length,
      vencida:!!document.querySelector('#cof-fluxo .cofvence'),
      tot:(document.querySelector('#cof-fluxo .coftot')||{}).textContent||'',
      espTot:[brl(gar),brl(dir),brl(gar+dir)]
    };
  });
  t(m.rot==='A receber','do lado do freela a aba se chama A receber');
  t(m.linhas===m.esperado,'uma linha por job em aberto: '+m.linhas);
  t(m.vencida,'entrega antiga sem pagamento aparece VENCIDA, em magenta');
  t(m.tot.includes(m.espTot[0])&&m.tot.includes(m.espTot[1])&&m.tot.includes(m.espTot[2]),
    'os três totais fecham com as primitivas (garantia + direto = tudo)');

  /* ============ metas e cofre: a pessoa escreve, o cofre soma ============ */
  await p.click('[data-cof="metas"]'); await p.waitForTimeout(300);
  await p.fill('#cof-m-nome','FX3 usada'); await p.fill('#cof-m-alvo','20000');
  await p.click('#cof-m-add'); await p.waitForTimeout(250);
  await p.fill('#cof-g-qto','5000'); await p.fill('#cof-g-onde','poupança');
  await p.selectOption('#cof-g-meta',{index:1});
  await p.click('#cof-g-add'); await p.waitForTimeout(450);
  m=await p.evaluate(()=>({
    num:(document.querySelector('.cofmeta .mnum')||{}).textContent||'',
    barra:+((document.querySelector('.cofmbar i')||{style:{getPropertyValue:()=>0}}).style.getPropertyValue('--h')),
    total:(document.querySelector('#cof-metas .coftot')||{}).textContent||''
  }));
  t(/R\$ 5\.000/.test(m.num)&&/faltam/.test(m.num)&&/15\.000/.test(m.num),
    'a meta diz o que tem e o que falta: '+m.num.trim());
  t(m.barra===25,'a barra anda exatamente o guardado/alvo: '+m.barra+'%');
  t(/5\.000/.test(m.total),'o total registrado soma o ledger');

  /* bater a meta muda a frase */
  await p.fill('#cof-g-qto','15000'); await p.fill('#cof-g-onde','conta PJ');
  await p.selectOption('#cof-g-meta',{index:1});
  await p.click('#cof-g-add'); await p.waitForTimeout(400);
  m=await p.evaluate(()=>({
    batida:!!document.querySelector('.cofbatida'),
    barra:+document.querySelector('.cofmbar i').style.getPropertyValue('--h')
  }));
  t(m.batida,'meta batida vira frase de chegada, não número quebrado');
  t(m.barra===100,'e a barra para no cheio — nunca passa de 100');

  /* apagar a meta NÃO apaga o dinheiro registrado */
  await p.click('[data-mdel]'); await p.waitForTimeout(350);
  m=await p.evaluate(()=>({metas:METAS.length,guardas:GUARDAS.length,
    orfa:GUARDAS.every(g=>g.meta===null)}));
  t(m.metas===0,'a meta saiu');
  t(m.guardas===2&&m.orfa,'os registros FICAM, agora sem meta — dinheiro guardado não some com a meta');

  /* ============ persistência: o caderno sobrevive ao reload ============ */
  await p.goto(URL,{waitUntil:'networkidle'}); await p.waitForTimeout(700);
  m=await p.evaluate(()=>({guardas:GUARDAS.length,onde:(GUARDAS[0]||{}).onde||''}));
  t(m.guardas===2,'as guardas voltam depois do reload');
  t(m.onde.length>2,'com o "onde" que a pessoa escreveu: '+m.onde);

  /* ============ o lado de quem contrata ============ */
  await p.evaluate(()=>{ MODO='contratante'; aplicarModo(); cofAba='mes'; show('cofre') });
  await p.waitForTimeout(800);
  m=await p.evaluate(()=>{
    const tiles=[...document.querySelectorAll('#cof-mes .coft b')].map(x=>x.textContent);
    const vagas=cofVagasProd();
    const vivas=vagas.filter(g=>['contrato','ativa','conferir'].includes(g.fase));
    const falta=vivas.reduce((t,g)=>t+(g.x.valor-depositado(g.x)),0);
    const dir=vagas.filter(g=>g.fase==='direto').reduce((t,g)=>t+g.x.valor,0);
    return {tiles,esp:[brl(pagoTot()+pagoRetido()+taxaPagaProd()),brl(pagoRetido()),brl(falta),brl(dir)]};
  });
  t(m.tiles[0]===m.esp[0],'“Já saiu” = liberado + retido + taxas: '+m.tiles[0]);
  t(m.tiles[1]===m.esp[1],'“Retido” é o MESMO pagoRetido de Vendas');
  t(m.tiles[2]===m.esp[2],'“Falta na entrega” refeito por faseVaga/depositado bate');
  t(m.tiles[3]===m.esp[3],'“Direto por fora” idem');

  /* as escalas semeadas são todas do modelo antigo (custódia): para provar a
     linha do acerto direto, uma vaga vira direto ANTES — mesma cirurgia de
     estado que as outras suítes fazem, e o esperado é recontado depois. */
  await p.evaluate(()=>{ const e=ESCALAS.find(e=>(e.equipe||[]).length>1); e.equipe[1].gar=false });
  await p.evaluate(()=>{ cofAba='fluxo'; drawCofre() }); await p.waitForTimeout(300);
  m=await p.evaluate(()=>({
    rot:v('cof-aba-fluxo').textContent,
    linhas:document.querySelectorAll('#cof-fluxo .coflin').length,
    esperado:cofVagasProd().filter(g=>g.fase!=='liberado').length,
    porFora:[...document.querySelectorAll('#cof-fluxo .coflin b')].some(b=>/por fora/.test(b.textContent)),
    nota:(document.querySelector('#cof-fluxo .note')||{}).textContent||''
  }));
  t(m.rot==='A pagar','do lado de quem contrata a aba vira A pagar');
  t(m.linhas===m.esperado,'uma linha por PESSOA em cada escala: '+m.linhas);
  t(m.porFora,'acerto direto sai como "por fora" — o Cofre lembra, não cobra');
  t(/lembra, não cobra/.test(m.nota),'e a nota diz isso com todas as letras');

  /* vaga entregue cobra a conferência de quem contrata */
  m=await p.evaluate(()=>{
    const e=ESCALAS.find(e=>(e.equipe||[]).length); const x=e.equipe[0];
    Object.assign(x,{gar:true,sinal:sinalDe(x.valor),taxa:taxaDe(x.valor),
      assFreela:true,assProd:true,entregue:true,recebido:false});
    drawCofFluxo();
    return {urg:/falta VOCÊ conferir/.test(v('cof-fluxo').textContent)};
  });
  t(m.urg,'vaga entregue aparece cobrando a SUA conferência — é ela que libera o resto');

  /* ============ som e acento ============ */
  m=await p.evaluate(()=>{
    SOM=false;
    cofAba='metas'; drawCofre(true);            /* não pode estourar sem som */
    const solidos=[...document.querySelectorAll('#cof-metas .cofform .btn')]
      .filter(b=>!b.classList.contains('gh')).length;
    return {solidos};
  });
  t(m.solidos===1,'um acento só nos formulários: Registrar — criar meta é fantasma');

  t(errs.length===0,'zero erro de console/página'+(errs.length?' — '+errs[0]:''));

  console.log('COFRE');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();
