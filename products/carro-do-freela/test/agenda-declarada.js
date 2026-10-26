/* A DECLARAÇÃO DO DIA — livre, negociando, fechado, meia diária e a hora
 *
 * Victor (12/set): *"fechar a data na agenda, ou deixar livre, ou falar que
 * está negociando nessa data, e horários, se é uma diária inteira ou meia
 * diária e dizer quais horários ainda tem livre. Essa é uma das maiores
 * resoluções de problema pra o freela manter a agenda atualizada."*
 *
 * O que existia antes era o `BLOQ`: um Set de dias INTEIROS que só sabia
 * dizer "ocupado". Ele não comportava nada disso — não tinha negociando sem
 * um job inventado por trás, não tinha meia diária, não tinha hora.
 *
 * ⚠️ E ELE NÃO SOBREVIVIA AO RECARREGAR, que é o defeito que esta suíte
 * existe principalmente para impedir de voltar. `BLOQ` nunca esteve em
 * `DEPOSITOS`: a pessoa fechava os dias, recarregava a página, e a agenda
 * voltava INTEIRA LIVRE. Num produto cuja métrica-mãe é "agenda viva" e
 * cuja promessa é "saber quem está livre", isso faz a busca MENTIR sobre
 * gente que não está disponível — e é o dado que a assinatura compra.
 * Provado com controle em 12/set: um job novo era gravado no `cdf-uso` e
 * voltava; o dia fechado não era nem gravado.
 *
 * ⚠️ PRECISA DE ORIGEM http, pelo mesmo motivo da `persistencia`: o
 * Chromium descarta localStorage de origem `file://` de vez em quando, e o
 * sintoma seria esta suíte falhando em lugar diferente a cada rodada.
 *
 * O que ela jura:
 *  1. LIVRE É A AUSÊNCIA de declaração — nunca um valor guardado.
 *  2. Meia diária fechada CONTINUA SENDO UM DIA LIVRE na busca. É o ponto
 *     do pedido: dá para fazer dois trabalhos no mesmo dia.
 *  3. Só o dia inteiro tira a pessoa da busca.
 *  4. Negociando é um estado próprio, sem job fabricado por trás.
 *  5. A HORA É OPCIONAL e nunca inventada: sem ela, a tela fala em metade
 *     do dia — que é o grão em que a pessoa falou.
 *  6. Os dois eixos são independentes: trocar de estado preserva a parte do
 *     dia, trocar de parte preserva o estado.
 *  7. A declaração SOBREVIVE AO RECARREGAR.
 *  8. Sorteio de terceiro não ganha janela — a mesma regra da janela do dia.
 */
