/* O LOTE DO USO REAL (29/ago)
 *
 * Sete pedidos do Victor depois de usar a plataforma num pedido de verdade
 * (o teste do Teatro Riachuelo). Cada bloco guarda um deles:
 *   1. o detalhe do job abre EMBAIXO do card tocado no celular;
 *   2. o DONO do job de fora edita o próprio job;
 *   3. material do job: link e arquivo, com a honestidade dos documentos;
 *   4. a OD aceita PDF — como anexo pronto, não como leitura;
 *   5. viaja a trabalho: declarado, visível, filtrável;
 *   6. a janela do dia na escuta — meia diária possível, sem hora inventada;
 *   7. a caderneta de voo derivada dos jobs, com o aviso do que ela NÃO é.
 */
const { chromium } = require('playwright');
const path = require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const errs=[];
  const entrar=async larg=>{
    const ctx=await b.newContext({viewport:{width:larg,height:900},isMobile:larg<=820});
    const p=await ctx.newPage();
    p.on('pageerror',e=>errs.push('ERR: '+e.message));
    p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
    await p.addInitScript(()=>{ try{
      localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-entrou','1');
      localStorage.setItem('cdf-guia','1'); }catch(e){} });
    await p.goto(URL);
    await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:20000}).catch(()=>{});
    await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
    await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(150);
    await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);
    return {ctx,p};
  };

  /* ============ 1+2+3: o painel do job, no celular ============ */
  {
    const {ctx,p}=await entrar(390);
    await p.evaluate(()=>{show('jobs');drawJobs()}); await p.waitForTimeout(250);
    await p.evaluate(()=>[...document.querySelectorAll('#jb-lista .jcard')][1].click());
    await p.waitForTimeout(450);
    const r1=await p.evaluate(()=>{
      const det=document.getElementById('jb-det');
      const on=document.querySelector('#jb-lista .jcard.on');
      return {embaixo:on&&on.nextElementSibling===det,
        aindaUm:document.querySelectorAll('#jb-det').length===1};
    });
    t(r1.embaixo,'⟶⟶ no celular o detalhe abre EMBAIXO do card tocado, não depois da lista inteira');
    t(r1.aindaUm,'e continua sendo UM elemento movido, não uma cópia — ids não duplicam');

    const r2=await p.evaluate(()=>{
      const id=Math.max(0,...ESCALAS.map(e=>e.id))+1;
      ESCALAS.push({id,off:9,nome:"Aftermovie da feira",cliente:"Amigo de mercado",
        ini:"14:00",fim:"20:00",local:"Centro de convenções",tipo:"Fechado por fora",
        chamada:"14:00 no local",brief:"registrado por mim",refs:[],deFora:true,
        equipe:[{quem:EU.id,func:"Op. de câmera",valor:900}]});
      jobAberto=id; drawJobs();
      const det=document.getElementById('jb-det');
      const bt=[...det.querySelectorAll('[data-edit]')];
      return {temEditar:bt.length===1,rot:bt.length?bt[0].textContent:''};
    });
    t(r2.temEditar&&/Editar job/.test(r2.rot),
      '⟶⟶ o DONO do job de fora vê "Editar job" mesmo de chapéu de freela — era o defeito: '
      +'todo portão olhava para o chapéu, nenhum para o dono');
    await p.evaluate(()=>document.querySelector('#jb-det [data-edit]').click());
    await p.waitForTimeout(350);
    const r3=await p.evaluate(()=>{
      const det=document.getElementById('jb-det');
      const campos=[...det.querySelectorAll('[data-edj]')].map(x=>x.dataset.edj);
      const inp=det.querySelector('[data-edj="local"]');
      if(inp){ inp.value="Teatro Riachuelo"; inp.dispatchEvent(new Event("change")) }
      return {campos};
    });
    await p.waitForTimeout(250);
    const r4=await p.evaluate(()=>({
      local:ESCALAS.find(x=>x.nome==="Aftermovie da feira").local}));
    t(r3.campos.includes('local')&&r3.campos.includes('valor'),
      'a edição do job de fora corrige os FATOS: '+r3.campos.join(', '));
    t(r4.local==="Teatro Riachuelo",'⟶⟶ e o que se digita fica no job: local agora é "'+r4.local+'"');

    const r5=await p.evaluate(()=>{
      const e=ESCALAS.find(x=>x.nome==="Aftermovie da feira");
      matsDo(e).push({id:"m1",nome:"Logo do cliente — Drive",url:"https://drive.google.com/x",quem:EU.id});
      matsDo(e).push({id:"m2",nome:"vinheta_final.mov",quem:EU.id,tam:"120 MB",arq:{src:"blob:x",guarda:false}});
      drawJobs();
      const bloco=document.querySelector('#jb-det .jbmats');
      return {tem:!!bloco, itens:bloco?bloco.querySelectorAll('[data-matver]').length:0,
        honesto:bloco?/abre enquanto esta aba viver/.test(bloco.textContent):false,
        podePor:bloco?!!bloco.querySelector('[data-matlink]'):false};
    });
    t(r5.tem&&r5.itens===2,'o bloco Material do job lista link e arquivo ('+r5.itens+')');
    t(r5.honesto,'⟶⟶ e o arquivo que não sobrevive ao reload DIZ isso — a honestidade dos documentos');
    t(r5.podePor,'quem está no job pode pôr material — não é privilégio de quem manda');

    const r6=await p.evaluate(()=>({
      pode:podeDocJob(ESCALAS.find(x=>x.nome==="Aftermovie da feira"))}));
    t(r6.pode,'⟶⟶ e podeDocJob também reconhece o dono: OD e briefing do job de fora são dele');
    await ctx.close();
  }

  /* ============ 4: a OD aceita PDF — pela porta do anexo ============ */
  {
    const {ctx,p}=await entrar(1280);
    const r=await p.evaluate(()=>{
      MODO="contratante"; aplicarModo();
      const alvo=ESCALAS[0];
      abrirOrdemDia(alvo.id);
      const arq=document.getElementById('od-arq');
      const aceita=arq.getAttribute('accept')||'';
      const od=odDo(alvo);
      od.pdf={nome:"OD_evento.pdf",src:"blob:fake",quando:key(HOJE),quem:EU.id};
      pintarODPdf(alvo); drawJobs();
      return {aceita,
        anexada:/OD em PDF anexada/.test(document.getElementById('od-lido').textContent),
        naoLe:/não passa pela leitura coluna a coluna/.test(document.getElementById('od-lido').textContent)};
    });
    t(/pdf/.test(r.aceita),'o campo de subir OD aceita .pdf ('+r.aceita+')');
    t(r.anexada,'⟶⟶ e o PDF entra como DOCUMENTO PRONTO — anexado, com nome à vista');
    t(r.naoLe,'dizendo por que não vira cronograma: PDF achata a tabela — a leitura é para Word/texto');

    const r2=await p.evaluate(()=>{
      const alvo=ESCALAS[0], od=odDo(alvo);
      od.linhas=[{t:"cena",min:10,cena:"1"},{t:"desl",min:15}];
      od.antes=[{t:"cena",min:30,cena:"velha"}];
      pintarODPdf(alvo);
      const des=document.getElementById('od-desfaz');
      const tinha=!!des; if(des) des.click();
      return {tinha, voltou:od.linhas.length===1&&od.linhas[0].cena==="velha",
        limpo:!od.antes};
    });
    t(r2.tinha,'⟶⟶ depois de "Substituir o cronograma" existe o botão de desfazer — '
      +'"subi a OD em word e bugou tudo" nunca mais é perda sem volta');
    t(r2.voltou&&r2.limpo,'e desfazer devolve o cronograma anterior, uma vez só');
    await ctx.close();
  }

  /* ============ 5+6: viaja e a janela do dia, na escuta ============ */
  {
    const {ctx,p}=await entrar(1280);
    await p.evaluate(()=>{MODO="contratante";aplicarModo();
      abrirAssinatura&&abrirAssinatura()}); await p.waitForTimeout(250);
    const asok=p.locator('#as-ok');
    if(await asok.count()&&await asok.isVisible()){ await asok.click(); await p.waitForTimeout(300);
      const asf=p.locator('#as-f'); if(await asf.count()) await asf.click(); await p.waitForTimeout(250); }
    await p.evaluate(()=>show('pracas')); await p.waitForTimeout(250);
    await p.locator('#pracas .pc').first().click(); await p.waitForTimeout(500);
    const r=await p.evaluate(()=>{
      const antes=document.querySelectorAll('#rows .row').length;
      S.viaja=true; render();
      const depois=document.querySelectorAll('#rows .row').length;
      S.viaja=false; render();
      return {antes,depois,chip:!!document.getElementById('f-viaja')};
    });
    t(r.chip,'o filtro "Topa viajar" existe na lateral da escuta');
    t(r.depois>0&&r.depois<r.antes,
      '⟶⟶ e corta de verdade: '+r.antes+' → '+r.depois+' — quem não declarou não entra');
    const r2=await p.evaluate(()=>{
      const alvo=CREW.find(c=>!c.me);
      const id=Math.max(0,...ESCALAS.map(e=>e.id))+1;
      ESCALAS.push({id,off:S.dia,nome:"Institucional",cliente:"X",ini:"13:00",fim:"21:00",
        local:"Estúdio",tipo:"x",chamada:"13:00",refs:[],
        equipe:[{quem:alvo.id,func:"Op. de câmera",valor:800}]});
      render();
      const linha=[...document.querySelectorAll('#rows .row')].find(x=>x.querySelector('.jan'));
      const jan=janelaLivre(alvo,S.dia);
      const semJob=CREW.find(c=>!c.me&&c.id!==alvo.id&&!jobsDaPessoa(c.id,S.dia).length);
      return {naTela:!!linha, txt:linha?linha.querySelector('.jan').textContent:'',
        temLivreAte:jan&&/livre até 13:00/.test(jan.txt||''),
        semJobSemJanela:janelaLivre(semJob,S.dia)===null};
    });
    t(r2.naTela&&/13:00–21:00/.test(r2.txt),
      '⟶⟶ o card mostra a janela do dia: "'+r2.txt+'"');
    t(r2.temLivreAte,'e calcula a meia diária: job às 13h deixa "livre até 13:00" — '
      +'o fato, sem margem inventada; deslocamento quem conhece é quem combina');
    t(r2.semJobSemJanela,'⟶⟶ quem NÃO tem job registrado não ganha hora nenhuma — '
      +'o sorteio do status não tem hora dentro, e hora inventada seria mentir com precisão');

    const r3=await p.evaluate(()=>{
      const c=CREW.find(x=>!x.me&&viaja(x));
      abrirPerfil(c.id);
      return /viaja a trabalho/.test(document.getElementById('p-gar').textContent);
    });
    t(r3,'no perfil, quem declarou tem o chip "✈ viaja a trabalho" — e quem não declarou não tem chip nenhum');
    await ctx.close();
  }

  /* ============ 7: a caderneta de voo ============ */
  {
    const {ctx,p}=await entrar(390);
    const r=await p.evaluate(()=>{
      const base=Math.max(0,...ESCALAS.map(e=>e.id));
      ESCALAS.push({id:base+1,off:-6,nome:"Aéreas do resort",cliente:"Resort",ini:"08:00",fim:"12:00",
        local:"Litoral norte",tipo:"x",chamada:"08:00",refs:[],
        equipe:[{quem:EU.id,func:"Op. de drone",valor:1200}]});
      ESCALAS.push({id:base+2,off:-2,nome:"Cobertura do festival",cliente:"Festival",ini:"16:00",fim:"22:00",
        local:"Parque da cidade",tipo:"x",chamada:"16:00",refs:[],
        equipe:[{quem:EU.id,func:"Op. de drone",valor:1400}]});
      show('meu'); pintarVooPerfil();
      const el=document.getElementById('pf-voo');
      const r=resumoVoo(EU.id);
      return {horas:r.horas, jobs:r.js.length,
        naTela:/10,0 h/.test(el.textContent),
        locais:/Litoral norte/.test(el.textContent),
        temDoc:!!document.getElementById('pf-voo-doc'),
        aviso:/SISANT|ANAC/.test(el.textContent)&&/nunca no lugar deles/.test(el.textContent)};
    });
    t(r.jobs===2&&r.horas===10,'a caderneta DERIVA dos jobs: 2 voos, '+r.horas+' h — nada digitado à mão');
    t(r.naTela&&r.locais,'e o painel mostra horas e locais na tela do perfil');
    t(r.temDoc,'com o documento para baixar — o papel que se apresenta onde pedem comprovação');
    t(r.aviso,'⟶⟶ dizendo o que ele NÃO é: não substitui SISANT/ANAC nem DECEA — '
      +'prometer autorização seria vender o que não é nosso');
    const r2=await p.evaluate(()=>{
      const doc=docCaderneta(EU);
      return {tabela:/Aéreas do resort/.test(doc)&&/08:00–12:00/.test(doc),
        aviso:/SISANT\/ANAC/.test(doc)&&/DECEA\/SARPAS/.test(doc),
        verificavel:/verificável/.test(doc)};
    });
    t(r2.tabela&&r2.aviso&&r2.verificavel,
      'e o documento em si tem a tabela por job, o aviso oficial e a linha da verificabilidade');
    await ctx.close();
  }

  /* ============ as zonas de arrastar: o paradrop ============ */
  {
    const {ctx,p}=await entrar(1280);
    const r=await p.evaluate(()=>{
      show('malas');
      const z=document.getElementById('v-malas');
      const antes=ML_LOCAIS.length;
      const dt=new DataTransfer();
      dt.items.add(new File(["x"],"GC_terco_inferior.png",{type:"image/png"}));
      z.dispatchEvent(new DragEvent("dragenter",{bubbles:true,dataTransfer:dt}));
      const acendeu=z.classList.contains('dz-em');
      z.dispatchEvent(new DragEvent("drop",{bubbles:true,dataTransfer:dt}));
      const chip=document.querySelector('.carga');
      return {acendeu,antes,
        vooando:!!chip, chipNome:chip?chip.textContent:'',
        aindaNao:ML_LOCAIS.length===antes};
    });
    t(r.acendeu,'⟶⟶ a zona ACENDE quando o arquivo paira — resposta antes do gesto acabar');
    t(r.vooando&&/GC_terco_inferior\.png/.test(r.chipNome),
      '⟶⟶ no drop, a CARGA desce de paraquedas com o nome real do arquivo — o paradrop da referência');
    t(r.aindaNao,'e a ação espera o POUSO: nada entra na lista enquanto a carga está no ar');
    await p.waitForTimeout(1300);
    const r1b=await p.evaluate(antes=>({
      pousou:!document.querySelector('.carga'),
      pulsou:document.getElementById('v-malas').classList.contains('dz-caiu'),
      entrou:ML_LOCAIS.length===antes+1,
      janela:!document.getElementById('ovl-mlsub').hidden,
      nome:ML_LOCAIS[ML_LOCAIS.length-1].n}),r.antes);
    t(r1b.pousou&&r1b.pulsou,'no pouso a zona PULSA — a resposta forte é de quando a carga chega');
    t(r1b.entrou&&r1b.nome==="GC_terco_inferior.png",
      'o arquivo arrastado entra na lista com o nome real');
    t(r1b.janela,'⟶⟶ e a janela de subir abre com ele — o DESTINO continua sendo escolhido antes de qualquer byte');
    const css=await p.evaluate(()=>[...document.styleSheets].some(sh=>{
      try{ return [...sh.cssRules].some(r=>r.media&&/prefers-reduced-motion/.test(r.media.mediaText)&&
        [...r.cssRules].some(x=>/dz-caiu|carga/.test(x.selectorText||""))) }catch(e){ return false }
    }));
    t(css,'e quem pediu menos movimento não vê pulso nem queda — a regra de reduced-motion cobre as duas');
    await ctx.close();
  }

  t(errs.length===0,'zero erro de console'+(errs.length?' — '+errs[0]:''));

  console.log('USO REAL');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();
