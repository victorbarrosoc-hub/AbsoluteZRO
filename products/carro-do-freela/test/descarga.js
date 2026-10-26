/* DESCARGA DE CARTÕES — o controle do logger, em um gesto
 *
 * Victor, dor de mercado (29/ago): *"o logger fica responsável pelo backup.
 * Durante edição realtime quem faz logger é o editor. Às vezes ele se
 * confunde: quais arquivos já fez backup, quais não. Porque está recebendo
 * de vários editores, e o cartão do MESMO editor é feito logger várias
 * vezes, sempre com takes novos."*
 *
 * E depois de ver a v1: *"eu queria que tivesse um jeito mais fácil, no
 * realtime o editor não tem tempo pra preencher essas coisas."* — o
 * formulário virou fundo de gaveta e a mesa virou o caminho.
 */
const { chromium } = require('playwright');
const path = require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const errs=[];
  const ctx=await b.newContext({viewport:{width:1100,height:900}});
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

  /* helpers de arquivo falso, com tamanho de verdade */
  const SEM=`
    const F=(n,mb,rel)=>{const f=new File(["x"],n);
      Object.defineProperty(f,'size',{value:Math.round(mb*1048576)});
      Object.defineProperty(f,'webkitRelativePath',{value:rel});return f};
    const mk=(pre,de,ate,mb,ext)=>{const a=[];for(let i=de;i<=ate;i++){
      const n=pre+"_C"+String(i).padStart(3,"0")+(ext||".braw");
      a.push(F(n,mb==null?5.8:mb,pre+"/"+n))}return a};
  `;

  /* ============ 1. a porta ============ */
  const r0=await p.evaluate(()=>{
    show('jobs'); drawJobs();
    const det=document.getElementById('jb-det');
    return {bloco:/Descarga de cartões/.test(det.textContent),
      botao:!!det.querySelector('[data-dcgjob]'),
      vazioDiz:/Nenhum cartão descarregado/.test(det.textContent)};
  });
  t(r0.bloco&&r0.botao,'o painel do job tem o bloco Descarga de cartões com porta');
  t(r0.vazioDiz,'e o vazio diz que ainda não houve descarga');

  const job=await p.evaluate(()=>{
    const e=ESCALAS.find(x=>meusJobs().some(m=>m.id===x.id));
    abrirDescarga(e.id); return e.id;
  });

  /* ============ 2. ARRASTOU, ENTROU — zero digitação ============ */
  const r1=await p.evaluate(new Function('job',SEM+`
    const e=ESCALAS.find(x=>x.id===job);
    descDo(e).cartoes.length=0; DCG_ULT=null; pintarDescarga();
    dcgChegou(e,mk("A001",1,18).concat([F(".DS_Store",0,"A001/.DS_Store")]));
    const c=descDo(e).cartoes[0];
    return {cartoes:descDo(e).cartoes.length, rot:c.rot,
      arqs:dcgArqs(c).length, lotes:c.lotes.length,
      eco:document.getElementById('dcg-eco').textContent,
      temDesfazer:!!document.getElementById('dcg-desfaz'),
      semDono:!c.quem&&!c.avulso};
  `),job);
  t(r1.cartoes===1&&r1.rot==='A001','⟶⟶ arrastar a pasta CRIA o cartão e adivinha o rolo sozinha');
  t(r1.arqs===18,'só a mídia entra: o .DS_Store ficou fora da conta ('+r1.arqs+')');
  t(r1.semDono,'⟶⟶ e o cartão entra SEM DONO — perguntar de quem é na chegada custaria o '
    +'tempo que no realtime não existe');
  t(/18 arquivos novos em A001/.test(r1.eco),'o eco diz o que entrou');
  t(r1.temDesfazer,'⟶⟶ sem caixa de "tem certeza?", COM desfazer — confirmação é mais um '
    +'toque no meio do corte ao vivo');

  /* ⚠️ OS DOIS CAMINHOS DA ADIVINHAÇÃO, SEPARADOS — esta asserção nasceu de
     um defeito semeado que PASSOU: quebrei a leitura do nome do arquivo e a
     suíte ficou verde, porque o nome da pasta salvava. Cartão formatado
     monta como "NO NAME" (só o arquivo salva); Sony grava C0001.MP4 sem
     rolo (só a pasta salva). Nenhum cobre o outro. */
  const r2=await p.evaluate(()=>{
    const A=ns=>ns.map(n=>({n,mb:1}));
    return {soArquivo:dcgAdivinhaRot(A(["A001_C001.braw","A001_C002.braw","A001_C003.braw"]),"NO NAME"),
      soPasta:dcgAdivinhaRot(A(["C0001.MP4","C0002.MP4","C0003.MP4"]),"A001"),
      red:dcgAdivinhaRot(A(["A012_C001_0812XY.R3D","A012_C002_0812XY.R3D"]),"Untitled"),
      nenhum:dcgAdivinhaRot(A(["C0001.MP4"]),"")};
  });
  t(r2.soArquivo==='A001','⟶⟶ cartão formatado monta como "NO NAME": o rolo sai do NOME DO ARQUIVO');
  t(r2.soPasta==='A001','⟶⟶ Sony grava C0001.MP4 sem rolo: aí o rolo sai do NOME DA PASTA');
  t(r2.red==='A012','e o padrão da RED também é lido: '+r2.red);
  t(r2.nenhum==='','sem os dois, o cartão nasce sem nome em vez de inventar um');

  /* ============ 3. a mesma pasta de novo, e a chegada seguinte ============ */
  const r3=await p.evaluate(new Function('job',SEM+`
    const e=ESCALAS.find(x=>x.id===job);
    dcgChegou(e,mk("A001",1,18));
    const so1=descDo(e).cartoes[0].lotes.length;
    const eco1=document.getElementById('dcg-eco').textContent;
    dcgChegou(e,mk("A001",14,30));
    const c=descDo(e).cartoes[0];
    return {so1,eco1,cartoes:descDo(e).cartoes.length,
      lotes:c.lotes.length,arqs:dcgArqs(c).length,
      eco2:document.getElementById('dcg-eco').textContent,
      faixa:document.querySelector('#dcg-lista .dcglote small').textContent};
  `),job);
  t(r3.so1===1&&/Nada novo/.test(r3.eco1),
    '⟶⟶ arrastar a MESMA pasta de novo não cria lote e diz "nada novo" — é o engano mais '
    +'provável do dia, e custa zero');
  t(r3.cartoes===1&&r3.lotes===2&&r3.arqs===30,
    'a chegada seguinte do mesmo rolo cai no MESMO cartão: 2 chegadas, 30 arquivos');
  t(/12 arquivos novos/.test(r3.eco2)&&/5 já tinha/.test(r3.eco2),
    '⟶⟶ com C014–C030 sobre C001–C018, entram 12 e 5 ficam fora da conta');
  t(/A001_C001\.braw → A001_C018\.braw/.test(r3.faixa),
    'e cada chegada mostra a faixa que veio nela');

  /* ============ 4. MESMO NOME NÃO É MESMO ARQUIVO ============
     ⚠️ O pior defeito que esta tela teve, achado rodando um DIA INTEIRO
     simulado e não asserção por asserção: um cartão formatado na mesma
     câmera do colega tem os mesmos `A001_C001.braw`. A tela dizia "nada
     novo, todos já registrados" — descartando o material inteiro com
     carimbo de segurança. É a perda que ela existe para impedir. */
  const r4=await p.evaluate(new Function('job',SEM+`
    const e=ESCALAS.find(x=>x.id===job);
    descDo(e).cartoes.length=0; DCG_ULT=null;
    dcgChegou(e,mk("A001",1,4,5.8));
    dcgChegou(e,mk("A001",1,4,6.2));
    const c=descDo(e).cartoes[0];
    return {arqs:dcgArqs(c).length,lotes:c.lotes.length,
      eco:document.getElementById('dcg-eco').textContent,
      temSeparar:!!document.getElementById('dcg-separa')};
  `),job);
  t(r4.arqs===8&&r4.lotes===2,
    '⟶⟶ nome igual com TAMANHO DIFERENTE entra como material novo — nada se descarta, '
    +'nunca; era aqui que a tela perdia um cartão inteiro dizendo que estava tudo certo');
  t(/nome já usado/.test(r4.eco)&&/OUTRO cartão com o mesmo rolo/.test(r4.eco),
    'e o eco GRITA o que aconteceu, em vez de dizer "nada novo"');
  t(/um cobre o outro/.test(r4.eco),'explicando a consequência de copiar os dois para a mesma pasta');
  t(r4.temSeparar,'com "É outro cartão" à mão — a resposta certa quase sempre');

  const r5=await p.evaluate(job=>{
    document.getElementById('dcg-separa').click();
    const e=ESCALAS.find(x=>x.id===job);
    return {rots:descDo(e).cartoes.map(c=>c.rot),
      cartoes:descDo(e).cartoes.length,
      arqs:descDo(e).cartoes.map(c=>dcgArqs(c).length)};
  },job);
  t(r5.cartoes===2&&r5.rots[1]==='A001-2',
    '⟶⟶ e um toque separa em "'+r5.rots[1]+'" — o rolo se repete, o material não');
  t(r5.arqs[0]===4&&r5.arqs[1]===4,'com os arquivos indo cada um para o seu: '+r5.arqs.join(' e '));

  /* ============ 5. a conferência de destino ============ */
  const r6=await p.evaluate(new Function('job',SEM+`
    const e=ESCALAS.find(x=>x.id===job);
    descDo(e).cartoes.length=0; DCG_ULT=null;
    dcgChegou(e,mk("A001",1,18));
    dcgChegou(e,mk("A001",19,30));
    dcgChegou(e,mk("B002",1,9,4.2));
    const antes=dcgPend(e);
    dcgDestino(e,"bkp",mk("A001",1,25).concat(mk("B002",1,9,4.2)),"backup");
    const dps=dcgPend(e);
    const c=descDo(e).cartoes[0];
    return {lote1:c.lotes[0].bkp,lote2:c.lotes[1].bkp,
      eco:document.getElementById('dcg-eco').textContent,
      ilhaIntacta:dps.semEd===antes.semEd};
  `),job);
  t(r6.lote1===true&&r6.lote2===false,
    '⟶⟶ UMA ação confere TODOS os cartões: a chegada inteira que está no HD é marcada, a '
    +'que só está pela metade NÃO — meio backup não é backup, e marcar daria alívio falso');
  t(/conferida/.test(r6.eco)&&/incompleta/.test(r6.eco),
    'o eco diz as duas coisas: quantas fecharam e quantas ficaram no meio');
  t(/ainda de fora/.test(r6.eco),'e quantos arquivos exatamente ainda não estão lá');
  t(r6.ilhaIntacta,'conferir o backup não mexe na ilha — uma trava de cada vez');

  const r7=await p.evaluate(new Function('job',SEM+`
    const e=ESCALAS.find(x=>x.id===job);
    /* a pasta tem os nomes certos, mas um arquivo truncado */
    dcgDestino(e,"ed",mk("A001",1,17).concat(mk("A001",18,18,0.4)),"ilha");
    return {ed:descDo(e).cartoes[0].lotes[0].ed};
  `),job);
  t(r7.ed===false,
    '⟶⟶ na conferência, arquivo com nome certo e TAMANHO errado (truncado no meio da '
    +'cópia) não conta — dar "conferido" nele é o alívio falso mais caro possível');

  /* ============ 6. as duas travas são independentes ============ */
  const r8=await p.evaluate(job=>{
    const e=ESCALAS.find(x=>x.id===job);
    pintarDescarga();
    /* um lote com as DUAS desligadas: é o único que prova independência.
       ⚠️ semeei "marcar a ilha marca o backup junto" e a asserção antiga
       passou, porque ela olhava um lote que JÁ tinha backup. */
    const c=descDo(e).cartoes.find(x=>x.lotes.some(l=>!l.bkp&&!l.ed));
    const l=c.lotes.find(l=>!l.bkp&&!l.ed);
    const bkpAntes=l.bkp;
    document.querySelector('[data-dcged="'+c.id+'|'+l.id+'"]').click();
    return {ed:l.ed,bkpAntes,bkpDepois:l.bkp};
  },job);
  t(r8.ed===true&&r8.bkpAntes===false&&r8.bkpDepois===false,
    '⟶⟶ numa chegada com as DUAS travas desligadas, marcar a ilha deixa a 2ª cópia em '
    +'falso — é entre elas que o esquecimento mora: faz o backup e esquece a ilha, ou '
    +'manda para a ilha e fica sem segunda cópia');

  /* ============ 7. a pendência grita no painel do job ============ */
  const r9=await p.evaluate(job=>{
    const e=ESCALAS.find(x=>x.id===job);
    jobAberto=e.id; drawJobs();
    const det=document.getElementById('jb-det');
    const linha=[...det.querySelectorAll('.jdl')].find(x=>/sem 2ª cópia|fora da ilha/.test(x.textContent));
    return {grita:!!linha, alerta:linha?linha.classList.contains('jdlalerta'):false};
  },job);
  t(r9.grita&&r9.alerta,
    '⟶⟶ a pendência aparece no PAINEL DO JOB, marcada — controle que só aparece para quem '
    +'foi procurar não evita esquecimento');

  /* ============ 8. o dono num toque, quando sobrar tempo ============ */
  const r10=await p.evaluate(job=>{
    const e=ESCALAS.find(x=>x.id===job);
    abrirDescarga(job); pintarDescarga();
    const bt=document.querySelector('[data-dcgdono]');
    const tinha=!!bt;
    bt.click();
    const sel=document.querySelector('.dcgsel');
    const opcoes=sel?sel.options.length:0;
    if(sel){ sel.value=String(e.equipe[0].quem); sel.dispatchEvent(new Event('change')) }
    return {tinha,opcoes,dono:descDo(e).cartoes.some(c=>c.quem===e.equipe[0].quem)};
  },job);
  t(r10.tinha&&r10.opcoes>1,'o cartão sem dono oferece "de quem é este cartão?" na própria linha');
  t(r10.dono,'⟶⟶ e um toque resolve, sem abrir formulário — a pergunta existe, mas depois');

  /* ============ 9. o caminho de quando não dá para arrastar ============ */
  const r11=await p.evaluate(job=>{
    const e=ESCALAS.find(x=>x.id===job);
    DCG_FORM=e.id; DCG_LIDO=null; pintarDescarga();
    document.getElementById('dcg-rot').value="C003";
    document.getElementById('dcg-quem').value=String(EU.id);
    document.getElementById('dcg-de').value="7";
    document.getElementById('dcg-ate').value="11";
    document.getElementById('dcg-faixa').click();
    return {novos:DCG_LIDO.novos.map(a=>a.n),temCam:!!document.getElementById('dcg-cam')};
  },job);
  t(r11.novos.length===5&&r11.novos[0]==='C003_C007'&&r11.novos[4]==='C003_C011',
    'no celular a faixa vira lista: "do 7 ao 11" → '+r11.novos.join(', ')+' — é como se fala no set');
  t(r11.temCam,'e o caminho manual guarda a câmera, que o arrasto não tem como saber');

  /* ============ 10. a tela diz o que NÃO faz ============ */
  const r12=await p.evaluate(job=>{
    abrirDescarga(job);
    const txt=document.getElementById('ovl-dcg').textContent;
    return {naoCopia:/A cópia não acontece aqui/.test(txt),
      porque:/não é a cópia/.test(txt)&&/quem já veio/.test(txt),
      soNomeTam:/nome e tamanho/.test(txt),
      naoSai:/não sai do seu computador/.test(txt)};
  },job);
  t(r12.naoCopia&&r12.porque,
    '⟶⟶ a tela DIZ que não copia byte nenhum, e diz por que existe assim mesmo');
  t(r12.soNomeTam&&r12.naoSai,'e diz o que lê das pastas: nome e tamanho, sem sair do computador');

  t(errs.length===0,'zero erro de console'+(errs.length?' — '+errs[0]:''));

  console.log('DESCARGA');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await ctx.close(); await b.close();
  process.exit(bad.length?1:0);
})();