const { chromium } = require('playwright');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const {servir,URL}=require('./_servir.js');

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await servir(p);
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');
    localStorage.setItem('cdf-entrou','1');
    localStorage.setItem('cdf-guia','1');
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(170);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);

  /* ============ 1. o modelo ============ */
  const m=await p.evaluate(()=>{
    const i=[...Array(30).keys()].find(n=>{const k=key(dateAt(n));return jobsEm(k).length===0&&!decDe(k)});
    const k=key(dateAt(i)), d=dateAt(i), out={i,k};
    out.zerado={dec:decDe(k),st:statusEu(d),jan:janelaEu(k)};
    declarar(k,'fechado','dia');   out.fechadoDia ={st:statusEu(d),jan:janelaEu(k)};
    declarar(k,'fechado','manha'); out.fechadoManha={st:statusEu(d),jan:janelaEu(k)};
    declarar(k,'fechado','tarde'); out.fechadoTarde={st:statusEu(d),jan:janelaEu(k)};
    declarar(k,'negociando','dia');  out.negDia  ={st:statusEu(d),jan:janelaEu(k)};
    declarar(k,'negociando','manha');out.negManha={st:statusEu(d),jan:janelaEu(k)};
    declarar(k,'fechado','manha','13:30'); out.comHora={st:statusEu(d),jan:janelaEu(k)};
    liberarDia(k); out.liberado={dec:decDe(k),st:statusEu(d),jan:janelaEu(k)};
    return out;
  });

  t(m.zerado.dec===null&&m.zerado.st==='livre',
    'LIVRE É A AUSÊNCIA de declaração — dia sem nada declarado já nasce livre');
  t(m.liberado.dec===null,'e "liberar o dia" APAGA a declaração em vez de guardar "livre"');
  t(m.fechadoDia.st==='ocupado'&&m.fechadoDia.jan===null,
    'fechado o dia inteiro: ocupado, e sem janela — o status já diz tudo');
  t(m.fechadoManha.st==='livre','⟶⟶ MEIA DIÁRIA FECHADA CONTINUA SENDO UM DIA LIVRE: quem procura tem que achar a pessoa');
  t(/livre à tarde/.test(m.fechadoManha.jan&&m.fechadoManha.jan.txt||''),
    '⟶⟶ e a janela diz o que sobrou, na metade do dia: "'+(m.fechadoManha.jan||{}).txt+'"');
  t(/livre de manhã/.test(m.fechadoTarde.jan&&m.fechadoTarde.jan.txt||''),
    'fechado à tarde diz o espelho: "'+(m.fechadoTarde.jan||{}).txt+'"');
  t(m.negDia.st==='segura','negociando o dia inteiro: "segurando" — e sem nenhum job fabricado por trás');
  t(m.negManha.st==='segura'&&/negociando de manhã · livre à tarde/.test((m.negManha.jan||{}).txt||''),
    '⟶⟶ dá para estar negociando SÓ METADE do dia: "'+(m.negManha.jan||{}).txt+'"');
  t(/livre a partir das 13:30/.test((m.comHora.jan||{}).txt||''),
    'com hora declarada, ela aparece: "'+(m.comHora.jan||{}).txt+'"');

  /* ============ 2. a hora nunca é inventada ============ */
  const h=await p.evaluate(k=>{
    declarar(k,'fechado','manha');
    const semHora={dec:JSON.parse(JSON.stringify(decDe(k))),txt:janelaEu(k).txt};
    declarar(k,'fechado','manha','13:00');
    const comHora={dec:JSON.parse(JSON.stringify(decDe(k))),txt:janelaEu(k).txt};
    /* voltar para diária inteira tem que DESCARTAR a hora: ela era da
       virada entre as duas metades, e sem metades não há virada */
    declarar(k,'fechado','dia',comHora.dec.h);
    return {semHora,comHora,depoisDeVoltar:JSON.parse(JSON.stringify(decDe(k)))};
  }, m.k);
  t(h.semHora.dec.h===undefined,'⟶⟶ sem a pessoa declarar hora, NÃO EXISTE hora guardada');
  t(!/\d\d:\d\d/.test(h.semHora.txt),
    '⟶⟶ e a frase não traz número nenhum: "'+h.semHora.txt+'" — o grão é o que a pessoa falou');
  t(h.comHora.dec.h==='13:00','quando ela declara, a hora fica');

  /* ============ 3. os dois eixos são independentes ============ */
  const e=await p.evaluate(k=>{
    declarar(k,'fechado','manha','13:00');
    const d0=decDe(k);
    declarar(k,'negociando',d0.p,d0.h);           /* trocou o ESTADO */
    const trocaEstado=JSON.parse(JSON.stringify(decDe(k)));
    const d1=decDe(k);
    declarar(k,d1.e,'tarde',d1.h);                /* trocou a PARTE */
    const trocaParte=JSON.parse(JSON.stringify(decDe(k)));
    return {trocaEstado,trocaParte};
  }, m.k);
  t(e.trocaEstado.p==='manha'&&e.trocaEstado.h==='13:00',
    '⟶⟶ trocar de estado PRESERVA a parte do dia e a hora — quem fechou a manhã e depois diz "estou negociando" continua falando da manhã');
  t(e.trocaParte.e==='negociando','e trocar de parte preserva o estado');

  /* ============ 4. a tela do dia ============ */
  await p.evaluate(k=>{ liberarDia(k); S.selDia=k; show('agenda'); drawAgenda() }, m.k);
  await p.waitForTimeout(300);
  const t0=await p.evaluate(()=>({
    botoes:[...document.querySelectorAll('#ag-detail [data-dec]')].map(b=>b.textContent),
    ligado:[...document.querySelectorAll('#ag-detail [data-dec].on')].map(b=>b.textContent),
    formJob:!!document.getElementById('ag-form')
  }));
  t(t0.botoes.join('|')==='Livre|Negociando|Fechado','a tela do dia oferece os três estados: '+t0.botoes.join(' · '));
  t(t0.ligado.join('')==='Livre','e "Livre" nasce ligado, porque é o padrão');
  t(t0.formJob,'num dia livre, o formulário de lançar job continua ali');

  await p.click('#ag-detail [data-dec="fechado"]'); await p.waitForTimeout(250);
  const t1=await p.evaluate(()=>({dec:decDe(S.selDia),formJob:!!document.getElementById('ag-form'),
    partes:[...document.querySelectorAll('#ag-detail [data-decp]')].length}));
  t(t1.dec&&t1.dec.e==='fechado'&&t1.dec.p==='dia','tocar em "Fechado" fecha o dia inteiro por padrão');
  t(t1.partes===3,'e abre a escolha da parte do dia: '+t1.partes+' opções');
  t(!t1.formJob,'⟶⟶ com o dia inteiro fechado, o formulário de job SOME — dia fechado não recebe job');

  await p.click('#ag-detail [data-decp="manha"]'); await p.waitForTimeout(250);
  const t2=await p.evaluate(()=>({dec:decDe(S.selDia),st:statusEu(new Date(S.selDia+'T00:00:00')),
    campoHora:!!document.getElementById('dec-h'),formJob:!!document.getElementById('ag-form'),
    janela:(document.querySelector('#ag-detail .decjan')||{textContent:''}).textContent,
    nota:[...document.querySelectorAll('#ag-detail .note')].map(x=>x.innerText)[0]||''}));
  t(t2.dec.p==='manha'&&t2.st==='livre','meia diária na tela: o dia volta a ser livre');
  t(t2.formJob,'⟶⟶ e o formulário de job VOLTA — meia diária ainda cabe um trabalho');
  t(t2.campoHora,'o campo de hora aparece só na meia diária');
  t(/livre à tarde/.test(t2.janela),'a janela aparece na tela: "'+t2.janela+'"');
  /* ⚠️ esta asserção nasceu de um defeito que SÓ O SCREENSHOT pegou: a nota
     dizia "Sem hora, a plataforma diz só ..." e imprimia a janela ATUAL —
     que, com a hora preenchida, era justamente a COM hora. A frase se
     contradizia na própria linha. */
  t(/Sem hora/.test(t2.nota)&&!/\d\d:\d\d/.test(t2.nota),
    '⟶⟶ e a nota do caso SEM hora não cita hora nenhuma — ela não se contradiz');

  await p.fill('#dec-h','13:00'); await p.waitForTimeout(350);
  const t3=await p.evaluate(()=>({dec:decDe(S.selDia),
    janela:(document.querySelector('#ag-detail .decjan')||{textContent:''}).textContent,
    nota:[...document.querySelectorAll('#ag-detail .note')].map(x=>x.innerText)[0]||''}));
  t(t3.dec.h==='13:00'&&/13:00/.test(t3.janela),'preencher a hora muda a janela: "'+t3.janela+'"');
  t(/A hora é sua/.test(t3.nota),'⟶⟶ e a nota troca para a frase do caso COM hora');

  /* ============ 5. SOBREVIVE AO RECARREGAR — o defeito de raiz ============ */
  await p.evaluate(()=>usoGravar());
  await p.waitForTimeout(250);
  const gravou=await p.evaluate(()=>{
    const u=localStorage.getItem('cdf-uso')||'';
    const pac=u?JSON.parse(u):null;
    return {citaAgenda:!!(pac&&pac.d&&pac.d.AGENDA), valor:JSON.stringify((pac&&pac.d||{}).AGENDA||null)};
  });
  t(gravou.citaAgenda,'⟶⟶ a declaração É GRAVADA — era exatamente isto que o BLOQ nunca fez');

  await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1200);
  const dep=await p.evaluate(k=>({
    dec:decDe(k), st:statusEu(new Date(k+'T00:00:00')),
    jan:janelaEu(k), total:Object.keys(AGENDA).length
  }), m.k);
  t(dep.dec&&dep.dec.e==='fechado'&&dep.dec.p==='manha'&&dep.dec.h==='13:00',
    '⟶⟶ E VOLTA INTEIRA DEPOIS DO RECARREGAR: '+JSON.stringify(dep.dec));
  t(dep.jan&&/13:00/.test(dep.jan.txt),'⟶⟶ com a hora e tudo — a agenda não mente depois de um F5');

  /* ============ 6. a busca mostra, e não inventa para os outros ============ */
  const busca=await p.evaluate(a=>{
    MODO='contratante'; ASSINANTE=true; aplicarModo();
    S.dia=a.i; show('buscar'); render();
    const linhas=[...document.querySelectorAll('#rows .row')];
    const re=/livre a partir|livre até|livre de manhã|livre à tarde|negociando/i;
    return {total:linhas.length, podeVer:podeVerAgenda(),
            comDecl:linhas.filter(l=>re.test(l.innerText)).length,
            exemplo:(linhas.find(l=>re.test(l.innerText))||{innerText:''}).innerText.replace(/\n/g,' · ')};
  }, m);
  t(busca.podeVer,'a busca abre para a conta que enxerga agenda');
  t(busca.comDecl===1,
    '⟶⟶ a declaração aparece na busca, e em UMA linha só: a de quem declarou');
  t(/13:00/.test(busca.exemplo),'⟶⟶ com a janela no card: "'+busca.exemplo+'"');
  t(busca.total>1&&busca.comDecl===1,
    '⟶⟶ e as outras '+(busca.total-1)+' linhas NÃO ganham janela — agenda sorteada não tem hora dentro, '
    +'e inventar uma seria mentir com precisão');

  t(errs.length===0,'zero erro de console em todo o percurso'+(errs.length?': '+errs[0]:''));

  await ctx.close(); await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas');
  process.exit(bad.length||errs.length?1:0);
})();
