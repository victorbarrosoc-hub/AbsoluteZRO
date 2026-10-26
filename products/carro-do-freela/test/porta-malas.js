/* PORTA-MALAS — subir e baixar do Drive sem zip, sem recomeçar, conferido.
 *
 * A dor (Victor, 24/ago): "o drive demora muito pra baixar, dá bug pra
 * compactar… usam muito o Cyberduck e FileZilla Pro". E a segunda leva
 * (mesmo dia): "preciso selecionar os arquivos e saber pra onde vai subir
 * na pasta do Drive, senão fica tudo jogado" — e no baixar, "ver o nome
 * da pasta e os arquivos que quero baixar".
 *
 * O que a suíte jura não é velocidade — é o CONTRATO da ferramenta:
 * 1. É DEMONSTRAÇÃO E DIZ ISSO NA CARA. Nada sobe nem desce daqui.
 * 2. NADA ANDA SEM A PESSOA VER O QUÊ E PARA ONDE: subir escolhe arquivo
 *    E pasta de destino; baixar mostra pasta e arquivo antes.
 * 3. Pedaços que RETOMAM — pausar não zera o progresso.
 * 4. Integridade dita como conferência (MD5), não como esperança.
 * 5. O preview de RAW abre DO NAVEGADOR DO DRIVE (espiar antes de
 *    decidir) e declara que o RAW não desceu.
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
const entrar=async p=>{
  await p.goto('file://'+path.resolve(__dirname,'..','public','index.html'),{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(220);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(600);
  await p.evaluate(()=>show('malas')); await p.waitForTimeout(400);
};

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await PRE(p);
  await entrar(p);

  /* ============ a tela se apresenta honesta, e vazia ============ */
  let m=await p.evaluate(()=>{
    const txt=v('v-malas').innerText;
    return {
      demo:/demonstra/i.test(txt),
      selo:[...document.querySelectorAll('[data-previa]')].some(b=>b.offsetParent!==null),
      conta:/API oficial do Google Drive/i.test(txt),
      naoGuarda:/a plataforma não guarda o seu material/i.test(txt),
      zip:/sem o zip/i.test(txt), md5:/MD5/.test(txt),
      semDestinoSolto:/nada sobe "solto" na raiz/i.test(txt),
      filaVazia:mlFila.length===0&&/Nada em movimento/.test(v('ml-fila').innerText)
    };
  });
  /* (17/out · 5) A PRÉVIA SE DECLARA NUM LUGAR SÓ. Victor: "tira as mensagens
     de protótipo". O banner "Demonstração — nada sobe nem desce" saiu; quem
     diz que nada é real é o selo "Prévia" ao lado da marca. */
  t(!m.demo&&m.selo,'⟶⟶ sem banner de demonstração na tela — a prévia se declara no selo');
  t(m.conta&&m.naoGuarda,'e diz o desenho real: API oficial, na conta da pessoa, sem guardar material');
  t(m.zip&&m.md5,'os porquês estão na tela: sem zip, conferido por MD5');
  t(m.semDestinoSolto,'e a promessa do destino: nada sobe solto na raiz');
  t(m.filaVazia,'a fila nasce vazia — nada anda sem a pessoa mandar');

  /* ============ SUBIR: arquivo escolhido + destino escolhido ============ */
  await p.locator('#ml-subir').click(); await p.waitForTimeout(350);
  m=await p.evaluate(()=>({
    aberto:!v('ovl-mlsub').hidden,
    arqs:document.querySelectorAll('#mls-arqs .ml-item input').length,
    marcados:document.querySelectorAll('#mls-arqs input:checked').length,
    pastas:document.querySelectorAll('#mls-pastas .ml-item').length,
    caminhos:/Jobs\/Institucional Cooperativa\/BRUTO/.test(v('mls-pastas').innerText),
    ok:v('mls-ok').textContent
  }));
  t(m.aberto,'"Subir arquivos" abre o seletor — não sai byte antes da escolha');
  t(m.arqs>=5&&m.marcados===m.arqs,'os arquivos do aparelho aparecem com caixa de marcar: '+m.arqs);
  t(m.pastas>=4&&m.caminhos,'⟶⟶ e as pastas do Drive aparecem PELO CAMINHO — a pessoa vê para onde vai');
  t(/Subir \d+ arquivos? para BRUTO — .*(GB|MB)/.test(m.ok),
    'o botão diz o quê, quantos, para onde e quanto pesa: '+m.ok);

  /* desmarcar muda a conta; criar pasta nova vira destino */
  m=await p.evaluate(()=>{
    const c=document.querySelector('[data-mlsq="2"]'); c.checked=false; c.onchange();
    const depois=v('mls-ok').textContent;
    v('mls-nome').value='SELECTS'; v('mls-criar').click();
    return {depois, novo:v('mls-ok').textContent,
      pastaNova:/SELECTS/.test(v('mls-pastas').innerText)};
  });
  t(/Subir \d+ arquivo/.test(m.depois),'desmarcar um arquivo refaz a conta na hora');
  t(m.pastaNova&&/para SELECTS/.test(m.novo),
    '⟶⟶ "criar pasta nova" existe e vira o destino: '+m.novo.slice(0,44));
  await p.locator('#mls-ok').click(); await p.waitForTimeout(1500);
  m=await p.evaluate(()=>({
    fechou:v('ovl-mlsub').hidden,
    fila:mlFila.length, sobe:mlFila.every(a=>a.dir==='sobe'&&a.pasta.endsWith('SELECTS')),
    rumo:document.querySelector('.ml-rumo').textContent,
    parte:/parte \d+ de \d+/.test(document.querySelector('.ml-arq .est .mono').textContent)
  }));
  t(m.fechou&&m.fila>0,'confirmar fecha o seletor e a fila começa: '+m.fila+' arquivo(s)');
  t(m.sobe,'todos com a direção e a pasta escolhida gravadas');
  t(/deste aparelho para/.test(m.rumo)&&/SELECTS/.test(m.rumo),
    'cada linha da fila diz o rumo: '+m.rumo);
  t(m.parte,'e o estado fala em PARTES — o pedaço de 32 MB, não uma barra decorativa');

  /* pausar segura; retomar continua do ponto */
  await p.locator('[data-mlp="0"]').click(); await p.waitForTimeout(200);
  const antes=await p.evaluate(()=>mlFila[0].feito);
  await p.waitForTimeout(900);
  m=await p.evaluate(()=>({depois:mlFila[0].feito,
    diz:/retoma da parte/.test(document.querySelector('.ml-arq .est .mono').textContent)}));
  t(m.depois===antes,'⟶⟶ pausado não anda — e o progresso NÃO zera: '+Math.round(antes)+' MB seguram');
  t(m.diz,'o texto diz de qual parte vai retomar');
  await p.locator('[data-mlp="0"]').click(); await p.waitForTimeout(900);
  t(await p.evaluate(a=>mlFila[0].feito>a,antes),'retomar continua do ponto, não do zero');

  /* ============ BAIXAR: pasta e arquivo vistos antes ============ */
  await p.locator('#ml-baixar').click(); await p.waitForTimeout(350);
  m=await p.evaluate(()=>({
    aberto:!v('ovl-mlbax').hidden,
    pastas:document.querySelectorAll('[data-mlbp]').length,
    comTamanho:/\d+ arquivos? · .*(GB|MB)/.test(v('mlb-pastas').innerText),
    okAntes:v('mlb-ok').textContent
  }));
  t(m.aberto&&m.pastas>=4,'"Baixar do Drive" abre o navegador de pastas: '+m.pastas+' pastas');
  t(m.comTamanho,'cada pasta já diz quantos arquivos e quanto pesam');
  t(/Escolha uma pasta/.test(m.okAntes),'e nada desce antes de escolher');
  await p.evaluate(()=>{
    [...document.querySelectorAll('[data-mlbp]')].find(b=>/SOM/.test(b.dataset.mlbp)).click();
  }); await p.waitForTimeout(300);
  m=await p.evaluate(()=>({
    onde:v('mlb-onde').textContent,
    arqs:document.querySelectorAll('[data-mlbq]').length,
    nomes:/SOM_dia1_boom\.wav/.test(v('mlb-arqs').innerText)
  }));
  t(/Você está vendo: Jobs\/Institucional Cooperativa\/SOM/.test(m.onde),
    '⟶⟶ o caminho da pasta está NA TELA, por extenso: era o pedido');
  t(m.arqs===2&&m.nomes,'e os arquivos dela aparecem pelo nome, com tamanho');
  await p.evaluate(()=>{document.querySelectorAll('[data-mlbq]').forEach(c=>{c.checked=true;c.onchange()})});
  await p.waitForTimeout(200);
  m=await p.evaluate(()=>v('mlb-ok').textContent);
  t(/Baixar 2 arquivos de SOM — .*sem zip/.test(m),
    'o botão diz o quê, de onde e que não vira zip: '+m);
  await p.locator('#mlb-ok').click(); await p.waitForTimeout(600);
  m=await p.evaluate(()=>({
    desce:mlFila.filter(a=>a.dir==='desce').length,
    rumo:[...document.querySelectorAll('.ml-rumo')].pop().textContent
  }));
  t(m.desce===2&&/de SOM para este aparelho/.test(m.rumo),
    'a fila mistura os dois sentidos e cada linha diz o seu: '+m.rumo);

  /* ============ preview a partir do NAVEGADOR — espiar antes de baixar ============ */
  await p.locator('#ml-baixar').click(); await p.waitForTimeout(300);
  await p.evaluate(()=>{
    [...document.querySelectorAll('[data-mlbp]')].find(b=>/Cooperativa\/BRUTO/.test(b.dataset.mlbp)).click();
  }); await p.waitForTimeout(300);
  m=await p.evaluate(()=>({vers:document.querySelectorAll('[data-mlbv]').length}));
  t(m.vers>=3,'os RAW da pasta têm o "Ver" ali mesmo — espiar antes de decidir baixar');
  await p.locator('[data-mlbv]').first().click(); await p.waitForTimeout(400);
  m=await p.evaluate(()=>{
    const txt=v('ovl-malas').innerText;
    return { aberto:!v('ovl-malas').hidden, sim:/simulação/i.test(txt),
      naoBaixou:/o RAW não foi baixado/i.test(txt),
      zerado:/baixado[\s\S]*0 MB/i.test(txt),
      meta:/codec/i.test(txt)&&/ISO/i.test(txt), tc:v('mlp-tc').textContent };
  });
  t(m.aberto&&m.sim,'⟶⟶ o preview abre de dentro do navegador do Drive e se declara simulação');
  t(m.naoBaixou&&m.zerado,'diz que o RAW não foi baixado — e o contador marca 0 MB');
  t(m.meta,'a ficha técnica está lá: codec, ISO e companhia');
  await p.evaluate(()=>{ const sc=v('mlp-scrub'); sc.value=50; sc.oninput() });
  t(await p.evaluate(t0=>v('mlp-tc').textContent!==t0,m.tc),'o scrub anda o timecode');
  await p.locator('#mlp-x').click(); await p.waitForTimeout(150);
  await p.locator('#mlb-x').click(); await p.waitForTimeout(150);

  /* o wav pequeno termina CONFERIDO */
  await p.waitForTimeout(5000);
  m=await p.evaluate(()=>{
    const wav=mlFila.find(a=>a.n.includes('SOM_dia1_boom'));
    return {ok:wav&&wav.est==='ok',
      diz:/no aparelho, conferido/.test(v('ml-fila').innerText)};
  });
  t(m.ok&&m.diz,'o download termina como "no aparelho, conferido" — integridade é comparação');

  /* ============ movimento reduzido não trava a fila ============ */
  const q=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,
    reducedMotion:'reduce'})).newPage();
  await PRE(q); await entrar(q);
  await q.locator('#ml-subir').click(); await q.waitForTimeout(300);
  await q.locator('#mls-ok').click(); await q.waitForTimeout(1500);
  m=await q.evaluate(()=>({prontos:mlFila.filter(a=>a.est==='ok'||a.est==='conferindo').length,
    tot:mlFila.length}));
  t(m.prontos>=m.tot-1,'com movimento reduzido a fila completa na hora: '+m.prontos+' de '+m.tot);

  t(errs.length===0,'zero erro de console/página'+(errs.length?' — '+errs[0]:''));

  console.log('PORTA-MALAS');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();
