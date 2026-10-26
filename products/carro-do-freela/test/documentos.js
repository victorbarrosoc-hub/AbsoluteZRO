/**
 * DOCUMENTOS DE PRODUÇÃO — ordem do dia e boletim de câmera.
 *
 * Pedido do Victor: "ordem do dia, boletim de câmera, ferramentas de
 * documento pra produção."
 *
 * O que esta suíte protege:
 *   - a ORDEM DO DIA é um CRONOGRAMA EM TABELA do dia inteiro, bloco a
 *     bloco, com hora de início e fim em cada linha — foi o Victor que
 *     mandou uma OD de verdade e mostrou que o que havia aqui era um
 *     briefing, não uma OD;
 *   - e os horários se ENCADEIAM: a produção digita DURAÇÃO, a hora é
 *     derivada. Mexer numa preparação anda com o dia inteiro — é a conta
 *     que a planilha obriga a refazer à mão;
 *   - o cabeçalho HORÁRIOS (chegada, filmando, fim do set), as refeições e
 *     a lista de locações saem TODOS da tabela: ninguém digita duas vezes;
 *   - o resto continua derivado do job (data, equipe com função, briefing,
 *     referências). A produção só preenche o que a plataforma não tem como
 *     saber — e é isso que justifica ela morar aqui e não num Docs;
 *   - PREVISÃO DO TEMPO é campo, não mágica: consultar serviço de tempo é
 *     chamada de rede, e esta página não faz nenhuma. Chutar seria a
 *     mentira mais cara do documento — é por essa linha que a equipe
 *     decide se leva capa de chuva;
 *   - quem EDITA é quem contrata; o freela ABRE e copia, porque é ele que
 *     precisa dela no bolso às 6h;
 *   - a chamada por pessoa cai para a geral quando não é preenchida;
 *   - o BOLETIM puxa a câmera da lista de equipamento do job COM O NÚMERO
 *     DE SÉRIE do dossiê — é o fecho do circuito inventário → lista →
 *     boletim → ocorrência;
 *   - um boletim por CORPO de câmera, que é como a ilha recebe;
 *   - o take se numera sozinho dentro da cena: na diária ninguém tem mão
 *     livre para contar;
 *   - e os dois papéis BAIXAM como documento de verdade, em tabela, com o
 *     timbre do usuário: copiar texto resolvia o WhatsApp e mais nada.
 */
const { chromium } = require('playwright');
const path=require('path');
const fs=require('fs');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
/* quantos campos a produção preenche à mão: estacionamento, hospital,
   contato de emergência, previsão do tempo, observações e a motivação */
