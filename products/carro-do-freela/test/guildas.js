const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const entrar=async(p,tipo)=>{
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  if(tipo==='contratante'){ await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150) }
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(450);
  if(tipo==='contratante'){
    await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
    await p.locator('#as-ok').click(); await p.waitForTimeout(350);
    await p.locator('#as-f').click(); await p.waitForTimeout(300);
  }
};
(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1400},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await entrar(p,'contratante');

  /* ================= guilda é de quem contrata também ================= */
  /* o diretório de guildas mora na aba Guilda — não é repetido no perfil */
  await p.evaluate(()=>show('minhaprod')); await p.waitForTimeout(450);
  t(await p.locator('#v-minhaprod').getByText('Guilda',{exact:true}).count()===0,
    'o perfil não repete a lista de guildas');
  await p.evaluate(()=>show('guildas')); await p.waitForTimeout(450);
  t(await p.locator('#v-guildas [data-guabrir]').count()>=1,'a aba Guilda lista as guildas');
  t(await p.evaluate(()=>MINHA_GUILDA)===null,'ninguém nasce numa guilda');
  t(await p.evaluate(()=>GUILDA_TIME.size)===0,'e o time da guilda começa vazio');

  /* o diretório ordena por ranking; o teste quer uma guilda nomeada */
  await p.locator('[data-guabrir="carroceria"]').first().click(); await p.waitForTimeout(450);
  t(await p.locator('#ovl16').isVisible(),'a página da guilda abre');
  t(await p.locator('#gu-bras').textContent()==='CRC','com o brasão');
  t(/nível 1/.test(await p.locator('#gu-nv').textContent()),'começa no nível 1');
  t(/começa a contar|faltam/.test(await p.locator('#gu-falta').textContent()),'e diz o que falta pro próximo');
  t(/aprovado|Ninguém no time ainda/.test(await p.locator('#gu-time').textContent()),
    'o time aparece vazio, sem inventar integrante');

  await p.locator('#gu-ok').click(); await p.waitForTimeout(500);
  t(await p.evaluate(()=>MINHA_GUILDA)==='carroceria','entrar é um clique');
  t(await p.locator('#v-salao').isVisible(),'e a recompensa é o salão, não o modal de novo');
  t(await p.locator('#sl-sair').count()===1,'sair mora no salão');
  t(/carência/.test(await p.locator('#v-salao').textContent()),'com o custo de sair escrito antes do clique');

  /* ================= a estrela alimenta o time da guilda ================= */
  await p.evaluate(()=>{S.cidade='Natal/RN';S.only=false;show('buscar');render()}); await p.waitForTimeout(500);
  const favAntes=await p.evaluate(()=>FAV.size);
  const alvo=(await p.locator('#rows .row .nm').nth(8).textContent()).trim();
  const estrelaDo=nome=>p.locator('#rows .row',{hasText:nome}).first().locator('.star');
  await estrelaDo(alvo).click(); await p.waitForTimeout(350);
  t(await p.evaluate(()=>GUILDA_TIME.size)===1,'marcar estrela dentro da guilda põe a pessoa no time do grupo');
  t(await p.evaluate(()=>FAV.size)===favAntes+1,'e continua sendo favorito seu também');
  await estrelaDo(alvo).click(); await p.waitForTimeout(350);
  t(await p.evaluate(()=>GUILDA_TIME.size)===0,'desmarcar tira dos dois');
  await estrelaDo(alvo).click(); await p.waitForTimeout(350);

  /* fora da guilda, a estrela não alimenta nada do grupo */
  await p.evaluate(()=>{MINHA_GUILDA=null}); await p.waitForTimeout(100);
  const gt=await p.evaluate(()=>GUILDA_TIME.size);
  await p.locator('#rows .star').nth(12).click(); await p.waitForTimeout(350);
  t(await p.evaluate(()=>GUILDA_TIME.size)===gt,'fora da guilda, a estrela é só sua');
  await p.evaluate(()=>{MINHA_GUILDA='carroceria';render()}); await p.waitForTimeout(300);

  /* ================= O LIMITE: guilda não mexe na busca dos outros ================= */
  const mesmaOrdem=await p.evaluate(()=>{
    const com=filtrar().map(c=>c.id).join(',');
    const g=MINHA_GUILDA; MINHA_GUILDA=null;
    const sem=filtrar().map(c=>c.id).join(',');
    MINHA_GUILDA=g;
    return com===sem;
  });
  t(mesmaOrdem,'a ordem da busca é idêntica com e sem guilda — guilda não empurra ninguém pra cima');
  const semGuildaNoFiltro=await p.evaluate(()=>filtrar.toString().indexOf('GUILDA')<0&&filtrar.toString().indexOf('guilda')<0);
  t(semGuildaNoFiltro,'filtrar() não conhece guilda, e é para continuar assim');

  /* ================= o brasão aparece ================= */
  t(await p.locator('#rows .bras').count()===1,'o brasão aparece na linha de quem é da guilda');
  await p.evaluate(()=>{const c=CREW.find(x=>x.me);if(c)abrirPerfil(c.id)}); await p.waitForTimeout(450);
  t(await p.locator('#p-gar [data-gu]').count()===1,'e no perfil da pessoa, com o nome da guilda junto');
  await p.locator('#p-gar [data-gu]').click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl16').isVisible(),'clicar no brasão abre a guilda');
  await p.locator('#gu-x').click(); await p.waitForTimeout(300);

  /* ================= o time da guilda na tela de escalar ================= */
  await p.evaluate(()=>{show('equipe');drawEquipe()}); await p.waitForTimeout(450);
  t(await p.locator('#e-time [data-tf]').count()>=1,'o time da guilda aparece na tela de escalar');
  t(await p.locator('#e-time [data-tf]:not([disabled])').count()>=1,
    'e dá para escalar direto dali, sem voltar pra busca');
  t(await p.locator('#e-time .bras').count()===1,'com o brasão identificando de quem é');
  const cabGuilda=await p.locator('#e-time').textContent();
  t(/aprovado pelo grupo, não só por você/.test(cabGuilda),
    'e a diferença fica escrita: aprovado pelo grupo, não só por você');
  t(/membros? na guilda/.test(cabGuilda),'com quantos membros a guilda tem');
  t(await p.locator('#e-time .tfunc').count()>0,'Meu time continua existindo, com o que é só seu');
  const dupla=await p.evaluate(()=>{
    const noTime=[...GUILDA_TIME];
    const favsMostrados=CREW.filter(c=>FAV.has(c.id)&&!(MINHA_GUILDA&&GUILDA_TIME.has(c.id))).map(c=>c.id);
    return noTime.some(id=>favsMostrados.includes(id));
  });
  t(!dupla,'e ninguém aparece nos dois blocos ao mesmo tempo');

  /* encher o time da guilda sem voltar pra busca */
  await p.evaluate(()=>{GUILDA_TIME.clear();drawEquipe()}); await p.waitForTimeout(400);
  t(await p.locator('#e-time .gapv').count()>=1,'time vazio oferece seus favoritos para aprovar na guilda');
  const apAntes=await p.evaluate(()=>GUILDA_TIME.size);
  await p.locator('#e-time .gapv').first().click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>GUILDA_TIME.size)===apAntes+1,'aprovar põe a pessoa no time do grupo dali mesmo');
  t(await p.locator('#e-time .tfunc [data-tf]').count()>=1,'e ela já aparece escalável no bloco da guilda');

  /* sem guilda o time do grupo some, mas a tela não fica muda: vira convite */
  await p.evaluate(()=>{MINHA_GUILDA=null;drawEquipe()}); await p.waitForTimeout(400);
  t(await p.locator('#e-time .bras').count()===0,'fora da guilda o time do grupo some');
  t(await p.locator('#e-time .guconv').count()===1,'e no lugar dele fica o convite para a aba Guilda');
  await p.locator('#e-time .guconv [data-irguilda]').click(); await p.waitForTimeout(400);
  t(await p.locator('#v-guildas').isVisible(),'o convite leva mesmo para a aba');
  await p.evaluate(()=>{show('equipe');drawEquipe()}); await p.waitForTimeout(300);
  await p.evaluate(()=>{MINHA_GUILDA='carroceria';drawEquipe()}); await p.waitForTimeout(400);

  /* ================= nível sobe com job da guilda ================= */
  const jobsAntes=await p.evaluate(()=>jobsDaGuilda('carroceria'));
  const nvAntes=await p.evaluate(()=>nivelGuilda('carroceria'));
  await p.evaluate(()=>{
    const o=CREW.find(c=>c.gar&&!c.me);
    show('equipe'); VAGAS=[{id:1,func:o.func[0],quem:o.id}]; drawEquipe();
  });
  await p.waitForTimeout(300);
  await p.locator('#e-fechar').click(); await p.waitForTimeout(500);
  await p.locator('#fe-ok').click(); await p.waitForTimeout(500);
  await p.locator('#fe-f').click(); await p.waitForTimeout(300);
  t(await p.evaluate(()=>ESCALAS[ESCALAS.length-1].guilda)==='carroceria','o job fechado guarda a guilda');
  t(await p.evaluate(()=>jobsDaGuilda('carroceria'))===jobsAntes+1,'e conta para a guilda');
  const jobsPara=await p.evaluate(()=>POR_NIVEL);
  for(let i=0;i<jobsPara;i++){
    await p.evaluate(()=>{
      const o=CREW.find(c=>c.gar&&!c.me);
      show('equipe'); VAGAS=[{id:1,func:o.func[0],quem:o.id}]; drawEquipe();
    });
    await p.waitForTimeout(250);
    await p.locator('#e-fechar').click(); await p.waitForTimeout(400);
    await p.locator('#fe-ok').click(); await p.waitForTimeout(400);
    await p.locator('#fe-f').click(); await p.waitForTimeout(250);
  }
  t(await p.evaluate(()=>nivelGuilda('carroceria'))>nvAntes,
    'com jobs suficientes a guilda sobe de nível: '+nvAntes+' → '+await p.evaluate(()=>nivelGuilda('carroceria')));

  /* job fechado fora da guilda não conta */
  await p.evaluate(()=>{MINHA_GUILDA=null});
  const antesFora=await p.evaluate(()=>jobsDaGuilda('carroceria'));
  await p.evaluate(()=>{
    const o=CREW.find(c=>c.gar&&!c.me);
    show('equipe'); VAGAS=[{id:1,func:o.func[0],quem:o.id}]; drawEquipe();
  });
  await p.waitForTimeout(250);
  await p.locator('#e-fechar').click(); await p.waitForTimeout(400);
  await p.locator('#fe-ok').click(); await p.waitForTimeout(400);
  await p.locator('#fe-f').click(); await p.waitForTimeout(250);
  t(await p.evaluate(()=>jobsDaGuilda('carroceria'))===antesFora,'job fechado fora da guilda não conta para ela');
  await p.evaluate(()=>{MINHA_GUILDA='carroceria'});

  /* ================= não existe placar entre guildas ================= */
  const temRanking=await p.evaluate(()=>
    /rank|placar|leaderboard|classifica/i.test(document.body.innerText));
  t(!temRanking,'não existe tela de ranking entre guildas — nível é fato da própria, não classificação');

  /* ================= guilda e coletivo convivem ================= */
  await entrar(p,'freela');
  /* o freela tem a aba no singular ("Guilda": ele tem uma, não administra
     um diretório); quem contrata tem "Guildas", que é onde se funda */
  const abaF=p.locator('.tab[data-tab="guildas"][data-modo="freela"]');
  t(await abaF.isVisible(),'o freela tem a aba Guilda no topo');
  t((await abaF.textContent()).trim()==='Guilda','no singular: ele tem uma guilda, não um diretório');
  t(await p.locator('.tab[data-tab="guildas"][data-modo="contratante"]').isHidden(),
    'e a aba "Guildas" de quem contrata fica oculta para ele');
  await abaF.click(); await p.waitForTimeout(400);
  t(await p.locator('#gl-fundar').isHidden(),'fundar guilda continua sendo de quem contrata');
  await p.evaluate(()=>{show('meu');pintarPerfilFreela()}); await p.waitForTimeout(450);
  /* ⚠️ "Meu perfil" virou sanfona em 23/ago (a página tinha 7,9 telas de
     iPhone). Os coletivos moram dentro de "Tabela e regras" — abrir o
     bloco é o que a pessoa faz, e é o que a suíte faz. */
  await p.evaluate(()=>{ if(typeof pfLer==='function'){ pfLer().add('Tabela e regras'); sanfonaPerfil() } });
  await p.waitForTimeout(350);
  t(await p.locator('#pr-col .clzl').count()>=1,'coletivo continua existindo para o freela, separado de guilda');
  await p.locator('[data-pcol]').first().click(); await p.waitForTimeout(300);
  t(await p.evaluate(()=>MEUS_COLETIVOS.size)===1,'entrar num coletivo continua um clique');

  /* ================= arte no brasão ================= */
  /* uma imagem mínima gerada na hora: o teste não depende de arquivo */
  const artePNG=Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAGklEQVR4nGP8z4AAT'+
    'AwMDAxIHEYGBgYGBgYAFvUB/wYnDwoAAAAASUVORK5CYII=','base64');
  /* fundar é de contratante — o bloco acima deixou a conta em freela */
  await p.evaluate(()=>{MODO='contratante';aplicarModo();
    CARENCIA_ATE=0;MINHA_GUILDA=null;show('guildas');drawGuildas()});
  await p.waitForTimeout(350);
  await p.locator('#gl-criar').click(); await p.waitForTimeout(250);
  await p.locator('#fd-nome').fill('Farol Filmes');
  await p.locator('#fd-tag').fill('FRL');
  t((await p.locator('#fd-foto-prev').textContent()).trim()==='FRL',
    'antes da arte, o brasão mostra a tag — ela é o padrão, não a exceção');
  await p.locator('#fd-foto').setInputFiles({name:'b.png',mimeType:'image/png',buffer:artePNG});
  await p.waitForTimeout(500);
  t(/^url\("data:image/.test(await p.locator('#fd-foto-prev').evaluate(e=>e.style.backgroundImage)),
    'escolher imagem mostra a arte no preview');
  t(await p.locator('#fd-foto-x').isVisible(),'com opção de remover');
  await p.locator('#fd-ok').click(); await p.waitForTimeout(600);
  t(/^url\("data:image/.test(await p.locator('#sl-bras').evaluate(e=>e.style.backgroundImage)),
    'a arte vira o brasão do salão');
  t((await p.locator('#sl-bras').textContent()).trim()==='FRL',
    'e a tag continua no DOM como texto alternativo');
  await p.evaluate(()=>{show('guildas');drawGuildas()}); await p.waitForTimeout(400);
  const comArte=await p.evaluate(()=>{
    const el=[...document.querySelectorAll('#gl-rank .bras')].find(x=>x.textContent.trim()==='FRL');
    return el?/data:image/.test(el.getAttribute('style')):false;
  });
  t(comArte,'e o diretório desenha a mesma arte — a pintura do brasão é uma função só');
  await p.evaluate(()=>abrirSalao(MINHA_GUILDA)); await p.waitForTimeout(400);
  await p.locator('#sl-foto-x').click(); await p.waitForTimeout(400);
  t(!/data:image/.test(await p.locator('#sl-bras').evaluate(e=>e.style.backgroundImage||'')),
    'dá para voltar para a tag depois');
  await p.evaluate(()=>{MINHA_GUILDA=null;CARENCIA_ATE=0}); await p.waitForTimeout(150);

  /* a guilda também mora na barra de baixo, que é a única navegação que
     sobra no celular (a faixa de abas some abaixo de 820px) — mas só do
     lado do freela: o bloco de fundar acima deixou a conta em contratante,
     e lá o lugar dela agora é da Escuta */
  await p.evaluate(()=>{MODO='freela';aplicarModo()}); await p.waitForTimeout(250);
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(350);
  t(await p.locator('#bottombar [data-tab="guildas"]').isVisible(),'a guilda está na barra de baixo do freela');
  await p.locator('#bottombar [data-tab="guildas"]').click(); await p.waitForTimeout(350);
  t(await p.evaluate(()=>S.tab)==='guildas','e leva para a guilda');
  /* só os rótulos: .bg é o contador de propostas e .pt-bg o ponto do salão */
  const semQuebra=await p.evaluate(()=>[...document.querySelectorAll('#bottombar .bt:not([hidden]) span')]
    .filter(s=>!s.classList.contains('bg')&&!s.classList.contains('pt-bg'))
    .every(s=>s.getBoundingClientRect().height<=12));
  t(semQuebra,'com seis itens e nenhum rótulo quebrando em duas linhas');
  /* ⚠️ Esta asserção JÁ FOI o contrário: a guilda estava nas duas barras.
     Saiu da de quem contrata para a Escuta entrar — é o que o Volante
     abre, e vitrine escondida não vende. Agora a suíte cobra a troca. */
  await p.evaluate(()=>{MODO='contratante';aplicarModo()}); await p.waitForTimeout(250);
  t(!await p.locator('#bottombar [data-tab="guildas"]').isVisible(),
    'e sai da barra de quem contrata — o lugar virou da Escuta');
  t(await p.locator('#bottombar [data-tab="buscar"]').isVisible(),
    'que é quem ocupa o lugar: "Quem tá na escuta" a um toque');
  await p.evaluate(()=>{MODO='freela';aplicarModo()}); await p.waitForTimeout(200);

  /* ================= mobile ================= */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  await p.evaluate(()=>abrirGuilda('carroceria')); await p.waitForTimeout(400);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'a página da guilda cabe no mobile: '+ov);
  await p.screenshot({path:path.join(__dirname,'saida','guilda-mobile.png')});

  t(!errs.length,'sem erro de JS no fluxo inteiro');
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();
