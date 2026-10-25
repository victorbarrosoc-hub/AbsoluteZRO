/**
 * LISTA DE EQUIPAMENTO DO JOB — o que saiu e o que voltou.
 *
 * Ideia do Victor: "o freela controla os equipamentos que ele levou pro job
 * e o que voltou, pra saber se tudo que foi voltou. E a produtora controla
 * tudo que foi de equipamento da produtora." Ligada ao inventário, marcar é
 * um toque — e isso "favorece ainda mais a ideia de preencher o inventário".
 *
 * O que esta suíte protege:
 *   - duas listas por job, uma de cada LADO: o equipamento do freela e o da
 *     produtora não se misturam, e trocar de chapéu troca de lista;
 *   - "voltou" só existe depois de "saiu" — não dá para conferir a volta de
 *     uma peça que nunca saiu;
 *   - o placar lidera pela FALTA, que é a pergunta que a lista responde;
 *   - o que está comigo de OUTRA pessoa entra na lista: perder equipamento
 *     alheio é o caso pior;
 *   - o que não voltou vira OCORRÊNCIA já preenchida com o job — a mesma
 *     ocorrência do dossiê, que serve para cobrar e para a seguradora;
 *   - peça de terceiro que não voltou NÃO abre ocorrência: o registro é de
 *     quem é dono, e a tela manda avisar ele;
 *   - item avulso digitado vira peça do inventário com um toque — é o funil
 *     que o Victor descreveu;
 *   - a peça em job aparece assim no inventário, por estado DERIVADO — mas
 *     ⚠️ ISSO NÃO A TIRA DO COMÉRCIO. Correção de rumo do Victor: "se entrar
 *     em job o anúncio continua, pq ele pode ser vendido enquanto está no
 *     job; quando terminar, entrega a quem comprou". Job é ONDE A PEÇA ESTÁ,
 *     não um estado jurídico dela. O que ficou disso foi a DATA: o catálogo
 *     diz a partir de quando ela fica livre, em vez de sumir;
 *   - KIT é por TIPO DE TRABALHO + FUNÇÃO, os dois catálogos que já
 *     existem, e por isso a plataforma consegue SUGERIR o certo sozinha;
 *   - ⚠️ aplicar um kit NÃO marca nada. Foi o Victor quem cravou: "não é
 *     só ter lá o grupo predefinido, ele precisa conferir que tudo que tá
 *     ali ele está levando". Kit que chega marcado é lista que ninguém
 *     olha. O kit poupa a DIGITAÇÃO, nunca a CONFERÊNCIA.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:2});
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
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(220);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(180);
  await p.locator('[data-login="Google"]').click(); /* 17/out · 13: só Google e a conta oficial */ await p.waitForTimeout(650);
  await p.evaluate(()=>show("jobs")); await p.waitForTimeout(550);

  /* ============ dá para achar, do painel que os dois lados leem ============ */
  t(await p.locator('[data-lsjob]').count()===1,'o painel do job leva à lista');
  /* ⚠️ O rótulo era "Equipamento seu" de um lado e "da produtora" do outro,
     porque a lista era por chapéu. Virou por PESSOA: os dois lados leem o
     mesmo "Seu equipamento neste job", e a tela diz que ninguém mais vê. */
  t(/Seu equipamento neste job/.test(await p.locator('#jb-det').textContent()),
    'o painel chama a lista de "seu equipamento neste job"');
  t(/só você vê/.test(await p.locator('#jb-det').textContent()),
    'e diz na cara que a lista é individual — ninguém mais lê o que você marcou');
  await p.locator('[data-lsjob]').click(); await p.waitForTimeout(450);
  t(await p.locator('#ovl30').isVisible(),'e a lista abre');
  t(/o que voltou com você/.test(await p.locator('#lst-sub').textContent()),'falando do equipamento dele');

  /* ============ marcar é um toque, porque o inventário já existe ============ */
  const disp=await p.locator('[data-lsadd]').count();
  t(disp>0,'o inventário inteiro está a um toque ('+disp+' peças)');
  for(let i=0;i<3;i++){ await p.locator('[data-lsadd]').first().click(); await p.waitForTimeout(110); }
  t(await p.locator('.lsti').count()===3,'três entram na lista');
  t(await p.locator('[data-lsadd]').count()===disp-3,'e saem das disponíveis — nada entra duas vezes');

  /* ============ voltou depende de ter saído ============ */
  t(await p.locator('[data-lsvo]').first().isDisabled(),'"voltou" fica travado enquanto a peça não saiu');
  await p.locator('[data-lsai]').first().check(); await p.waitForTimeout(200);
  t(!await p.locator('[data-lsvo]').first().isDisabled(),'marcar a saída destrava a conferência da volta');
  /* três estados, na ordem do dia: enquanto houver peça sem conferir na
     saída, é ISSO que o placar cobra — só depois ele passa a cobrar a volta */
  t(/2 por conferir/.test(await p.locator('#lst-placar').textContent()),
    'com peça ainda por conferir na saída, é isso que o placar cobra');
  await p.locator('[data-lsai]').nth(1).check(); await p.waitForTimeout(150);
  await p.locator('[data-lsai]').nth(2).check(); await p.waitForTimeout(150);
  await p.locator('[data-lsvo]').first().check(); await p.waitForTimeout(200);
  const pl2=await p.locator('#lst-placar').textContent();
  t(/2 por voltar/.test(pl2)&&/3 saíram/.test(pl2)&&/1 voltaram/.test(pl2),
    'conferida a saída inteira, o placar vira para a volta: '+pl2.replace(/\s+/g,' ').trim());
  /* desmarcar a saída não pode deixar um "voltou" órfão */
  await p.locator('[data-lsai]').first().uncheck(); await p.waitForTimeout(220);
  t(await p.locator('[data-lsvo]').first().isDisabled()===true,'desmarcar a saída zera a volta — sem estado impossível');
  await p.locator('[data-lsai]').first().check(); await p.waitForTimeout(200);

  /* ============ avulso vira peça do inventário ============ */
  const antes=await p.evaluate(()=>invItens().length);
  await p.fill('#lst-novo','Cabo SDI 15m');
  await p.locator('#lst-add').click(); await p.waitForTimeout(250);
  t(await p.locator('.lsti').count()===4,'o que não está no inventário entra como avulso');
  t(/avulso, fora do inventário/.test(await p.locator('.lsti').last().textContent()),'e a lista diz que ele é avulso');
  await p.locator('[data-lsinv]').first().click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>invItens().length)===antes+1,'um toque guarda ele no inventário — é o funil');
  t(await p.locator('[data-lsinv]').count()===0,'e ele deixa de ser avulso');

  /* ============ o que não voltou vira ocorrência ============ */
  await p.locator('[data-lsai]').nth(3).check(); await p.waitForTimeout(200);
  t(await p.locator('[data-lsnv]').count()>0,'peça que saiu e não voltou ganha o botão "Não voltou"');
  await p.locator('[data-lsnv]').first().click(); await p.waitForTimeout(500);
  t(await p.locator('#ovl29').isVisible(),'ele abre a ocorrência');
  t(await p.inputValue('#ocr-tipo')==='perda','já no tipo certo');
  const onde=await p.inputValue('#ocr-onde');
  t(!!onde,'e com o job preenchido: '+onde);
  t(/conferência da lista/.test(await p.inputValue('#ocr-desc')),'com a descrição dizendo de onde veio');
  await p.locator('#ocr-ok').click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>OCORRENCIAS.length)===1,'e registra — a mesma ocorrência do dossiê');
  t(await p.evaluate(()=>!!OCORRENCIAS[0].fichaNaHora),'congelando o estado de antes, como toda ocorrência');
  await p.waitForTimeout(300);
  t(await p.locator('#ovl30').isVisible(),'e devolve para a lista: quem confere a volta está no meio dela');

  /* ============ peça de terceiro: o registro é de quem é dono ============ */
  const alheia=await p.evaluate(()=>{
    PEGUEI.push({id:"pgt1",t:"Ronin RS3 (de outra conta)",dono:CREW.find(c=>!c.me).id,
      de:key(HOJE),ate:key(HOJE),valor:120});
    pintarLista();
    const d=[...document.querySelectorAll('[data-lsadd]')].find(b=>/Ronin/.test(b.textContent));
    if(d) d.click();
    return document.querySelectorAll('.lsti').length;
  });
  await p.waitForTimeout(300);
  t(alheia===5,'o que está comigo de outra pessoa também entra na lista');
  t(/de /.test(await p.locator('.lsti').last().textContent()),'dizendo de quem é');
  await p.locator('[data-lsai]').nth(4).check(); await p.waitForTimeout(250);
  const nvs=await p.locator('[data-lsnv]').count();
  await p.locator('[data-lsnv]').nth(nvs-1).click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl29').isHidden(),'peça de terceiro NÃO abre ocorrência sua');
  t(/avise o dono|é de /.test(await p.locator('#avisos').textContent()),'a tela manda avisar o dono — o registro é dele');

  /* ============ o inventário mostra quem está em job ============ */
  await p.locator('#lst-x').click(); await p.waitForTimeout(250);
  await p.evaluate(()=>{ show("brecho"); painelBrecho("inv"); }); await p.waitForTimeout(500);
  t(await p.locator('.ivjob').count()>0,'a peça em job aparece assim no card');
  t(/Em job agora/.test(await p.locator('#inv-fatos').textContent()),'e vira fato no topo do inventário');
  const derivado=await p.evaluate(()=>{
    const it=invItens().find(x=>jobDaPeca(x.id));
    return it?{semCampo:it.emJob===undefined,job:!!jobDaPeca(it.id)}:null;});
  t(derivado&&derivado.semCampo&&derivado.job,'e é estado DERIVADO da lista, sem campo paralelo na peça');

  /* ============ a lista é DA PESSOA, não do lado da conta ============
     ⚠️ Esta asserção já cobrou o CONTRÁRIO: a chave era job+MODO, e trocar
     de chapéu abria outra lista. Virou job+EU.id a pedido do Victor —
     *"é lista individual de cada usuário, só quem vê é ele"* — porque com
     chave por lado duas pessoas escaladas no mesmo job dividiriam a mesma
     lista, cada uma podendo desmarcar o equipamento da outra. */
  const dois=await p.evaluate(()=>{
    const job=LISTAS[0].job;
    const minha=listaDo(job), antes=minha.itens.length;
    MODO="contratante"; aplicarModo();
    const comOutroChapeu=listaDo(job);
    MODO="freela"; aplicarModo();
    LISTAS.push({id:"ls-outra",job,quem:"zz-outra",itens:[],criada:key(HOJE)});
    const dela=listaDe(job,"zz-outra");
    const r={mesma:comOutroChapeu===minha,antes,doOutro:dela.itens.length,
             minhaDepois:listaDo(job).itens.length};
    LISTAS=LISTAS.filter(l=>l.quem!=="zz-outra");
    return r;});
  t(dois.mesma,
    'trocar de chapéu NÃO troca a lista — ela é da pessoa, não do lado da conta');
  t(dois.antes>0&&dois.doOutro===0&&dois.minhaDepois===dois.antes,
    'e outra pessoa no mesmo job abre a lista DELA, vazia, sem encostar na minha');

  /* ============ estar num job NÃO tira a peça do comércio ============
     Correção de rumo do Victor sobre a versão que trancava tudo: "se entrar
     em job o anúncio continua, pq ele pode ser vendido no sistema enquanto
     está no job; quando terminar ele entrega a quem comprou". Job é ONDE a
     peça está, não estado jurídico dela. */
  const vr=await p.evaluate(()=>{
    const it=invItens().find(x=>statusInv(x)==="guardado");
    it.locacao={diaria:180,fds:300,semana:700,min:1,obs:"",pausado:false};
    const l=listaDo(ESCALAS[0].id);
    l.itens.push({ref:it.id,t:it.t,de:"",saiu:true,voltou:false});
    const c=catalogoAluguel().find(x=>x.item&&x.item.id===it.id);
    drawInventario();
    return {id:it.id,st:statusInv(it),noCatalogo:!!c,livre:locLivre(c),
      noJob:!!c.noJob,desde:c.voltaEm};});
  await p.waitForTimeout(350);
  t(vr.st==='guardado','estar num job NÃO muda o status da peça — ela continua sendo do dono');
  t(vr.noCatalogo,'e ela CONTINUA no catálogo de aluguel');
  t(!vr.livre&&!!vr.desde,'não como livre agora, mas com data: '+vr.desde);
  t(vr.noJob,'e o catálogo sabe que a data veio do job');
  const bot=await p.evaluate(id=>{
    const el=[...document.querySelectorAll('.ivc')].find(c=>c.innerHTML.includes('data-ivds="'+id+'"'));
    return el?{alugar:!!el.querySelector('[data-ivloc]'),anunciar:!!el.querySelector('[data-ivan]'),
      lista:!!el.querySelector('[data-lsjob2]'),job:!!el.querySelector('.ivjob')}:null;},vr.id);
  t(bot&&bot.alugar&&bot.anunciar,
    'anunciar e pôr para alugar continuam disponíveis: vender é acordo com entrega combinada, não exige a peça na estante');
  t(bot&&bot.job,'o card diz em que job ela está');
  t(bot&&bot.lista,'e leva para a lista de lá');
  /* a palavra do dono ganha da data derivada */
  const dono=await p.evaluate(id=>{
    const it=invItens().find(x=>x.id===id);
    it.locacao.livreEm="2099-01-10";
    const c=catalogoAluguel().find(x=>x.item&&x.item.id===id);
    return {desde:c.voltaEm,noJob:!!c.noJob};},vr.id);
  t(dono.desde==='2099-01-10'&&!dono.noJob,
    'a data que o DONO escreve ganha da derivada — é ele quem agenda');
  await p.evaluate(()=>{ LISTAS.length=0; invItens().forEach(x=>{if(x.locacao)x.locacao.livreEm=""}); drawInventario(); });

  /* ============ kits: o mesmo trabalho pede o mesmo equipamento ============ */
  await p.evaluate(()=>{ MODO="freela"; aplicarModo(); show("jobs"); jobAberto=2; drawJobs(); });
  await p.waitForTimeout(450);
  await p.locator('[data-lsjob]').first().click(); await p.waitForTimeout(400);
  t(/Nenhum kit salvo ainda/.test(await p.locator('#lst-kits').textContent()),
    'sem kit, a lista explica para que serviria ter um');
  await p.locator('#lst-kit').click(); await p.waitForTimeout(350);
  t(await p.locator('#ovl31').isHidden(),'guardar lista vazia como kit não abre nada');
  for(let i=0;i<3;i++){ await p.locator('[data-lsadd]').first().click(); await p.waitForTimeout(110); }
  await p.fill('#lst-novo','Bateria V-mount ×4'); await p.locator('#lst-add').click(); await p.waitForTimeout(200);
  await p.locator('#lst-kit').click(); await p.waitForTimeout(450);
  t(await p.locator('#ovl31').isVisible(),'com a lista montada, guardar como kit abre o editor');
  t(await p.inputValue('#kit-tipo')==='Clipe','já no tipo do job');
  t(await p.inputValue('#kit-func')==='Op. de câmera','e na função que você exerce nele');
  t(await p.locator('.kitl').count()===4,'com a lista inteira dentro, avulso incluído');
  const zclick=await p.evaluate(()=>{
    const a=getComputedStyle(document.getElementById('ovl31')).zIndex;
    const b=getComputedStyle(document.getElementById('ovl30')).zIndex;
    return +a>+b;});
  t(zclick,'e o editor fica ACIMA da lista, que continua aberta atrás');
  await p.locator('#kit-ok').click(); await p.waitForTimeout(450);
  t(await p.evaluate(()=>KITS.length)===1,'guardar cria o kit');

  /* o outro job do mesmo tipo: o kit certo vem sugerido sozinho */
  await p.locator('#lst-x').click(); await p.waitForTimeout(250);
  const outro=await p.evaluate(()=>{
    const n={...ESCALAS.find(x=>x.id===2),id:990,nome:"Clipe — outro artista",
      equipe:[{quem:EU.id,func:"Op. de câmera",valor:1000}]};
    ESCALAS.push(n); jobAberto=990; drawJobs(); return 990;});
  await p.waitForTimeout(400);
  await p.locator('[data-lsjob]').first().click(); await p.waitForTimeout(450);
  t(await p.locator('#lst-kits .chip.on').count()===1,'no próximo job do mesmo tipo o kit vem marcado como sugerido');
  t(/num trabalho de Clipe/.test(await p.locator('#lst-kits').textContent()),
    'e a tela diz por que é esse: tipo do job + sua função');

  /* ⚠️ o coração do pedido: aplicar NÃO marca nada */
  await p.locator('[data-kituse]').first().click(); await p.waitForTimeout(450);
  const ap=await p.evaluate(()=>{const l=listaDo(LS_JOB);
    return {n:l.itens.length,marcados:l.itens.filter(x=>x.saiu).length,dokit:l.itens.filter(x=>x.dokit).length}});
  t(ap.n===4&&ap.dokit===4,'o kit enche a lista de uma vez');
  t(ap.marcados===0,'e NENHUMA peça vem marcada — o kit poupa a digitação, não a conferência');
  const plc=await p.locator('#lst-placar').textContent();
  t(/4 por conferir/.test(plc),'o placar cobra a conferência: '+plc.replace(/\s+/g,' ').slice(0,30));
  t(/nenhuma vem marcada/.test(plc),'e diz por escrito que nada foi conferido ainda');
  await p.locator('[data-lsai]').first().check(); await p.waitForTimeout(250);
  t(/3 por conferir/.test(await p.locator('#lst-placar').textContent()),'conferir uma por uma baixa a conta');
  /* aplicar de novo não duplica */
  await p.locator('[data-kituse]').first().click(); await p.waitForTimeout(350);
  t(await p.evaluate(()=>listaDo(LS_JOB).itens.length)===4,'aplicar o mesmo kit duas vezes não duplica peça');

  /* o kit mora no inventário, que é de onde as peças saem */
  await p.locator('#lst-x').click(); await p.waitForTimeout(250);
  await p.evaluate(()=>{ show("brecho"); painelBrecho("inv"); }); await p.waitForTimeout(500);
  t(await p.locator('.kitc').count()===1,'o kit aparece no inventário, que é de onde as peças saem');
  await p.locator('.kitc').first().click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl31').isVisible()&&!await p.locator('#kit-apagar').isHidden(),
    'e de lá dá para editar e apagar');
  await p.locator('#kit-x').click(); await p.waitForTimeout(250);

  /* kit é do LADO, como a lista */
  const lados=await p.evaluate(()=>{
    const doFreela=kitsDoLado().length;
    MODO="contratante"; aplicarModo();
    const doProd=kitsDoLado().length;
    MODO="freela"; aplicarModo();
    return {doFreela,doProd};});
  t(lados.doFreela===1&&lados.doProd===0,'o kit do freela não aparece do lado de quem contrata');

  /* ============ celular ============ */
  await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>{ show("jobs"); }); await p.waitForTimeout(400);
  await p.locator('[data-lsjob]').first().click(); await p.waitForTimeout(400);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no celular: '+ov);

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();