const OD_N=6;
const emMin=h=>{const m=/^(\d{1,2}):(\d{2})/.exec(h||"");return m?+m[1]*60+ +m[2]:null};
const horaDepois=(a,b)=>emMin(a)>emMin(b);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const ctx=await b.newContext({viewport:{width:1440,height:1300},deviceScaleFactor:2,acceptDownloads:true});
  const p=await ctx.newPage();
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
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(180);
  await p.locator('[data-login="Google"]').click(); /* 17/out · 13: só Google e a conta oficial */ await p.waitForTimeout(650);
  await p.evaluate(()=>show("jobs")); await p.waitForTimeout(550);

  /* ============ ordem do dia ============ */
  t(await p.locator('[data-odjob]').count()===1,'o painel do job leva à ordem do dia');
  await p.locator('[data-odjob]').click(); await p.waitForTimeout(450);
  t(await p.locator('#ovl32').isVisible(),'ela abre');
  t(!await p.locator('#od-edit').isHidden(),'quem contrata edita — a ordem do dia é documento dela');
  const doc0=await p.locator('#od-doc').textContent();
  t(/Op\. de câmera/.test(doc0),'com a equipe e a função de cada um');
  t(doc0.length>400,'e o briefing junto — 80% dele é derivado, ninguém redigita');
  t(await p.locator('[data-odc]').count()===OD_N,'os campos a preencher são só os que a plataforma não sabe');

  /* ============ ORDEM DO DIA É CRONOGRAMA ============
     Victor mandou a OD de verdade de um episódio: "Ordem do dia, mais
     conhecida como OD, é um cronograma em tabela de tudo que vai acontecer
     no dia." O que havia aqui era um briefing — quem é quem, onde, o que
     levar. Isso é a metade de baixo de uma OD; a de cima é a TABELA. */
  t(await p.locator('#od-doc .odtab').count()>=1,'a ordem do dia tem TABELA — é isso que a faz ser OD');
  const cab=await p.locator('#od-doc .odtab').first().locator('th').allTextContents();
  t(['Cena','Luz','Loc/Set','Sinopse','Hora'].every(c=>cab.includes(c)),
    'com as colunas da OD de papel: '+cab.join(' · '));
  const cr0=await p.evaluate(()=>cronoOD(ESCALAS.find(x=>x.id===jobAberto)));
  t(cr0.linhas.length>=10,'o dia vem montado bloco a bloco ('+cr0.linhas.length+')');
  t(cr0.linhas.every(l=>/^\d{2}:\d{2}$/.test(l.deH)&&/^\d{2}:\d{2}$/.test(l.ateH)),
    'e CADA linha tem hora de início e de fim');
  /* a cadeia: o fim de um bloco é o começo do próximo */
  t(cr0.linhas.every((l,i)=>!i||l.de===cr0.linhas[i-1].ate),
    'os blocos se encadeiam — o fim de um é o começo do seguinte, sem buraco');
  /* o cabeçalho HORÁRIOS é derivado, não digitado */
  const cenas0=cr0.linhas.filter(l=>l.t==='cena');
  t(cr0.filmando===cenas0[0].deH,'"Filmando" é a primeira CENA, não a chegada da equipe');
  t(cr0.fimSet===cr0.linhas[cr0.linhas.length-1].ateH,'"Fim do set" é onde a cadeia termina');
  t(/Chegada da equipe no set/.test(doc0)&&/Fim do set/.test(doc0),
    'e os três saem impressos no cabeçalho, como na OD de papel');
  t(cr0.locais.length>=2&&doc0.includes(cr0.locais[0]),
    'as locações saem da própria tabela — ninguém digita duas vezes ('+cr0.locais.join(', ')+')');
  t(cr0.refeicoes.length>=1&&/Refeições/.test(doc0),'as refeições também, com a hora delas');

  /* ⟶ O CORAÇÃO DA TELA: mexer numa duração anda com o dia inteiro */
  const fimAntes=cr0.fimSet, filmAntes=cr0.filmando;
  const durAntes=await p.inputValue('[data-odm="1"]');
  await p.fill('[data-odm="1"]',String(+durAntes+30)); await p.waitForTimeout(400);
  const cr1=await p.evaluate(()=>cronoOD(ESCALAS.find(x=>x.id===jobAberto)));
  t(horaDepois(cr1.fimSet,fimAntes),'somar 30min numa preparação empurra o FIM DO SET ('+fimAntes+' → '+cr1.fimSet+')');
  t(horaDepois(cr1.filmando,filmAntes),'e tudo que vem depois anda junto — é a conta que a planilha faz refazer à mão');
  t((await p.locator('#od-doc').textContent()).includes(cr1.fimSet),
    'e o documento já sai com a hora nova, sem gerar de novo');
  await p.fill('[data-odm="1"]',durAntes); await p.waitForTimeout(350);

  /* reordenar também recalcula */
  const t0=await p.evaluate(()=>cronoOD(ESCALAS.find(x=>x.id===jobAberto)).linhas[0].t);
  await p.locator('[data-oddesce="0"]').click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>cronoOD(ESCALAS.find(x=>x.id===jobAberto)).linhas[1].t)===t0,
    'descer um bloco reordena de verdade');
  t(await p.evaluate(()=>cronoOD(ESCALAS.find(x=>x.id===jobAberto)).linhas[0].deH)===cr0.chegada,
    'e o primeiro bloco continua começando na chamada, seja ele qual for');
  await p.locator('[data-odsobe="1"]').click(); await p.waitForTimeout(400);

  /* acrescentar bloco */
  const n0=await p.locator('#od-crono .odln').count();
  await p.locator('[data-odnovo="cena"]').click(); await p.waitForTimeout(400);
  t(await p.locator('#od-crono .odln').count()===n0+1,'dá para acrescentar bloco pelo tipo');
  await p.locator('[data-odtira="'+n0+'"]').click(); await p.waitForTimeout(400);
  t(await p.locator('#od-crono .odln').count()===n0,'e tirar');

  /* previsão do tempo: campo, nunca chute */
  t(await p.locator('[data-odc="tempo"]').count()===1,'a previsão do tempo é CAMPO da produção');
  const ph=await p.getAttribute('[data-odc="tempo"]','placeholder');
  t(/não consulta serviço de tempo/.test(ph),
    'e a tela diz que a plataforma não consulta serviço de tempo aqui dentro — chutar seria mentira cara');

  /* convidados */
  await p.locator('#od-conv-add').click(); await p.waitForTimeout(350);
  const iC=(await p.locator('#od-conv .odln').count())-1;
  await p.fill('[data-odcv="nome"][data-odci="'+iC+'"]','Dona Marlene | moradora');
  await p.fill('[data-odcv="hora"][data-odci="'+iC+'"]','09:40'); await p.waitForTimeout(350);
  const docC=await p.locator('#od-doc').textContent();
  t(/Dona Marlene/.test(docC)&&/09:40/.test(docC),
    'convidado entra em tabela própria, com a hora em que ele precisa estar lá');
  await p.locator('[data-odcx="'+iC+'"]').click(); await p.waitForTimeout(300);
  await p.fill('[data-odc="hospital"]','Hospital do Coração — Nascimento de Castro 1597');
  await p.waitForTimeout(300);
  t(/Hospital do Coração/.test(await p.locator('#od-doc').textContent()),
    'preencher entra no documento na hora');
  const geral=await p.evaluate(()=>ESCALAS.find(x=>x.id===jobAberto).chamada);
  t(new RegExp(geral.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(await p.locator('#od-doc').textContent()),
    'sem chamada individual, todo mundo herda a geral ('+geral+')');
  await p.locator('[data-odch="1"]').fill('06:30'); await p.waitForTimeout(300);
  t(/06:30/.test(await p.locator('#od-doc').textContent()),
    'e quem chega antes ganha a própria — elétrica não chega com a edição');
  const txt=await p.evaluate(()=>docOrdemDia(ESCALAS.find(x=>x.id===jobAberto)).txt);
  t(/ORDEM DO DIA/.test(txt)&&/Hospital do Coração/.test(txt),'existe versão em texto, para o grupo do job');
  t(/gere de novo/.test(await p.locator('#od-doc').textContent()),
    'e o documento avisa para gerar de novo se a escala mudar');
  await p.locator('#od-x').click(); await p.waitForTimeout(250);

  /* ============ boletim de câmera ============ */
  const prep=await p.evaluate(()=>{
    const it=invItens().find(x=>x.cat==="camera");
    it.serie="SN-CAM-771";
    const l=listaDo(jobAberto);
    l.itens.push({ref:it.id,t:it.t,de:"",saiu:true,voltou:false});
    return {t:it.t,serie:it.serie};});

  /* ⚠️ O BOLETIM NÃO VEM DE GRAÇA NO JOB, e é decisão de produto: documento
     do dia virou LISTA ESCOLHIDA (TIPOS_DOC + "Adicionar"), porque nem todo
     job tem boletim — publicidade tem, casamento não. Esta suíte clicava
     direto no [data-boljob] e estourou quando a lista virou escolhida: o
     botão só existe depois que alguém disse que o job tem. */
  t(await p.locator('[data-boljob]').count()===0,
    'o job começa sem boletim — documento é o que ELE precisa, não um formulário fixo');
  await p.locator('[data-dcadd]').first().click(); await p.waitForTimeout(300);
  t(await p.locator('#ovl-doc').isVisible(),'"Adicionar" abre a lista de tipos de documento');
  t(await p.locator('[data-dctipo]').count()===4,'com os quatro tipos que o job pode ter');
  await p.locator('[data-dctipo="boletim"]').click(); await p.waitForTimeout(450);
  t(await p.locator('#ovl33').isVisible(),'escolher "Boletim de câmera" leva direto ao editor');
  await p.locator('#bol-x').click(); await p.waitForTimeout(250);
  t(await p.locator('[data-boljob]').count()===1,'e o job passa a listar o boletim');
  await p.locator('[data-boljob]').click(); await p.waitForTimeout(450);
  t(await p.locator('#ovl33').isVisible(),'o boletim abre pelo painel do job');
  t(await p.locator('[data-bolnovo]').count()===1,'a câmera que está na lista do job aparece para abrir boletim');
  await p.locator('[data-bolnovo]').click(); await p.waitForTimeout(450);
  t(await p.locator('#ovl34').isVisible(),'e abre o boletim dela');
  t(await p.inputValue('#bl-cam')===prep.t,'já com o corpo de câmera preenchido');
  t(await p.inputValue('#bl-serie')===prep.serie,
    'e com o NÚMERO DE SÉRIE do dossiê — inventário → lista → boletim, sem redigitar');
  t(await p.locator('[data-blc]').count()===8,'com os campos de configuração que o boletim pede');

  /* takes */
  await p.fill('#bl-cena','12A'); await p.locator('#bl-add').click(); await p.waitForTimeout(180);
  await p.fill('#bl-cena','12A'); await p.fill('#bl-obs','foco escapou'); await p.locator('#bl-add').click(); await p.waitForTimeout(180);
  await p.fill('#bl-cena','12B'); await p.locator('#bl-add').click(); await p.waitForTimeout(180);
  t(await p.locator('.bolt').count()===3,'os takes entram na ordem em que a diária anda');
  t(await p.evaluate(()=>BOLETINS[0].takes.map(t=>t.cena+"/"+t.take).join(" "))==='12A/1 12A/2 12B/1',
    'e se numeram sozinhos DENTRO da cena — ninguém conta take com a mão ocupada');
  /* a cena FICA no campo depois de lançar, e isso é de propósito: numa
     diária você repete a mesma cena várias vezes seguidas. Só o take e a
     observação limpam. */
  await p.locator('#bl-add').click(); await p.waitForTimeout(200);
  t(await p.locator('.bolt').count()===4,'a cena fica no campo: lançar de novo é o próximo take dela');
  t(await p.evaluate(()=>BOLETINS[0].takes[3].take)==='2','numerado em seguida, sem redigitar a cena');
  await p.evaluate(()=>{ BOLETINS[0].takes.pop(); pintarBoletim(); }); await p.waitForTimeout(200);
  await p.fill('#bl-cena',''); await p.locator('#bl-add').click(); await p.waitForTimeout(200);
  t(await p.locator('.bolt').count()===3,'sem cena não lança: é a cena que identifica o take');
  await p.locator('[data-blok="0"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-blng="1"]').click(); await p.waitForTimeout(250);
  const conta=await p.locator('#bl-conta').textContent();
  t(/1 aproveitável/.test(conta)&&/1 descartado/.test(conta),'OK e NG contam separado: '+conta.replace(/\s+/g,' '));
  t(await p.locator('.bolt.ok2').count()===1&&await p.locator('.bolt.ng2').count()===1,
    'e a linha muda de cor com o estado');
  await p.locator('[data-blok="0"]').click(); await p.waitForTimeout(200);
  t(await p.locator('.bolt.ok2').count()===0,'clicar de novo desmarca — errar no calor da diária é normal');
  const bdoc=await p.locator('#bl-doc').textContent();
  t(new RegExp(prep.serie).test(bdoc),'o documento carrega a série da câmera');
  t(/[Vv]ai junto com o cartão/.test(bdoc),'e diz para que serve: é o que a ilha lê antes de abrir o material');
  await p.locator('#bl-x').click(); await p.waitForTimeout(350);
  t(await p.locator('#ovl33').isVisible()&&await p.locator('[data-bolabre]').count()===1,
    'voltar leva à lista de boletins do job — um por corpo de câmera');

  /* ============ o freela lê, não edita ============ */
  await p.locator('#bol-x').click(); await p.waitForTimeout(250);
  await p.evaluate(()=>{ MODO="freela"; aplicarModo(); show("jobs"); }); await p.waitForTimeout(500);
  await p.locator('[data-odjob]').first().click(); await p.waitForTimeout(400);
  t(await p.locator('#od-edit').isHidden(),'do lado do freela a ordem do dia não é editável');
  t(/Ordem do dia/.test(await p.locator('#od-doc').textContent()),'mas ele lê e copia — é ele que precisa dela às 6h');

  /* ============ celular ============ */
  await p.locator('#od-x').click(); await p.waitForTimeout(200);
  await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>show("jobs")); await p.waitForTimeout(400);
  await p.locator('[data-odjob]').first().click(); await p.waitForTimeout(400);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no celular: '+ov);

  /* ============ BAIXAR O DOCUMENTO ============
     Victor: "não queria só poder copiar o texto da OD, ou do boletim, ou
     do roteiro; quero que ele consiga baixar um documento em tabela já
     pronto, com a ID visual do usuário."
     Texto colado perde a TABELA, que nestes papéis É a informação. */
  await p.evaluate(()=>{MODO="contratante";aplicarModo();abrirOrdemDia(1)}); await p.waitForTimeout(600);
  const bts=await p.locator('#od-fim button').allTextContents();
  t(bts.some(x=>/Baixar em Word/.test(x)),'a ordem do dia BAIXA como documento');
  t(bts.some(x=>/Imprimir|PDF/.test(x)),'e imprime — que no celular é como se salva um PDF');
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:9000}),
    p.locator('[data-baixar="od"]').click()]);
  t(/\.doc$/.test(dl.suggestedFilename()),'o arquivo sai .doc — Word, Docs e Pages abrem e mantêm a tabela');
  t(/ordem-do-dia/.test(dl.suggestedFilename()),
    'com nome que diz o que é: '+dl.suggestedFilename());
  const arq=path.join(require('os').tmpdir(),'cdf-od-baixada.doc');
  await dl.saveAs(arq);
  const folha=fs.readFileSync(arq,'utf8');
  t(/^\ufeff?<!DOCTYPE html>/.test(folha),'é documento completo, não um pedaço de HTML solto');
  t(/<table/.test(folha)&&(folha.match(/<tr/g)||[]).length>=12,
    'com a TABELA do dia dentro ('+(folha.match(/<tr/g)||[]).length+' linhas)');
  t(/Loc\/Set/.test(folha)&&/Sinopse/.test(folha),'com as colunas da OD de papel');
  t(/border-bottom:3px solid/.test(folha),'e o TIMBRE do usuário no topo — a identidade visual dele');
  /* a folha declara os tokens claros: sem isso o documento sai com texto
     branco em papel branco, porque o HTML da tela usa var(--cal) */
  t(/--cal:#1B1815/.test(folha),'os tokens vão em versão CLARA — é papel, não tela');
  t(!/#121110/.test(folha),'e nenhum token escuro vaza junto');
  t(/@page/.test(folha)&&/@media print/.test(folha),'com regra de impressão, para sair certo no PDF');

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();
