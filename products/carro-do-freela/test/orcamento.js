/**
 * ORÇAMENTO A PARTIR DO ROTEIRO — a produtora responde sobre o job e a
 * conta se monta puxando o que a plataforma já sabe.
 *
 * O que esta suíte protege:
 *   - a tela existe no mapa, do lado de quem contrata;
 *   - as diárias vêm da plataforma: faixa da praça por padrão, tabela
 *     publicada pelo nome SÓ para quem publicou — nunca valor inventado
 *     para pessoa real;
 *   - a matemática fecha: hora extra é um décimo da diária por hora,
 *     margem sobre a produção, imposto POR DENTRO (total = sub/(1-i));
 *   - "sugerir pelo roteiro" se declara busca de palavras, não IA;
 *   - margem/imposto viram o padrão da produtora e sobrevivem ao reload;
 *   - o documento sai com a fonte dos valores declarada;
 *   - o TIMBRE é do contratante: logo (a do perfil entra sozinha), nome,
 *     rodapé e cor, guardados como padrão — e saem impressos no documento;
 *   - a mensagem do cliente colada rende dias, tipo, fora da cidade e
 *     quantas câmeras — cada sugestão com a palavra que a gerou;
 *   - áudio do cliente: player na tela e a verdade dita — transcrever é
 *     serviço de servidor, e fingir que transcreveu seria mentir;
 *   - DOIS PAPÉIS da mesma conta: A CONTA (interna, com as diárias) e A
 *     PROPOSTA (a que vai ao cliente). Na proposta a equipe aparece por
 *     CABEÇA e o valor é UM — nenhuma diária pode vazar, porque isso
 *     abre negociação linha a linha e expõe o cachê de quem trabalha;
 *   - o roteiro pode SUBIR como arquivo (.txt/.docx/.pdf e companhia): o
 *     texto é extraído no próprio aparelho e cai no MESMO campo, sem
 *     pipeline paralelo — e o que não dá para ler é dito como não lido,
 *     nunca disfarçado de leitura;
 *   - as funções viram vagas em Montar equipe com um clique;
 *   - a porta é paga dos DOIS lados (Estrada no freela, plano pago em
 *     quem contrata) e assinar de dentro da tela trancada destranca ela
 *     na hora, sem precisar sair e voltar.
 */
const { chromium } = require('playwright');
const path=require('path');
const fs=require('fs');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const os=require('os');
/* ⚠️ ORIGEM http, e não file://. Esta suíte dá reload() para provar que o
   padrão de margem/imposto sobrevive — e o Chromium descarta o localStorage
   de origem file:// de vez em quando (medido: ~1 em 14 recargas). Era esta
   suíte reprovando sozinha em bateria completa e passando 3/3 quando rodada
   à parte: ambiente, nunca o produto. Mesmo remédio de persistencia.js. */
