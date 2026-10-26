/* A PORTA CURTA, A TABELA EM DUAS COLUNAS, E A CONTA ÚNICA
 *
 * Três pedidos de 22/ago que mexeram na entrada do produto:
 *
 * 1. Victor: *"não quero que a pessoa desista na hora do cadastro porque
 *    tem que preencher muita coisa; quero que seja simples e ela preencha
 *    o restante depois de ver a plataforma."* A porta pedia SEIS etapas de
 *    quem ainda não tinha visto nada; hoje pede DUAS — exatamente o que
 *    `perfilPronto()` já exigia para alguém aparecer numa busca.
 *
 * 2. "Opção A": a tabela ganhou DUAS COLUNAS por função — "Só eu" e "Com
 *    meu equipamento". Quem é operador COM câmera e diretor SEM não tem um
 *    acréscimo só; o acréscimo geral obrigava a mentir numa das linhas.
 *
 * 3. Um testador: *"o caba pode ser freela e contratante com a mesma
 *    conta?"* Victor: **"é uma conta só mesmo. Abre."**
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const ctx=await b.newContext({viewport:{width:1280,height:1100},deviceScaleFactor:2});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  /* ⚠️ SEM `cdf-entrou`: a porta curta só existe para quem está entrando
     pela primeira vez. Com a marca, o login pula o cadastro. */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');
    localStorage.setItem('cdf-guia','1');   /* o guia nao cobre a tela aqui */
    localStorage.removeItem('cdf-entrou');
    localStorage.removeItem('cdf-uso');
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(170);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(850);

  /* ============ a porta curta ============ */
  t(await p.evaluate(()=>S.tab)==='cadastro','quem entra pela primeira vez cai no cadastro');
  t(await p.evaluate(()=>S.voltaDe)==='entrar','pela porta, e a tela sabe disso');
  const etapas=await p.locator('.stp:not([hidden])').count();
  t(etapas===2,'que mostra DUAS etapas, não seis: '+etapas);
  t(await p.evaluate(()=>CAD_ESSENCIAL)===2,'e o corte é uma constante, não um número solto no meio do código');
  t(await p.evaluate(()=>!v('cd-fim2').hidden),'e sai por "Concluir e entrar"');
  const lead=await p.locator('#cd-lead').textContent();
  t(/Duas etapas/.test(lead),'a tela diz que são duas: "'+lead.slice(0,44)+'…"');
  t(/depois/.test(lead),'e que o resto vem depois de ver a plataforma');

  /* ⚠️ AS ETAPAS NÃO SUMIRAM, MUDARAM DE PORTA. Apagá-las jogaria fora o
     editor de demoreel e o de clientes, que só existem nesta tela. */
  t(await p.locator('.stp').count()===6,'as seis etapas continuam no markup — a porta é que é curta');

  /* ============ a lista do que falta abre o cadastro inteiro ============
     Guilherme, testando: *"quando eu clico nos q n tão preenchidos deveria
     ir pra o local q falta; aí volta pro início — tá meio coisada."*
     Reproduzido: a lista trazia 13 itens, 8 apontando para etapas
     ESCONDIDAS. O conserto não foi esconder os itens — quem toca em
     "Tabela de diária" está PEDINDO aquele campo. */
  /* (18/out · 7) A LISTA NASCE RECOLHIDA, e é mudança de produto. Victor:
     *"essa experiência de preenchimento é péssima, muito texto de uma vez"* —
     os treze itens do que falta eram o maior bloco de texto da tela. Agora o
     progresso da porta é a estrada com o carro, e a lista do perfil inteiro
     abre num toque. A regra que esta parte guarda continua a mesma: tocar
     num item além da porta abre o cadastro inteiro. */
  await p.locator('#cd-falta-tog').click(); await p.waitForTimeout(150);
  t(await p.locator('#cd-falta').isVisible(),'a lista do que falta abre num toque');
  const fundos=await p.locator('#cd-falta [data-fl]').count();
  t(fundos>0,'a lista do que falta oferece itens de etapas que a porta esconde: '+fundos);
  const alvo=p.locator('#cd-falta [data-fl]').filter({hasText:'Tabela'});
  if(await alvo.count()){
    await alvo.first().click(); await p.waitForTimeout(400);
    t(await p.evaluate(()=>cdPasso)===4,'⟶ tocar em "Tabela de diária" ABRE a tabela');
    t(await p.locator('.stp:not([hidden])').count()===6,
      'e o cadastro inteiro se abre junto — o stepper deixa de mentir');
    /* ⚠️ ABRINDO TUDO, A SAÍDA RÁPIDA NÃO PODE SUMIR: quem foi ver a tabela
       não deixou de ser alguém que ainda não viu a plataforma. */
    t(await p.evaluate(()=>!v('cd-fim2').hidden),
      'e "Concluir e entrar" continua ali — senão a volta seria terminar as seis');
    t(await p.evaluate(()=>S.voltaDe)==='entrar','sem mexer em voltaDe: concluir continua caindo no feed');
  }

  /* ============ a tabela em duas colunas ============ */
  const cols=await p.locator('#cd-tab thead th').allTextContents();
  t(cols.length===3,'a tabela tem função + duas colunas de valor');
  t(/Só eu/i.test(cols[1]),'a primeira é "'+cols[1]+'"');
  t(/equipamento/i.test(cols[2]),'e a segunda é "'+cols[2]+'"');
  const conta=await p.evaluate(()=>{
    const f=EU.func[0]||FUNCOES[0];
    PRECOS.base[f]=1000; porComeq(f,1400);
    const semEq=calcular(EU,{func:f,periodo:"custom",horas:10,fds:false,fora:false,equip:false});
    const comEq=calcular(EU,{func:f,periodo:"custom",horas:10,fds:false,fora:false,equip:true});
    /* quem cota o MESMO valor nas duas está dizendo que o equipamento já
       está dentro — cobrar de novo seria a plataforma inventando dinheiro */
    porComeq(f,1000);
    const igual=calcular(EU,{func:f,periodo:"custom",horas:10,fds:false,fora:false,equip:true});
    /* e quem preencheu SÓ a coluna do equipamento tem tabela do mesmo jeito */
    delete PRECOS.base[f]; porComeq(f,1400);
    const soEq=calcular(EU,{func:f,periodo:"custom",horas:10,fds:false,fora:false,equip:false});
    PRECOS.base[f]=1000; porComeq(f,1400);
    return {semEq:semEq&&semEq.total,comEq:comEq&&comEq.total,
            igual:igual&&igual.total,soEq:soEq&&soEq.total};
  });
  t(conta.semEq===1000,'sem o equipamento dele, a conta é o cachê: '+conta.semEq);
  t(conta.comEq===1400,'com o equipamento, o total é o da segunda coluna: '+conta.comEq);
  t(conta.igual===1000,
    'e cotar o MESMO valor nas duas quer dizer "já está dentro" — a plataforma não cobra duas vezes');
  t(conta.soEq===1400,'quem preencheu só uma das colunas TEM tabela: o piso é o que ele declarou');

  /* ============ drone não é acessório ============
     Guilherme, sobre o painel de equipamento. Está certo: drone é
     aeronave, tem regra própria, e "Op. de drone" é função separada no
     catálogo desta casa desde sempre. */
  await p.evaluate(()=>{cadTodo=true;drawCadPasso();show('meu')}); await p.waitForTimeout(500);
  const grupos=await p.evaluate(()=>[...document.querySelectorAll('#v-meu .eqgrupo')].map(g=>{
    const l=g.querySelector('.eqlab');
    return {lab:l?l.textContent.trim():'',togs:[...g.querySelectorAll('.eqtog')].map(x=>x.textContent.trim())};
  }).filter(x=>x.togs.length));
  const aereo=grupos.find(g=>g.togs.includes('Drone'));
  const acess=grupos.find(g=>g.togs.includes('Gimbal'));
  t(aereo&&/Aéreo/i.test(aereo.lab),'⟶ drone tem grupo próprio: "'+(aereo||{}).lab+'"');
  t(acess&&/Acessório/i.test(acess.lab),'gimbal continua sendo acessório, que é o que ele é');
  t(aereo!==acess,'e os dois não moram no mesmo grupo — era isso que a tela dizia errado');

  /* ============ uma conta só ============ */
  t(await p.locator('#modo-tog').isVisible(),
    'o botão de trocar de lado aparece para quem NÃO assina — a conta é uma só');
  t(await p.evaluate(()=>ASSINANTE)===false,'e esta conta é grátis mesmo');
  await p.locator('#modo-tog').click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>MODO)==='contratante','o freela grátis vira contratante');
  /* ⚠️ ABRIR NÃO VAZA NADA: toda tranca é por DEGRAU, não por chapéu */
  t(await p.evaluate(()=>!podeVerAgenda()),
    'e encontra a vitrine trancada — ver quem está livre continua exigindo o Volante');
  await p.locator('#modo-tog').click(); await p.waitForTimeout(350);
  t(await p.evaluate(()=>MODO)==='freela','e volta');

  /* ============ o convite da tabela, quando a consulta chega ============ */
  await p.evaluate(()=>{PRECOS.base={};PRECOS.comeq={};show('propostas');drawPropostas()});
  await p.waitForTimeout(450);
  const esperando=await p.evaluate(()=>PROPOSTAS.filter(x=>x.status==='novo').length);
  t(esperando>0,'há consulta esperando resposta: '+esperando);
  t(await p.locator('#pp-tabela .guconv').count()===1,
    'sem tabela publicada, a caixa oferece publicar — é o momento em que ela rende');
  const conv=await p.locator('#pp-tabela').textContent();
  t(/abaixo/.test(conv),
    'e o argumento é verificável: sem tabela não há como avisar que a consulta veio abaixo do seu valor');
  await p.evaluate(()=>{PRECOS.base[EU.func[0]]=900;drawPropostas()}); await p.waitForTimeout(350);
  t(await p.locator('#pp-tabela .guconv').count()===0,'publicou a tabela, o convite some');
  await p.evaluate(()=>{MODO='contratante';aplicarModo();PRECOS.base={};drawPropostas()});
  await p.waitForTimeout(350);
  t(await p.locator('#pp-tabela .guconv').count()===0,
    'e ele nunca aparece do lado de quem contrata — quem contrata não tem tabela para publicar');

  await ctx.close(); await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  process.exit(bad.length||errs.length?1:0);
})();
