/* A ORDEM DO DIA SAI E VOLTA — e o orçamento deixa de estar escondido.
 *
 * Victor (24/ago): *"a ordem do dia só deixa montar no app; coloque uma
 * opção pra subir o documento da OD também, e de baixar um modelo com
 * tabelas pra ele preencher e depois subir. Às vezes a pessoa quer
 * preencher depois, ou editar, ou ir adicionando conforme organiza."*
 * E: *"a aba orçamento a partir de roteiro tá bem escondida e não está
 * adequada ao tamanho da tela."*
 *
 * O que esta suíte jura:
 * 1. O CICLO FECHA. O modelo sai com as colunas que o leitor procura, e
 *    o que volta é o mesmo cronograma — bloco a bloco, na mesma ordem.
 *    Se alguém trocar uma coluna do modelo sem trocar no leitor, quebra
 *    CALADO (o arquivo continua abrindo no Word), e é isso que a suíte
 *    existe para pegar.
 * 2. NADA É APLICADO EM SILÊNCIO. O que foi lido aparece ANTES, com o
 *    número de blocos e a opção de descartar. Trocar o cronograma de um
 *    dia de gravação sem confirmar é perda que ninguém desfaz na véspera.
 * 3. ARQUIVO QUE NÃO DÁ PARA LER DIZ POR QUÊ, e não some com o que a
 *    pessoa já tinha montado.
 * 4. AS HORAS SÃO SEMPRE RECALCULADAS a partir da chamada — a coluna de
 *    hora do arquivo é ignorada de propósito.
 * 5. O ORÇAMENTO ABRE PELO ROTEIRO, tem porta no celular, e nenhum
 *    placeholder corta a 390px.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const PRE=pg=>pg.addInitScript(()=>{ try{
  localStorage.setItem('cdf-pv','1');
  localStorage.setItem('cdf-entrou','1');
  localStorage.setItem('cdf-guia','1');
  localStorage.removeItem('cdf-uso');
}catch(e){} });

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await PRE(p);
  await p.goto('file://'+path.resolve(__dirname,'..','public','index.html'),{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(220);
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(600);

  /* ============ 1. as duas portas existem no editor ============ */
  let m=await p.evaluate(()=>{
    const e=ESCALAS.find(x=>(odDo(x).linhas||[]).length)||ESCALAS[0];
    abrirOrdemDia(e.id);
    const vis=el=>!!el&&el.offsetParent!==null;
    return {job:e.id, blocos:(odDo(e).linhas||[]).length,
      modelo:vis(v('od-modelo')), subir:vis(v('od-arq').closest('label')),
      aceita:v('od-arq').getAttribute('accept'),
      texto:v('od-edit').innerText};
  });
  const JOB=m.job;
  t(m.modelo,'o editor tem "Baixar modelo em Word"');
  t(m.subir,'e "Subir a OD preenchida"');
  t(/preencha com calma|continuar depois/i.test(m.texto),
    'e diz o que resolve: preencher fora, salvar e continuar depois');
  /* 29/ago: o Victor pediu PDF ("preciso subir PDF aqui também") — ele
     entra, mas pela porta do ANEXO: vira o documento pronto do job, sem
     passar pela leitura de colunas, que PDF não sustenta. */
  t(/docx/.test(m.aceita)&&/pdf/.test(m.aceita),
    '⟶⟶ aceita .docx (leitura) e .pdf (anexo pronto) — duas portas, dois destinos');

  /* ============ 2. o ciclo fecha: modelo → leitura → mesmo cronograma ==== */
  m=await p.evaluate(()=>{
    const e=ESCALAS.find(x=>x.id===OD_JOB);
    const div=document.createElement('div'); div.innerHTML=modeloOD(e);
    /* é o que tabelasDoc entrega ao ler um .docx: células por " | " */
    const txt=[...div.querySelectorAll('table')].map(tb=>
      [...tb.querySelectorAll('tr')].map(tr=>
        [...tr.querySelectorAll('th,td')].map(c=>c.textContent.trim()).join(' | ')
      ).join('\n')).join('\n');
    const orig=(odDo(e).linhas||[]);
    const lido=lerODTabela(txt);
    return {
      temCabec:/Cena \| Luz \| Loc\/Set \| Sinopse/.test(txt),
      instrucao:/não mexa no cabeçalho/i.test(div.innerText.toLowerCase()),
      origem:orig.length, volta:lido.linhas?lido.linhas.length:lido.erro,
      tiposIguais:lido.linhas&&lido.linhas.map(x=>x.t).join()===orig.map(x=>x.t).join(),
      conv:lido.conv?lido.conv.length:0
    };
  });
  t(m.temCabec,'o modelo sai com o cabeçalho exato que o leitor procura');
  t(m.instrucao,'e avisa para não mexer nele — é por ele que a leitura se orienta');
  t(m.volta===m.origem,'⟶⟶ o ciclo fecha: '+m.origem+' blocos saem, '+m.volta+' voltam');
  t(m.tiposIguais,'⟶⟶ e voltam do MESMO tipo, na mesma ordem — cena é cena, refeição é refeição');
  t(m.conv>0,'os convidados voltam junto: '+m.conv);

  /* ============ 3. a leitura entende as palavras da OD de papel ======= */
  m=await p.evaluate(()=>{
    const txt=['Cena | Luz | Loc/Set | Sinopse | Duração (min)',
      '1 | EXT/DIA | Praia de Ponta Negra | Abertura | 45',
      'PREPARAÇÃO | | | | 20',
      'DESLOCAMENTO — Centro | | | | 30',
      'REFEIÇÃO — Almoço no local | | | | 60',
      ' |  |  |  | ',
      'Desprodução | | | | 15'].join('\n');
    const r=lerODTabela(txt);
    return {n:r.linhas.length, tipos:r.linhas.map(x=>x.t),
      dest:r.linhas.map(x=>x.dest||''), mins:r.linhas.map(x=>x.min),
      loc:r.linhas[0].loc, luz:r.linhas[0].luz, ign:r.ignoradas};
  });
  t(m.tipos.join()==='cena,prep,desl,refei,livre',
    '⟶⟶ a primeira coluna decide o bloco: palavra conhecida, número = cena, '
    +'nome livre sem luz/local/sinopse = bloco de apoio: '+m.tipos.join(' · '));
  t(m.dest[4]==='Desprodução',
    '⟶⟶ "Desprodução" NÃO vira uma cena chamada Desprodução — cena sem luz, local nem sinopse não é cena');
  t(m.dest[2]==='Centro'&&/Almoço/.test(m.dest[3]),
    'e o que vem depois do travessão vira o destino: "'+m.dest[2]+'", "'+m.dest[3]+'"');
  t(m.mins.join()==='45,20,30,60,15','as durações vêm da coluna certa: '+m.mins.join(' · '));
  t(m.loc==='Praia de Ponta Negra'&&m.luz==='EXT/DIA','cena traz luz e locação');
  t(m.n===5,'a linha em branco do modelo não vira bloco: '+m.n+' blocos de 6 linhas');

  /* ============ 4. arquivo que não dá para ler ============ */
  m=await p.evaluate(()=>({
    semTab:lerODTabela('um texto qualquer\nsem tabela nenhuma').erro,
    semCab:lerODTabela('Nome | Telefone\nJoana | 999').erro,
    vazia:lerODTabela('Cena | Luz | Loc/Set | Sinopse | Duração\n | | | | ').erro
  }));
  t(m.semTab==='sem tabela'&&m.semCab==='sem cabeçalho'&&m.vazia==='tabela vazia',
    'os três jeitos de falhar são distinguidos: '+[m.semTab,m.semCab,m.vazia].join(' · '));
  m=await p.evaluate(()=>{
    odFalhou('roteiro.docx','não achei tabela nenhuma dentro dele');
    const txt=v('od-lido').innerText;
    return {diz:/não achei tabela/.test(txt), ensina:/baixe o modelo/i.test(txt),
      ofereceMontar:/bloco a bloco/i.test(txt),
      cronoIntacto:(odDo(ESCALAS.find(x=>x.id===OD_JOB)).linhas||[]).length};
  });
  t(m.diz&&m.ensina,'quando falha, diz o motivo e ensina o caminho');
  t(m.ofereceMontar,'e lembra que dá para montar aqui mesmo — a porta velha não sumiu');
  t(m.cronoIntacto>0,'⟶⟶ e o cronograma que já existia continua intacto: '+m.cronoIntacto+' blocos');

  /* ============ 5. nada é aplicado sem confirmar ============ */
  m=await p.evaluate(()=>{
    const e=ESCALAS.find(x=>x.id===OD_JOB);
    const antes=(odDo(e).linhas||[]).length;
    OD_LIDO={arq:'od-preenchida.docx',
      linhas:[{t:'cena',min:30,cena:'1',luz:'EXT/DIA',loc:'Praia',sin:'',dest:''},
              {t:'refei',min:60,cena:'',luz:'',loc:'',sin:'',dest:'Almoço'}],
      conv:[],ignoradas:0};
    pintarODLido(e);
    return {antes, depois:(odDo(e).linhas||[]).length,
      mostra:v('od-lido').innerText,
      temAplicar:!!v('od-aplicar'), temJuntar:!!v('od-juntar'), temDescartar:!!v('od-descartar')};
  });
  t(m.depois===m.antes,'⟶⟶ ler NÃO aplica: o cronograma continua com '+m.depois+' blocos');
  t(/Li 2 blocos/.test(m.mostra),'a tela mostra quantos blocos foram lidos antes de aplicar');
  t(/1 cena/.test(m.mostra)&&/1 bloco de apoio/.test(m.mostra),'separando cena de bloco de apoio');
  t(m.temAplicar&&m.temJuntar&&m.temDescartar,
    'e oferece as três saídas: substituir, acrescentar e descartar');
  t(/recalculadas a partir da chamada/i.test(m.mostra),
    '⟶⟶ diz que as horas são recalculadas — a coluna de hora do arquivo é ignorada de propósito');

  /* descartar não mexe em nada */
  await p.locator('#od-descartar').click(); await p.waitForTimeout(200);
  m=await p.evaluate(()=>({lido:OD_LIDO,vazio:v('od-lido').innerHTML===''}));
  t(m.lido===null&&m.vazio,'descartar limpa a leitura e não toca no cronograma');

  /* acrescentar soma; substituir troca */
  m=await p.evaluate(()=>{
    const e=ESCALAS.find(x=>x.id===OD_JOB);
    const antes=(odDo(e).linhas||[]).length;
    const novas=[{t:'cena',min:30,cena:'9',luz:'EXT/DIA',loc:'X',sin:'',dest:''}];
    OD_LIDO={arq:'a.docx',linhas:novas,conv:[],ignoradas:0}; pintarODLido(e);
    v('od-juntar').click();
    const somou=(odDo(e).linhas||[]).length;
    OD_LIDO={arq:'a.docx',linhas:novas,conv:[],ignoradas:0}; pintarODLido(e);
    v('od-aplicar').click();
    return {antes,somou,trocou:(odDo(e).linhas||[]).length};
  });
  t(m.somou===m.antes+1,'"acrescentar" soma ao que já tinha: '+m.antes+' → '+m.somou);
  t(m.trocou===1,'"substituir" troca tudo: '+m.somou+' → '+m.trocou);

  /* ============ 6. a hora sai da chamada, não do arquivo ============ */
  m=await p.evaluate(()=>{
    const e=ESCALAS.find(x=>x.id===OD_JOB);
    odDo(e).linhas=[{t:'cena',min:60,cena:'1',luz:'EXT/DIA',loc:'',sin:'',dest:''},
                    {t:'refei',min:60,cena:'',luz:'',loc:'',sin:'',dest:'Almoço'}];
    const antes=cronoOD(e).linhas.map(l=>l.deH+'-'+l.ateH);
    e.chamada='09:00';
    const depois=cronoOD(e).linhas.map(l=>l.deH+'-'+l.ateH);
    return {antes,depois};
  });
  t(m.depois[0].startsWith('09:00')&&m.antes[0]!==m.depois[0],
    '⟶⟶ mexer na chamada anda o dia inteiro: '+m.antes[0]+' → '+m.depois[0]);
  t(m.depois[1].startsWith('10:00'),'e a cadeia segue: o bloco seguinte começa onde o anterior terminou');

  /* ============ 7. o orçamento: abre pelo roteiro e tem porta ======== */
  m=await p.evaluate(()=>{
    /* ⚠️ o modal da OD fica por cima de tudo e intercepta clique — fechar
       antes de medir outra tela é obrigação, não zelo */
    v('ovl32').hidden=true; document.body.style.overflow='';
    ASSINANTE=true; assinaturaDesde=key(HOJE); aplicarModo();
    const vis=e=>!!e&&e.offsetParent!==null;
    show('equipe');
    const ponte=vis(document.querySelector('[data-irorcar]'));
    show('orcar');
    const alvo=document.getElementById('v-orcar').getBoundingClientRect().top+scrollY;
    const topo=id=>Math.round(document.getElementById(id).getBoundingClientRect().top+scrollY-alvo);
    /* placeholder que não cabe no campo é texto que ninguém lê inteiro */
    const cortam=[];
    document.querySelectorAll('#v-orcar input[placeholder]').forEach(i=>{
      if(i.offsetParent===null) return;
      const d=document.createElement('span');
      d.style.cssText='position:absolute;visibility:hidden;white-space:pre;font:'+getComputedStyle(i).font;
      d.textContent=i.placeholder; document.body.appendChild(d);
      const larg=d.offsetWidth; d.remove();
      if(larg>i.clientWidth-24) cortam.push(i.id);
    });
    return {ponte, roteiro:topo('oc-rot'), timbre:topo('oc-timbre-det'),
      fechado:!document.getElementById('oc-timbre-det').open,
      resumo:document.getElementById('oc-timbre-res').textContent,
      cortam, ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  t(m.ponte,'⟶⟶ Montar equipe tem a ponte para o Orçamento — no celular ele tinha UMA porta só');
  t(m.roteiro<m.timbre,
    '⟶⟶ o campo do roteiro vem ANTES do timbre — é ele que dá nome à tela: '+m.roteiro+'px vs '+m.timbre+'px');
  t(m.fechado,'e o timbre nasce recolhido: é configuração de uma vez, não trabalho de toda vez');
  t(m.resumo.length>0,'a cabeça fechada diz o que tem dentro ("'+m.resumo+'") — fechado é índice, não esconderijo');
  t(m.cortam.length===0,'nenhum placeholder corta a 390px'+(m.cortam.length?': '+m.cortam.join(', '):''));
  t(m.ov<=1,'e a tela não rola de lado');

  /* abrir a sanfona traz o timbre inteiro de volta */
  await p.locator('#oc-timbre-det summary').click(); await p.waitForTimeout(250);
  m=await p.evaluate(()=>{
    const vis=e=>!!e&&e.offsetParent!==null;
    return {aberto:document.getElementById('oc-timbre-det').open,
      logo:vis(document.getElementById('oc-logo').closest('label')),
      emp:vis(document.getElementById('oc-emp')),
      cor:vis(document.getElementById('oc-cor'))};
  });
  t(m.aberto&&m.logo&&m.emp&&m.cor,'abrir a sanfona devolve logo, nome e cor — nada foi removido, só recolhido');

  t(errs.length===0,'zero erro de console/página'+(errs.length?' — '+errs[0]:''));

  console.log('OD-SAI-E-VOLTA');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();