const {servir,URL}=require('./_servir.js');

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const ctx=await b.newContext({viewport:{width:1440,height:1100},deviceScaleFactor:2,acceptDownloads:true});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>{ if(m.type()!=='error') return;
    if(/web3forms/.test((m.location()&&m.location().url)||'')) return; errs.push(m.text()); });
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await servir(p);
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); /* 17/out · 13: só Google e a conta oficial */ await p.waitForTimeout(550);

  /* ============ dá para ACHAR ============
     Ficou só dentro do mapa na primeira entrega e o Victor não achou —
     o que só existe dentro de um menu é o que ninguém acha. Agora é aba
     no topo e item na barra do celular, do lado de quem contrata. */
  t(await p.locator('.tab[data-tab="orcar"]:visible').count()===1,'Orçamento é aba no topo de quem contrata');
  await p.locator('.tab[data-tab="orcar"]').click(); await p.waitForTimeout(450);
  t(await p.evaluate(()=>S.tab)==='orcar','e a aba leva para a tela');
  await p.locator('#menu-bt').click(); await p.waitForTimeout(420);
  t(await p.locator('#g-ferr .gitem[data-ir="orcar"]').count()===1,'e continua no menu, em Ferramentas');
  await p.locator('#g-x').click(); await p.waitForTimeout(250);
  /* Do lado do freela a aba FICA, trancada — é a vitrine que vende, o
     mesmo padrão de Montar equipe. Esconder faria a Estrada ser um plano
     que ninguém descobre que existe. */
  await p.evaluate(()=>{ MODO="freela"; aplicarModo(); PLANO_FREELA="base"; show("orcar"); });
  await p.waitForTimeout(400);
  t(await p.locator('[data-tab="orcar"]:visible').count()>=1,'do lado do freela a aba fica à vista');
  t(await p.locator('#oc-trancado .trancado').count()===1,'mas trancada, vendendo a Estrada');
  t(await p.locator('#oc-corpo').isHidden(),'com o formulário fora do ar');
  /* Do lado de quem contrata a porta também é paga. Sem isso o portão
     não fecha: o freela troca o chapéu, entra como contratante no Carona
     (grátis) e orça de graça — foi o Victor que viu a brecha. */
  await p.evaluate(()=>{ MODO="contratante"; ASSINANTE=false; aplicarModo(); show("orcar"); });
  await p.waitForTimeout(400);
  t(await p.locator('#oc-trancado .trancado').count()===1,'contratante no Carona: orçamento trancado também');
  t(await p.locator('#oc-corpo').isHidden(),'e sem formulário — a brecha do chapéu trocado fecha');
  /* e a porta que ele oferece é a MAIS BARATA que abre a tela: a Estrada
     de R$ 49, não o Volante de R$ 89. Com a escada valendo, mandar quem
     contrata pagar 89 pelo que custa 49 seria a tela mentindo sobre a
     própria regra. */
  t(await p.locator('#oc-trancado [data-vestrada]').count()===1,'e a porta oferecida é a Estrada, a mais barata que abre a tela');
  t(await p.locator('#oc-trancado .cmp').count()===0,'sem empurrar o Volante para quem só quer orçar');
  t(/já traz a Estrada dentro/.test(await p.locator('#oc-trancado').textContent()),
    'o Volante aparece pelo que é: o degrau seguinte, que já traz este dentro');
  /* e assinar de DENTRO da tela trancada precisa destrancar na hora —
     era o que não acontecia: cobrava o plano e a porta continuava fechada */
  await p.locator('#oc-trancado [data-vestrada]').click(); await p.waitForTimeout(400);
  await p.locator('#pfr-ok').click(); await p.waitForTimeout(600);
  t(await p.locator('#oc-corpo').isVisible(),'assinando ali mesmo, a tela destranca sem sair dela');
  t(await p.evaluate(()=>nivel()===NIVEL.ESTRADA),'e a Estrada vale igual do lado de quem contrata');
  await p.locator('#pfr-f').click().catch(()=>{}); await p.waitForTimeout(300);
  await p.evaluate(()=>{ MODO="contratante"; ASSINANTE=true; aplicarModo(); show("orcar"); }); await p.waitForTimeout(350);

  /* ============ o timbre é do contratante ============
     ⚠️ Ele virou `<details>` RECOLHIDO em 24/ago — timbre é configuração de
     uma vez, e o campo do roteiro estava a ~1.100px de rolagem no celular
     por causa dele. Quem preenche abre; a suíte faz o mesmo. */
  t(!await p.locator('#oc-timbre-det').evaluate(d=>d.open),
    'o timbre abre recolhido — é configuração de uma vez, não o que se faz toda vez');
  t(/./.test(await p.locator('#oc-timbre-res').textContent()),
    'e a cabeça dele resume o que tem dentro: fechado é índice, não esconderijo');
  await p.locator('#oc-timbre-det summary').click(); await p.waitForTimeout(200);
  t((await p.inputValue('#oc-emp'))==='Produtora Maré','o nome da empresa entra sozinho, do perfil');
  const png=path.join(require('os').tmpdir(),'cdf-logo-teste.png');
  fs.writeFileSync(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGNk+M/wn4GBgYGJAQoAHxcCAmXpKCoAAAAASUVORK5CYII=','base64'));
  await p.setInputFiles('#oc-logo',png); await p.waitForTimeout(450);
  t(await p.evaluate(()=>!!ORC_TIMBRE.logo&&ORC_TIMBRE.logo.startsWith('data:')),'a logo sobe e vira parte do timbre');
  await p.fill('#oc-contato','CNPJ 12.345.678/0001-00 · (84) 99999-0000');
  await p.evaluate(()=>{v('oc-cor').value='#b41e66';v('oc-cor').dispatchEvent(new Event('input'))});

  /* ============ a mensagem do cliente rende mais que funções ============ */
  await p.fill('#oc-rot','Oi! Casamento em Pipa, 3 diárias, 2 câmeras e drone.');
  await p.locator('#oc-ler').click(); await p.waitForTimeout(300);
  const sinais=await p.locator('[data-osin]').allTextContents();
  t(sinais.some(x=>/Dias de gravação: 3/.test(x)),'acha os dias no texto');
  t(sinais.some(x=>/Tipo: Casamento/.test(x)),'acha o tipo de trabalho');
  t(sinais.some(x=>/Fora da cidade/.test(x)&&/pipa/.test(x)),'acha a cidade — Pipa é fora');
  t(sinais.some(x=>/2 câmeras/.test(x)),'e quantas câmeras');
  while(await p.locator('#oc-sug .chip').count()){ await p.locator('#oc-sug .chip').first().click(); await p.waitForTimeout(110); }
  const apl=await p.evaluate(()=>({dias:+ORC.dias,tipo:ORC.tipo,fora:ORC.fora,
    cam:(ORC.fun.find(x=>x.func==='Op. de câmera')||{}).n,
    dupla:ORC.fun.filter(x=>x.func==='Op. de câmera').length}));
  t(apl.dias===3&&apl.tipo==='Casamento'&&apl.fora===true,'aceitar preenche o questionário: '+JSON.stringify({dias:apl.dias,tipo:apl.tipo,fora:apl.fora}));
  t(+apl.cam===2&&apl.dupla===1,'2 câmeras vira UMA linha com quantidade 2 — sem duplicar');
  await p.evaluate(()=>{ ORC.fun=[]; ORC.dias=1; ORC.tipo=""; ORC.fora=false;
    v('oc-dias').value=1; v('oc-fora').checked=false; v('oc-rot').value=''; drawOrcar(); });

  /* ============ áudio: player + a verdade ============ */
  const mp3=path.join(require('os').tmpdir(),'cdf-audio-teste.mp3');
  fs.writeFileSync(mp3,Buffer.from('ID3'));
  await p.setInputFiles('#oc-audio',mp3); await p.waitForTimeout(300);
  t(await p.locator('#oc-audio-p').isVisible(),'o áudio do cliente sobe e ganha player para ouvir ali');
  t(/fingir que transcreveu seria mentir/.test(await p.locator('#oc-audio-n').textContent()),
    'e a tela diz a verdade: transcrição é serviço de servidor — nada finge');

  /* ============ subir o documento do roteiro ============
     Quem recebe roteiro recebe ARQUIVO, não texto colado — o campo de
     colar sozinho pedia que a pessoa abrisse o .docx no celular e
     copiasse à mão. O arquivo é lido AQUI, no aparelho: roteiro é
     material confidencial de cliente e não tem por que subir. */
  await p.evaluate(()=>{ ORC.fun=[]; v('oc-rot').value=''; v('oc-rotinfo').innerHTML=''; ORC.roteiro=null; drawOrcar(); });
  const rotTxt=path.join(require('os').tmpdir(),'cdf-roteiro.txt');
  fs.writeFileSync(rotTxt,
    'ROTEIRO — CASAMENTO NA PRAIA\n\nCENA 1 — EXT. PRAIA DE PIPA — FIM DE TARDE\n'+
    'Os noivos caminham pela areia. Drone acompanha em plano aberto.\n'+
    'São 3 diárias de gravação, com 2 câmeras no altar e captação de som direto.\n'+
    'O gaffer monta a luz de apoio antes do pôr do sol.\n\n'+
    'CENA 2 — INT. SALÃO — NOITE\nFesta. Gimbal na pista. Editor entrega o teaser no dia seguinte.\n');
  t(/\.docx/.test(await p.getAttribute('#oc-rotfile','accept'))&&/\.pdf/.test(await p.getAttribute('#oc-rotfile','accept')),
    'o botão aceita os formatos em que roteiro chega de verdade, .docx e .pdf inclusive');
  await p.setInputFiles('#oc-rotfile',rotTxt); await p.waitForTimeout(700);
  t(await p.locator('#oc-rotinfo .rotarq.ok3').count()===1,'subindo o arquivo, a tela confirma que leu');
  t(/caracteres lidos/.test(await p.locator('#oc-rotinfo').textContent()),
    'dizendo QUANTO leu — número, não "pronto!"');
  t(/PRAIA DE PIPA/.test(await p.inputValue('#oc-rot')),
    'e o texto cai no MESMO campo de sempre: daqui para frente é o leitor de palavras de sempre');
  /* e o leitor roda sozinho — subir o arquivo e ainda ter que apertar
     "ler" seria pedir duas vezes a mesma coisa */
  const sfile=await p.locator('[data-osin]').allTextContents();
  t(sfile.some(x=>/Dias de gravação: 3/.test(x)),'o leitor roda sozinho: achou os 3 dias');
  t(sfile.some(x=>/2 câmeras/.test(x)),'e as 2 câmeras');
  t(sfile.some(x=>/Fora da cidade/.test(x)),'e que Pipa é fora da cidade');
  t((await p.locator('[data-osug]').allTextContents()).some(x=>/Op. de drone/.test(x)),
    'e as funções do texto viram sugestão, com a palavra que as gerou');
  /* subir de novo ACRESCENTA, não apaga o que a pessoa já tinha escrito */
  const antes=(await p.inputValue('#oc-rot')).length;
  await p.setInputFiles('#oc-rotfile',rotTxt); await p.waitForTimeout(700);
  t((await p.inputValue('#oc-rot')).length>antes,'subir um segundo arquivo acrescenta — não apaga o que já estava');
  t(/acrescentados/.test(await p.locator('#oc-rotinfo').textContent()),'e a tela avisa que acrescentou');

  /* ============ ROTEIRO EM TABELA ============
     Os três roteiros que o Victor mandou são TABELA, com colunas
     diferentes por peça: FALA|LETTERING|CENA, Tela|Voz|Lettering|Sugestões,
     CENA|ANIMAÇÕES|LOCUÇÃO. Extraindo só texto corrido, as células colam
     e o roteiro vira uma parede de palavras.
     Este .docx é um Word DE VERDADE, gravado com o bit 3 de flag: o
     cabeçalho local vem com tamanho zero e os tamanhos reais ficam no
     diretório central. O leitor lia o cabeçalho local, entregava lixo ao
     inflate e devolvia "não consegui" — enquanto o .docx que o próprio
     teste fabricava passava, porque não usava o bit 3. */
  await p.evaluate(()=>{ ORC.fun=[]; v('oc-rot').value=''; v('oc-rotinfo').innerHTML=''; ORC.roteiro=null; drawOrcar(); });
  await p.setInputFiles('#oc-rotfile',path.join(__dirname,'roteiro-tabela.docx')); await p.waitForTimeout(900);
  t(await p.locator('#oc-rotinfo .rotarq.ok3').count()===1,'.docx de Word real é lido — não só o que o teste fabrica');
  const rotT=await p.inputValue('#oc-rot');
  t(/FALA \| LETTERING \| CENA/.test(rotT),'e a TABELA sobrevive à extração, com as colunas separadas');
  const linhasT=rotT.split('\n').filter(l=>l.includes(' | '));
  t(linhasT.length>=6,'cada linha da tabela vira uma linha de texto ('+linhasT.length+')');
  t(linhasT.some(l=>/\|\s*\|/.test(l)),
    'célula vazia continua contando como coluna — senão as colunas desalinham da linha de cima');
  t(await p.evaluate(()=>ORC.roteiro.cenas)>=6,'e o orçamento registra quantas linhas o roteiro tem');
  /* e o que a plataforma entendeu ela sabe DEVOLVER: sobe um .docx de
     qualquer jeito, desce um roteiro em tabela, timbrado */
  t(await p.locator('#oc-rotbaixa').isVisible(),'reconhecendo a tabela, ela oferece baixar o roteiro pronto');
  const [dlr]=await Promise.all([p.waitForEvent('download',{timeout:9000}),
    p.locator('#oc-rotbaixa [data-baixar]').click()]);
  const arqR=path.join(os.tmpdir(),'cdf-roteiro.doc'); await dlr.saveAs(arqR);
  const fr=fs.readFileSync(arqR,'utf8');
  t(/<th>FALA<\/th>/.test(fr),'a primeira linha vira CABEÇALHO — é como toda tabela de roteiro se escreve');
  const cols=[...fr.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m=>(m[1].match(/<t[hd]>/g)||[]).length);
  t(cols.length>=6&&cols.every(n=>n===cols[0]),
    'e TODAS as linhas saem com o mesmo número de colunas ('+cols.join(',')+') — coluna vazia continua sendo coluna');
  t(/border-bottom:3px solid/.test(fr),'timbrado com a identidade de quem gerou');
  t(/roteiro em tabela/.test(await p.locator('#oc-rotinfo').textContent()),'a tela diz que reconheceu a tabela');
  await p.evaluate(()=>{ v('oc-rot').value=''; v('oc-rotinfo').innerHTML=''; ORC.roteiro=null; ORC.fun=[]; drawOrcar(); });

  /* ============ o que não dá para ler é dito ============
     Um PDF digitalizado é uma foto de página: não existe texto para
     tirar. Devolver caracteres de fonte em subconjunto e chamar de
     leitura viraria sugestão inventada — a mentira mais cara desta tela. */
  await p.evaluate(()=>{ v('oc-rot').value=''; });
  const pdfRuim=path.join(require('os').tmpdir(),'cdf-roteiro-ruim.pdf');
  fs.writeFileSync(pdfRuim,'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  await p.setInputFiles('#oc-rotfile',pdfRuim); await p.waitForTimeout(900);
  t(await p.locator('#oc-rotinfo .rotarq.nao3').count()===1,'PDF sem texto não vira leitura fingida');
  const ruim=await p.locator('#oc-rotinfo').textContent();
  t(/não consegui tirar o texto/.test(ruim),'a tela diz que NÃO conseguiu, na primeira linha');
  t(/digitalizado/.test(ruim),'explicando o motivo provável, em português de gente');
  t(/fica anexado ao orçamento/.test(ruim),'e o arquivo continua valendo como anexo');
  t(await p.evaluate(()=>ORC.roteiro&&ORC.roteiro.lido===false),
    'guardado como NÃO lido — o documento não pode dizer que leu');
  t(!(await p.inputValue('#oc-rot')).length,'e nada de lixo cai no campo do roteiro');
  t(/aqui no seu aparelho/.test(await p.locator('#v-orcar').textContent()),
    'a tela diz onde o arquivo é lido: roteiro de cliente não sobe para servidor nenhum');
  await p.evaluate(()=>{ ORC.fun=[]; ORC.dias=1; ORC.tipo=""; ORC.fora=false; ORC.roteiro=null;
    v('oc-dias').value=1; v('oc-fora').checked=false; v('oc-rot').value='';
    v('oc-rotinfo').innerHTML=''; drawOrcar(); });

  /* ============ o roteiro sugere, dizendo o que é ============ */
  await p.fill('#oc-rot','Cobertura com drone, entrevistas com moradores e edição de teaser.');
  await p.locator('#oc-ler').click(); await p.waitForTimeout(300);
  const sug=await p.locator('[data-osug]').allTextContents();
  t(sug.some(x=>/drone/i.test(x))&&sug.some(x=>/Editor/.test(x)),
    'o roteiro sugere funções pelas palavras: '+sug.length+' sugestões');
  t(sug.every(x=>/achei “/.test(x)),'cada sugestão mostra QUAL palavra achou');
  t(/busca de palavras/.test(await p.locator('#oc-sug-n').textContent()),
    'e a tela diz que é busca de palavras, não leitura — IA que não existe não se anuncia');
  await p.locator('[data-osug="Op. de drone"]').click(); await p.waitForTimeout(200);
  t(await p.evaluate(()=>ORC.fun.length)===1,'aceitar a sugestão põe a função na equipe');

  /* ============ as diárias vêm da plataforma ============ */
  await p.selectOption('#oc-func','Op. de câmera');
  await p.locator('#oc-func-add').click(); await p.waitForTimeout(250);
  const mediaEsperada=await p.evaluate(()=>{
    const r=REFERENCIA['Op. de câmera']; return Math.round((r[0]+r[1])/2/10)*10; });
  t(await p.evaluate(()=>orcValor(ORC.fun[1]))===mediaEsperada,
    'a diária nasce da média da faixa da praça: R$ '+mediaEsperada);
  await p.locator('[data-of="1"]').selectOption('teto'); await p.waitForTimeout(200);
  t(await p.evaluate(()=>orcValor(ORC.fun[1])===REFERENCIA['Op. de câmera'][1]),'trocar para o teto muda o valor');
  /* a fonte nominal só existe para quem publicou tabela */
  const fontes=await p.locator('[data-of="1"]').textContent();
  t(/tabela publicada/.test(fontes),'quem publicou tabela aparece pelo nome como fonte');
  const nominais=await p.evaluate(()=>[...document.querySelectorAll('[data-of]')].map(sel=>
    [...sel.options].filter(o=>o.value==='eu').length).reduce((a,b)=>a+b,0));
  const comTabela=await p.evaluate(()=>['Op. de drone','Op. de câmera'].filter(f=>PRECOS.base[f]>0).length);
  t(nominais===comTabela,'e SÓ para quem publicou ('+nominais+' de 2 funções) — ninguém ganha valor inventado');

  /* ============ a matemática fecha ============ */
  await p.fill('#oc-dias','2'); await p.fill('#oc-horas','12');
  await p.fill('#oc-margem','30'); await p.fill('#oc-imposto','8');
  await p.locator('#oc-fora').check(); await p.fill('#oc-desl','250'); await p.waitForTimeout(250);
  const m=await p.evaluate(()=>{
    const c=calcOrc();
    const equipeEsp=ORC.fun.reduce((t,r)=>t+orcValor(r)*2,0);
    const hexEsp=Math.round(ORC.fun.reduce((t,r)=>t+(orcValor(r)/10)*2*2,0));
    return {c,equipeEsp,hexEsp};
  });
  t(m.c.equipe===m.equipeEsp,'equipe = diária × pessoas × dias ('+m.c.equipe+')');
  t(m.c.hextra===m.hexEsp,'hora extra = um décimo da diária por hora além das 10 ('+m.c.hextra+')');
  t(m.c.desloc===500,'deslocamento por pessoa ('+m.c.desloc+')');
  t(m.c.taxa===Math.round((m.c.equipe+m.c.hextra)*0.06),'a taxa é a do plano assinado (Volante, 6%) sobre a equipe');
  t(m.c.margem===Math.round((m.c.producao+m.c.taxa)*0.30),'margem de 30% sobre produção + taxa');
  t(m.c.total===Math.round(m.c.sub/(1-0.08)),'o imposto entra POR DENTRO: total = subtotal ÷ (1−8%)');
  t(m.c.total-m.c.sub===m.c.imposto,'e a linha de imposto é exatamente a diferença');
  t(/Imposto por dentro/.test(await p.locator('#oc-conta').textContent()),'a conta mostra isso com nome');

  /* ============ o documento ============ */
  await p.fill('#oc-cliente','Prefeitura de Parnamirim');
  await p.evaluate(()=>{ORC.roteiro={nome:"briefing.docx",tam:20480,lido:true}});
  await p.locator('#oc-gerar').click(); await p.waitForTimeout(450);
  /* gerar abre na PROPOSTA, que é o papel que se manda. As asserções
     abaixo são sobre A CONTA — a planilha interna — então trocam de papel
     de propósito. */
  t(await p.evaluate(()=>ORC_PAPEL)==='proposta','gerar abre na proposta, que é o papel que se manda');
  await p.locator('[data-opapel="conta"]').click(); await p.waitForTimeout(400);
  const doc=await p.locator('#oc-doc').textContent();
  const docHtml=await p.evaluate(()=>document.getElementById('oc-doc').innerHTML);
  t(await p.locator('#oc-doc').isVisible(),'gerar mostra o documento');
  t(/img src="data:/.test(docHtml),'TIMBRADO: a logo está no topo do documento');
  t(/Produtora Maré/.test(doc),'com o nome da empresa');
  t(/12\.345\.678/.test(doc),'o rodapé do timbre (CNPJ e contato)');
  t(/b41e66/i.test(docHtml),'e o fio na cor da marca — identidade do contratante, não da plataforma');
  t(/Prefeitura de Parnamirim/.test(doc),'com o cliente');
  t(/faixa de referência da praça/.test(doc),'declarando de onde vieram os valores da equipe');
  t(!/2 2 dias/.test(doc),'sem o número duplicado nos dias');
  t(/Total/.test(doc)&&/Validade/.test(doc),'com total e validade');
  /* quem recebe o orçamento precisa saber em cima de QUE roteiro ele foi
     feito — e se a plataforma conseguiu ler o arquivo ou não */
  t(/Roteiro anexado: briefing\.docx/.test(doc),'o documento registra o roteiro que veio anexado');
  t(/texto lido pela plataforma/.test(doc),'dizendo que o texto foi lido');
  await p.evaluate(()=>{ORC.roteiro={nome:"scan.pdf",tam:900000,lido:false}});
  await p.locator('#oc-gerar').click(); await p.waitForTimeout(400);
  t(/texto não extraído aqui/.test(await p.locator('#oc-doc').textContent()),
    'e quando não leu, o documento diz que não leu — nem para o cliente a tela finge');
  await p.evaluate(()=>{ORC.roteiro=null});

  /* ============ DOIS PAPÉIS: A CONTA E A PROPOSTA ============
     O Victor mandou a proposta que ele de fato manda ao cliente. Nela a
     equipe é "1x Produtor, 2x Cinegrafista, 1x Editor" e o fecho é UM
     valor. Nenhuma diária aparece — e não pode aparecer: mandar a
     planilha convida negociação linha a linha e põe o cachê de cada
     freela no e-mail do cliente. */
  t(await p.locator('#oc-papeis').isVisible(),'gerar oferece os DOIS papéis da mesma conta');
  await p.locator('[data-opapel="proposta"]').click(); await p.waitForTimeout(400);
  await p.fill('#oc-atend','Edu Cardoso');
  await p.fill('#oc-peca','Vídeo institucional 2026');
  await p.fill('#oc-onde','Teatro Riachuelo, Natal/RN');
  await p.fill('#oc-ent-d','3x pílulas gravadas e entregues antes do evento');
  await p.locator('#oc-ent-add').click(); await p.waitForTimeout(300);
  await p.evaluate(()=>{ const c=ORC.fun.find(x=>x.func==='Op. de câmera'); if(c) c.n=2;
    else ORC.fun.push({func:'Op. de câmera',n:2,dias:null,fonte:'media',manual:null});
    drawOrcFun(); drawOrcConta(); pintarPapel(); });
  await p.waitForTimeout(400);
  const prop=(await p.locator('#oc-doc').textContent()).replace(/\s+/g,' ');
  const cc=await p.evaluate(()=>calcOrc());
  /* ⟶ A ASSERÇÃO QUE SUSTENTA A TELA */
  const vazou=cc.linhas.filter(x=>prop.includes(x.u.toLocaleString('pt-BR'))).map(x=>x.func);
  t(!vazou.length,'NENHUMA diária vaza para a proposta'+(vazou.length?': '+vazou.join(', '):''));
  t(/2x Op\. de câmera/.test(prop),'a equipe aparece por CABEÇA — "2x Op. de câmera", não o que ele custa');
  t(prop.includes(await p.evaluate(t2=>brl(t2),cc.total)),'e o fecho é UM valor, o mesmo da conta');
  t(/Atendimento/.test(prop)&&/Edu Cardoso/.test(prop),'com quem assina o atendimento');
  t(/Peça:/.test(prop)&&/Onde:/.test(prop),'peça e onde, como na proposta de verdade');
  t(/1\. Entrega/.test(prop)&&/pílulas/.test(prop),'as entregas item por item');
  t(/Forma de pagamento/.test(prop)&&/50%/.test(prop),'a forma de pagamento escrita');
  t(/nota fiscal/.test(prop),'e as observações que toda proposta traz');
  t(/de agosto de|de janeiro de|de fevereiro de|de março de|de abril de|de maio de|de junho de|de julho de|de setembro de|de outubro de|de novembro de|de dezembro de/.test(prop),
    'fechando com praça e data por extenso');
  /* o copiar copia O QUE ESTÁ À VISTA — copiar a planilha achando que
     copiou a proposta é o erro que manda a diária do gaffer ao cliente */
  t(!(await p.evaluate(()=>orcTxt)).includes(cc.linhas[0].u.toLocaleString('pt-BR')),
    'e o botão de copiar copia a proposta, não a planilha');
  await p.locator('[data-opapel="conta"]').click(); await p.waitForTimeout(450);
  const conta=(await p.locator('#oc-doc').textContent()).replace(/\s+/g,' ');
  t(conta.includes(cc.linhas[0].u.toLocaleString('pt-BR')),
    'do outro lado, a CONTA mostra a diária de cada função — é com ela que a produtora fecha');
  t(/Não mande este/.test(await p.locator('#oc-papel-n').textContent()),
    'e a tela avisa para não mandar essa');
  t((await p.evaluate(()=>orcTxt)).includes(cc.linhas[0].u.toLocaleString('pt-BR')),
    'trocando de papel, o copiar acompanha');
  await p.locator('[data-opapel="proposta"]').click(); await p.waitForTimeout(400);

  /* ============ e a proposta BAIXA ============ */
  t(await p.locator('#oc-folha [data-baixar]').count()===1,'a proposta baixa como documento');
  const [dlp]=await Promise.all([p.waitForEvent('download',{timeout:9000}),
    p.locator('#oc-folha [data-baixar]').click()]);
  const arqP=path.join(os.tmpdir(),'cdf-proposta.doc'); await dlp.saveAs(arqP);
  const fp=fs.readFileSync(arqP,'utf8');
  t(/proposta-/.test(dlp.suggestedFilename()),'com nome de proposta: '+dlp.suggestedFilename());
  t((fp.match(/border-bottom:3px solid/g)||[]).length===1,
    'com UM timbre só — a proposta já traz o dela, a folha não pode empilhar outro');
  t(!cc.linhas.some(x=>fp.includes(x.u.toLocaleString('pt-BR'))),
    'e NENHUMA diária vaza para o arquivo que vai ao cliente — vale no papel como valia na tela');

  /* padrão sobrevive ao reload */
  await p.fill('#oc-margem','35'); await p.locator('#oc-gerar').click(); await p.waitForTimeout(350);
  await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(400);
  t(await p.evaluate(()=>+document.getElementById('oc-margem').value)===35,
    'a margem vira o padrão da produtora e sobrevive ao reload');

  /* ============ vira escala com um clique ============ */
  await p.locator('.homenav .entrar-cta').click().catch(()=>{});
  await p.evaluate(()=>{ MODO="contratante"; ASSINANTE=true; aplicarModo(); show("orcar"); }); await p.waitForTimeout(400);
  await p.selectOption('#oc-func','Gaffer'); await p.locator('#oc-func-add').click(); await p.waitForTimeout(200);
  await p.evaluate(()=>{ ORC.fun[0].n=2 });
  await p.locator('#oc-equipe').click(); await p.waitForTimeout(500);
  const eq=await p.evaluate(()=>({tab:S.tab,vagas:VAGAS.map(x=>x.func)}));
  t(eq.tab==='equipe','o botão leva para Montar equipe');
  t(eq.vagas.filter(x=>x==='Gaffer').length===2,'com uma vaga por pessoa, não por função');

  /* ============ a escada de níveis ============
     Victor: "eu vejo os planos como uma escada de nível... assim um não tem
     como burlar criando uma conta do outro lado pra ter um serviço que só
     tem no outro". Cada degrau tem tudo dos de baixo, dos DOIS lados. */
  const degrau=async cfg=>{ await p.evaluate(c=>{ MODO=c.m; PLANO_FREELA=c.f;
      ASSINANTE=!!c.a; PREMIUM_PROD=!!c.p; aplicarModo(); ORC.plataforma=true;
      show("orcar"); drawOrcar(); drawOrcConta(); },cfg); await p.waitForTimeout(350);
    return await p.evaluate(()=>({n:nivel(),topo:planoTopo(),taxa:taxaDoNivel(),
      orcar:podeOrcar(),agenda:podeVerAgenda(),
      btn:!document.getElementById('oc-equipe').hidden,
      nota:document.getElementById('oc-nota-taxa').textContent})); };

  let d=await degrau({m:"freela",f:"estrada"});
  t(d.n===2&&d.orcar,'Estrada é o degrau 2 e orça');
  t(!d.agenda&&!d.btn,'mas NÃO escala: sem o botão de levar para Montar equipe');
  t(/Estrada/.test(d.nota),'e a taxa é chamada pelo nome do plano dele, não "Carona"');
  d=await degrau({m:"contratante",f:"estrada"});
  t(d.n===2&&d.orcar&&!d.agenda,'trocar de chapéu não sobe nem desce degrau — a escada é da pessoa');
  d=await degrau({m:"contratante",f:"base",a:1});
  t(d.n===3&&d.orcar&&d.agenda&&d.btn,'Volante é o 3: orça E escala, sem assinar a Estrada junto');
  t(d.taxa===6&&/Volante/.test(d.nota),'com a taxa de 6% no nome do Volante');
  d=await degrau({m:"contratante",f:"base",a:1,p:1});
  t(d.n===4&&d.taxa===4&&/Frota/.test(d.nota),'Frota é o 4, e só ela baixa a taxa para 4%');
  d=await degrau({m:"freela",f:"premium"});
  t(d.n===1&&!d.orcar,'Premium é o 1 e ainda não orça — a porta é a Estrada');
  d=await degrau({m:"freela",f:"base"});
  t(d.n===0&&!d.orcar&&!d.agenda,'e o grátis é o chão da escada');
  /* o relatório do ano é do degrau 1: quem paga o Volante recebe ele junto */
  await p.evaluate(()=>{ MODO="freela"; PLANO_FREELA="base"; ASSINANTE=true; PREMIUM_PROD=false;
    aplicarModo(); show("meu"); }); await p.waitForTimeout(450);
  t(!/Está no/.test(await p.locator('#pf-rel').textContent()),
    'quem paga o Volante recebe o relatório do Premium junto — degrau de cima traz o de baixo');
  await p.evaluate(()=>{ MODO="contratante"; PLANO_FREELA="base"; ASSINANTE=true; aplicarModo(); });

  /* ============ celular ============ */
  await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>show('orcar')); await p.waitForTimeout(400);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no celular: '+ov);

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();
