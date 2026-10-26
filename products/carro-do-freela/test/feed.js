/**
 * FEED — a praça.
 *
 * Victor: "agora que tá virando uma rede social do audiovisual, vou ter que
 * criar um feed, pra que possam testar, curtir postagens, fazer comentários,
 * compartilhar no feed."
 *
 * E depois, liberando o ponto em que eu tinha travado: "não tem problema
 * usar os perfis que estão cadastrados, é só deixar o nome e uma abreviação
 * da primeira letra do sobrenome. Quando eu for lançar a plataforma vou
 * zerar todos os cadastros, cada pessoa vai entrar e cadastrar seu perfil."
 *
 * O que esta suíte protege:
 *   - o sobrenome SEMPRE abreviado no feed — foi o pedido explícito;
 *   - o aviso diz que os TEXTOS foram escritos para a demonstração: o
 *     cadastro é real, a fala não é, e a tela não pode esconder isso;
 *   - post do usuário NASCE COM ZERO curtida — curtida de brinde na
 *     primeira tela é a plataforma mentindo para o próprio dono;
 *   - o conteúdo semeado fala de OFÍCIO: nada de cliente com nome, valor
 *     de diária, nem juízo sobre outra pessoa (regra #3);
 *   - autor não se repete: quem declarou câmera E drone assinava dois
 *     posts, e feed com nome repetido parece defeito;
 *   - "preciso de gente" tem botão que vira conversa — é o único ponto em
 *     que o feed encosta no trabalho.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1300},deviceScaleFactor:2});
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
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(600);
  /* ============ 0. O LOGIN CAI NO FEED ============
     Victor: "quando logar, a primeira página a abrir é o feed geral de
     postagens de todas as pessoas que o usuário segue." */
  const ini=await p.evaluate(()=>({
    tela:S.tab, aba:FDP_ABA,
    postos:document.querySelectorAll('#fdp-lista .fdpost').length,
    todosSeguidos:POSTS.filter(x=>x.autor!=='eu').every(x=>FAV.has(x.autor))
  }));
  t(ini.tela==='feed','⟶ entrar abre o FEED, não Propostas nem Praças');
  t(ini.aba==='seguindo','⟶ e na aba de quem a pessoa segue, que foi o pedido');
  t(ini.todosSeguidos&&ini.postos===5,
    '⟶⟶ E ABRE CHEIO ('+ini.postos+' posts). Feed de quem eu sigo com autor '+
    'que eu não sigo abriria pela METADE, e meia tela parece defeito');

  /* ============ 1. NOME ABREVIADO, COMO ELE PEDIU ============ */
  const f=await p.evaluate(()=>{
    const el=document.getElementById('fdp-lista');
    return {posts:el.querySelectorAll('.fdpost').length,
      /* ⚠️ `.fdpost .fdtopo b`, NÃO `.fdtopo b` solto: desde 25/ago · 6 o
         cartão de anúncio do brechó também tem `.fdtopo`, e cortar "os 5
         primeiros" da lista inteira passou a pegar cartão no meio. A
         asserção é sobre AUTOR DE POST — o seletor tem de dizer isso. */
      autores:[...el.querySelectorAll('.fdpost .fdtopo b')].map(x=>x.textContent.trim()),
      /* e a mesma regra vale no cartão de anúncio, tirando o meu nome:
         abreviar o próprio sobrenome para si mesmo não protege ninguém */
      donos:[...el.querySelectorAll('.fdanu .fdau:not([data-fdperfil="'+EU.id+'"]) .fdnm b')]
        .map(x=>x.textContent.trim()),
      aviso:document.getElementById('v-feed').textContent,
      chamar:el.querySelectorAll('[data-fdchamar]').length};
  });
  t(f.posts===5,'o feed abre com '+f.posts+' posts');
  const soAutores=f.autores.slice(0,5);
  t(soAutores.every(n=>/^[^ ]+( [A-ZÀ-Þ]\.)?$/.test(n)),
    '⟶ TODO sobrenome abreviado: '+soAutores.join(', '));
  t(f.donos.every(n=>/^[^ ]+( [A-ZÀ-Þ]\.)?$/.test(n)),
    '⟶ e no cartão de anúncio do brechó também: '+(f.donos.join(', ')||'nenhum de terceiro'));
  t(new Set(soAutores).size===soAutores.length,
    '⟶ e nenhum autor se repete — quem faz câmera E drone assinava dois posts');

  /* ============ 2. A TELA DIZ O QUE É VERDADE ============ */
  /* (17/out · 5) A PRÉVIA SE DECLARA NUM LUGAR SÓ. Victor: "tira as mensagens
     de protótipo". O banner desta tela saiu; quem diz o que é ilustrativo é o
     selo "Prévia" ao lado da marca — e é ele que esta asserção cobra. */
  t(!/demonstra/i.test(f.aviso),'⟶ o feed não carrega banner de demonstração');
  t(await p.evaluate(()=>/ilustrativ/i.test(document.getElementById('pv-bem').textContent)),
    '⟶ e o resumo da prévia diz que pessoas e textos são ilustrativos');

  /* ============ 3. O CONTEÚDO SÓ FALA DE OFÍCIO ============ */
  const corpo=await p.evaluate(()=>
    [...document.querySelectorAll('.fdcorpo')].map(x=>x.textContent).join(' | '));
  t(!/R\$/.test(corpo),'nenhum post semeado cita valor de diária');
  t(!/deixou na mão|furou|sumiu|não apareceu|péssim|ruim/i.test(corpo),
    '⟶ e NENHUM juízo sobre outra pessoa — atribuir defeito a gente real é a regra #3');

  /* ============ 4. CURTIR ============ */
  const cur=await p.evaluate(()=>{
    const antes=document.querySelector('[data-curtir]').textContent.trim();
    document.querySelector('[data-curtir]').click();
    const d=document.querySelector('[data-curtir]');
    return {antes:+antes, depois:+d.textContent.trim(), on:d.getAttribute('aria-pressed')};
  });
  t(cur.depois===cur.antes+1&&cur.on==='true','curtir soma e marca: '+cur.antes+' → '+cur.depois);
  const des=await p.evaluate(()=>{
    document.querySelector('[data-curtir]').click();
    return +document.querySelector('[data-curtir]').textContent.trim();
  });
  t(des===cur.antes,'e descurtir devolve ao que era ('+des+')');

  /* ============ 5. COMENTAR ============ */
  const com=await p.evaluate(()=>{
    document.querySelector('[data-com]').click();
    const box=document.querySelector('[data-coms]');
    const antes=box.querySelectorAll('.fdcom').length;
    box.querySelector('.fdcombar input').value='Ficou bom demais';
    box.querySelector('.fdcombar button').click();
    const pt=POSTS.find(x=>x.id===1);
    return {antes, coments:pt.coments.length, ultimo:pt.coments[pt.coments.length-1]};
  });
  t(com.ultimo.de==='eu'&&com.ultimo.txt==='Ficou bom demais',
    'o comentário é seu e fica registrado: "'+com.ultimo.txt+'"');

  /* ============ 6. COMPARTILHAR ============ */
  /* ⚠️ COMPARTILHAR PASSOU A PERGUNTAR (20/ago · 11). Victor: "quando
     apertar compartilhar, abre uma caixa pra confirmar e opção de colocar
     algum texto". E resolve mais do que parece: era a ÚNICA ação do feed
     que publicava em nome da pessoa com um toque, sem confirmar e sem
     desfazer — curtir desfaz no segundo toque, comentar ela escreve antes. */
  const cx=await p.evaluate(()=>{
    const antes=POSTS.length;
    document.querySelector('[data-comp]').click();
    return {abriu:!document.getElementById('ovl-cp').hidden,
      naoPublicou:POSTS.length===antes,
      preview:!!document.querySelector('#cp2-vis .fdtopo'),
      campo:!!document.getElementById('cp2-txt')};
  });
  t(cx.abriu&&cx.preview,'compartilhar abre a caixa mostrando o post que vai junto');
  t(cx.naoPublicou,
    '⟶⟶ E NÃO PUBLICA ANTES DE CONFIRMAR. Era a única ação do feed que saía '+
    'em nome da pessoa com um toque só, sem confirmar e sem desfazer');
  const canc=await p.evaluate(()=>{
    const antes=POSTS.length;
    document.getElementById('cp2-x').click();
    return {fechou:document.getElementById('ovl-cp').hidden, publicou:POSTS.length!==antes};
  });
  t(canc.fechou&&!canc.publicou,'cancelar fecha e não deixa nada para trás');

  const cp=await p.evaluate(()=>{
    document.querySelector('[data-comp]').click();
    document.getElementById('cp2-txt').value='Isso aqui é aula.';
    const antes=POSTS.length;
    document.getElementById('cp2-ok').click();
    const n=POSTS[POSTS.length-1];
    return {cresceu:POSTS.length===antes+1, autor:n.autor, de:n.repost, txt:n.txt,
      mostraOriginal:!!document.querySelector('.fdrepost')};
  });
  t(cp.cresceu&&cp.autor==='eu'&&cp.de,
    'compartilhar cria um post SEU que carrega o original junto');
  t(cp.txt==='Isso aqui é aula.',
    '⟶ com o texto que a pessoa escreveu — compartilhar sem poder dizer por que é só repetir');
  t(cp.mostraOriginal,'e o original aparece dentro, com o autor dele — não se rouba crédito');

  /* ============ 7. PUBLICAR ============ */
  const pub=await p.evaluate(()=>{
    document.getElementById('fdp-txt').value='Entreguei o clipe hoje.';
    const caixaSemFoto=!document.getElementById('fdp-port-l').hidden;
    const tA=TRABALHOS.length;
    document.getElementById('fdp-postar').click();
    const n=POSTS[POSTS.length-1];
    return {autor:n.autor, curtidas:n.curtidas, coments:n.coments.length,
      caixaSemFoto, portA:tA, portD:TRABALHOS.length,
      limpou:document.getElementById('fdp-txt').value===''};
  });
  t(pub.autor==='eu'&&pub.limpou,'publicar entra no feed e limpa o campo');
  t(pub.curtidas===0&&pub.coments===0,
    '⟶⟶ POST NOVO NASCE COM ZERO. Curtida de brinde na primeira tela é a '+
    'plataforma mentindo para o próprio dono da conta');
  t(!pub.caixaSemFoto&&pub.portD===pub.portA,
    '⟶ e sem FOTO a caixa do portfólio nem aparece: guardar trabalho com capa '+
    'genérica da casa seria a plataforma inventando a imagem de um trabalho alheio');

  const vazio=await p.evaluate(()=>{
    const antes=POSTS.length;
    document.getElementById('fdp-txt').value='   ';
    document.getElementById('fdp-postar').click();
    return POSTS.length===antes;
  });
  t(vazio,'post vazio não entra');

  /* ============ 8. AS DUAS ABAS ============ */
  const abas=await p.evaluate(()=>{
    const antes=document.querySelectorAll('#fdp-lista .fdpost').length;
    document.querySelector('[data-fda="praca"]').click();
    const praca=document.querySelectorAll('#fdp-lista .fdpost').length;
    document.querySelector('[data-fda="seguindo"]').click();
    return {seguindo:antes, praca};
  });
  t(abas.praca>=abas.seguindo,
    '"A praça" mostra tudo ('+abas.praca+'), "Seguindo" só quem eu sigo ('+abas.seguindo+') — '+
    'a segunda aba existe para o feed não virar beco quem ainda não segue ninguém');

  /* ============ 9. SEGUIDORES E SEGUINDO ============ */
  const nums=await p.evaluate(()=>{
    abrirPerfil(EU.id);
    const meu=[...document.querySelectorAll('#p-nums div')].slice(0,2).map(x=>x.textContent.trim());
    const antes=FAV.size;
    const alvo=CREW.find(c=>!c.me&&!FAV.has(c.id));
    FAV.add(alvo.id); abrirPerfil(EU.id);
    const dep=document.querySelectorAll('#p-nums div')[1].textContent.trim();
    return {meu, antes, depois:FAV.size, dep, nota:document.getElementById('p-note').textContent};
  });
  t(/seguidores/.test(nums.meu[0])&&/seguindo/.test(nums.meu[1]),
    'o perfil mostra seguidores e seguindo');
  t(nums.dep===String(nums.depois)+'seguindo',
    '⟶ SEGUINDO É NÚMERO DE VERDADE: seguiu mais um e subiu '+nums.antes+' → '+nums.depois+
    ' na hora — é o único dos dois que a pessoa consegue testar');
  /* (17/out · 5) a nota do perfil saiu — ela começava com "Cadastro real",
     e o cadastro não é real desde 13/set; a prévia se declara no selo */
  t(!/Cadastro real/.test(nums.nota)&&!/demonstra/i.test(nums.nota),
    '⟶ o perfil não afirma "cadastro real" nem carrega aviso de demonstração');

  /* ============ 10. TRABALHO DO PORTFÓLIO VAI PARA O FEED ============ */
  const cp2=await p.evaluate(()=>{
    abrirPerfil(EU.id);
    const t=TRABALHOS.find(x=>x.dono===EU.id);
    abrirTrabalho(t.id);
    const temBotao=!document.getElementById('lb-feed').hidden;
    const antes=POSTS.length;
    document.getElementById('lb-feed').click();
    const n=POSTS[POSTS.length-1];
    return {temBotao, criou:POSTS.length===antes+1, tela:S.tab, autor:n.autor,
      tipo:n.tipo, img:!!n.img, trab:n.trab===t.id, curtidas:n.curtidas,
      txtTemTitulo:n.txt.startsWith(t.titulo)};
  });
  t(cp2.temBotao&&cp2.criou,'trabalho do portfólio vira post com um toque');
  t(cp2.img&&cp2.txtTemTitulo&&cp2.tipo==='entrega',
    'e nasce PREENCHIDO — capa, título, cliente e descrição já existiam no trabalho');
  t(cp2.tela==='feed','levando a pessoa para o feed, para ela ver o que publicou');
  t(cp2.curtidas===0,'e com zero curtida, como todo post novo');

  const rep=await p.evaluate(()=>{
    const tr=TRABALHOS.find(x=>x.dono===EU.id);
    const antes=POSTS.length;
    abrirTrabalho(tr.id);
    document.getElementById('lb-feed').click();
    return POSTS.length===antes;
  });
  t(rep,'⟶ e não republica a mesma peça: feed de repetição é feed que ninguém lê');

  const alheio=await p.evaluate(()=>{
    const outro=CREW.find(c=>!c.me);
    TRABALHOS.push({id:9911,dono:outro.id,img:FRAMES.show,titulo:'Peça de outro',
      cliente:'x',func:'Op. de câmera',ano:2025,tipo:'Show / DVD',link:'',desc:''});
    abrirTrabalho(9911);
    const h=document.getElementById('lb-feed').hidden;
    document.getElementById('ovl2').hidden=true; document.body.style.overflow='';
    return h;
  });
  t(alheio,
    '⟶⟶ E TRABALHO DE OUTRA PESSOA NÃO TEM O BOTÃO. Publicar peça alheia em '+
    'nome de quem clicou, num feed de nomes reais, é a regra #3 com outra roupa');

  /* ============ 11. FOTO E VÍDEO NO PUBLICAR ============ */
  await p.evaluate(()=>{show('feed');drawFeed()}); await p.waitForTimeout(300);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR4nGP8z8Dwn4GKgIma'+
    'hgEA/8sD/1n0BMQAAAAASUVORK5CYII=','base64');
  await p.setInputFiles('#fdp-foto',{name:'frame.png',mimeType:'image/png',buffer:png});
  await p.waitForTimeout(500);
  const fot=await p.evaluate(()=>({
    tipo:FDP_ANEXO&&FDP_ANEXO.tipo, prev:!!document.querySelector('#fdp-prev img'),
    nome:document.getElementById('fdp-arqn').textContent,
    ehData:/^data:/.test((FDP_ANEXO||{}).src||'')}));
  t(fot.tipo==='foto'&&fot.prev,'foto anexa e mostra a prévia antes de publicar');
  t(fot.ehData,
    '⟶ e vira data URI pelo mesmo lerImagem da casa — cabe no arquivo único e sobrevive à repintura');

  const pubf=await p.evaluate(()=>{
    document.getElementById('fdp-txt').value='Frame do job de ontem';
    const caixa=!document.getElementById('fdp-port-l').hidden;
    document.getElementById('fdp-port').checked=true;
    const tA=TRABALHOS.length;
    document.getElementById('fdp-postar').click();
    const n=POSTS[POSTS.length-1];
    return {img:!!n.img, limpou:FDP_ANEXO===null,
      prev:document.getElementById('fdp-prev').innerHTML==='',
      caixaApareceu:caixa&&TRABALHOS.length===tA+1,
      naTela:!!document.querySelector('#fdp-lista img.fdimg')};
  });
  t(pubf.img&&pubf.naTela,'publica com a foto e ela aparece no feed');
  t(pubf.caixaApareceu,
    '⟶ COM foto a caixa do portfólio aparece, e guardar guarda: postar alimenta '+
    'o portfólio em vez de criar um segundo sistema de conteúdo que ninguém mantém');
  t(pubf.limpou&&pubf.prev,'e o anexo some do compositor — senão o próximo post sai com a foto do anterior');

  await p.setInputFiles('#fdp-video',{name:'take.mp4',mimeType:'video/mp4',buffer:Buffer.from('mp4')});
  await p.waitForTimeout(400);
  const vid=await p.evaluate(()=>{
    const r={tipo:FDP_ANEXO&&FDP_ANEXO.tipo, blob:/^blob:/.test((FDP_ANEXO||{}).src||''),
      prev:!!document.querySelector('#fdp-prev video')};
    document.getElementById('fdp-txt').value='Take bruto';
    document.getElementById('fdp-postar').click();
    const n=POSTS[POSTS.length-1];
    r.video=!!n.video; r.semImg=!n.img;
    r.tag=!!document.querySelector('#fdp-lista video.fdimg');
    return r;
  });
  t(vid.tipo==='video'&&vid.prev&&vid.video&&vid.tag,'vídeo anexa, mostra prévia e toca no feed');
  t(vid.blob,
    '⟶ e vira object URL, NÃO data URI: um clipe em base64 dentro da página '+
    'estouraria o arquivo único — e blob não é requisição externa, então a regra da casa segue de pé');

  const so=await p.evaluate(()=>{
    const antes=POSTS.length;
    document.getElementById('fdp-txt').value='';
    document.getElementById('fdp-postar').click();
    const vazio=POSTS.length===antes;
    FDP_ANEXO={tipo:'foto',src:'data:image/png;base64,iVBORw0KGgo=',nome:'x.png'};
    document.getElementById('fdp-postar').click();
    return {vazio, comAnexo:POSTS.length===antes+1};
  });
  t(so.vazio,'post sem texto e sem anexo continua não entrando');
  t(so.comAnexo,
    '⟶ mas só a imagem publica: exigir legenda de quem acabou de mostrar o trabalho é pedir texto à toa');

  /* ============ 11b. CURTIR E FIXAR COMENTÁRIO ============ */
  const cc=await p.evaluate(()=>{
    FDP_ABA='praca'; drawFeed();
    const pt=POSTS.find(x=>x.coments.length&&x.autor!=='eu');
    document.querySelector('[data-com="'+pt.id+'"]').click();
    const box=document.querySelector('[data-coms="'+pt.id+'"]');
    const antes=box.querySelector('[data-ccurtir]').textContent.trim();
    box.querySelector('[data-ccurtir]').click();
    const b2=document.querySelector('[data-coms="'+pt.id+'"]');
    return {antes, depois:b2.querySelector('[data-ccurtir]').textContent.trim(),
      on:b2.querySelector('[data-ccurtir]').getAttribute('aria-pressed'),
      fixarNoAlheio:!!b2.querySelector('[data-cfixar]')};
  });
  t(cc.on==='true'&&cc.depois!==cc.antes,
    'curtir comentário conta e marca: "'+cc.antes+'" → "'+cc.depois+'"');
  t(!cc.fixarNoAlheio,
    '⟶⟶ E FIXAR NÃO EXISTE EM POST DOS OUTROS. Fixar é escolher o que fica no '+
    'topo da conversa embaixo do SEU trabalho — quem passou por ali não decide isso');

  const fx=await p.evaluate(()=>{
    document.getElementById('fdp-txt').value='Post meu pra testar fixar';
    document.getElementById('fdp-postar').click();
    const meu=POSTS[POSTS.length-1];
    meu.coments.push(novoComentario(CREW.find(c=>!c.me).id,'primeiro'));
    meu.coments.push(novoComentario(CREW.filter(c=>!c.me)[1].id,'segundo'));
    drawFeed();
    document.querySelector('[data-com="'+meu.id+'"]').click();
    const box=document.querySelector('[data-coms="'+meu.id+'"]');
    const temBotao=box.querySelectorAll('[data-cfixar]').length;
    box.querySelectorAll('[data-cfixar]')[1].click();
    const b2=document.querySelector('[data-coms="'+meu.id+'"]');
    const r={temBotao, fixados:meu.coments.filter(c=>c.fixado).length,
      subiu:/segundo/.test(b2.querySelector('.fdcom p').textContent),
      marca:!!b2.querySelector('.fdfix')};
    /* fixar OUTRO desfixa o primeiro */
    b2.querySelectorAll('[data-cfixar]')[1].click();
    r.depoisDoSegundo=meu.coments.filter(c=>c.fixado).length;
    return r;
  });
  t(fx.temBotao===2,'no MEU post cada comentário tem o botão de fixar');
  t(fx.subiu&&fx.marca,'fixar sobe o comentário para o topo e marca ele');
  t(fx.fixados===1&&fx.depoisDoSegundo===1,
    '⟶ e SÓ UM fica fixado: dois destaques não destacam nada');

  /* ============ 11c. RESPONDER COMENTÁRIO ============
     "coloca a opção de responder o comentário também, assim como tem no
     Instagram" — e o "assim como no Instagram" carrega uma regra: a árvore
     desce UM nível só. */
  const rs=await p.evaluate(()=>{
    FDP_ABA='praca'; drawFeed();
    const pt=POSTS.find(x=>x.coments.length&&x.autor!=='eu');
    document.querySelector('[data-com="'+pt.id+'"]').click();
    const box=document.querySelector('[data-coms="'+pt.id+'"]');
    box.querySelector('[data-cresp]').click();
    const b2=document.querySelector('[data-coms="'+pt.id+'"]');
    const inp=b2.querySelector('.fdcombar input');
    return {id:pt.id, aviso:!!b2.querySelector('.fdrespalvo'),
      texto:(b2.querySelector('.fdrespalvo')||{}).textContent||'',
      prefixo:inp.value, botao:b2.querySelector('.fdcombar button').textContent};
  });
  t(rs.aviso&&/Respondendo a/.test(rs.texto),'responder marca a quem: "'+rs.texto.replace('✕','')+'"');
  t(/^@/.test(rs.prefixo)&&rs.botao==='Responder',
    '⟶ com o @ já escrito e o botão dizendo Responder — a caixa é a mesma, o modo muda');

  const env=await p.evaluate(()=>{
    const pt=POSTS.find(x=>x.coments.length&&x.autor!=='eu');
    const box=document.querySelector('[data-coms="'+pt.id+'"]');
    const raiz=pt.coments.find(c=>!c.pai);
    box.querySelector('.fdcombar input').value='@Fulano boa!';
    box.querySelector('.fdcombar button').click();
    const n=pt.coments[pt.coments.length-1];
    const b2=document.querySelector('[data-coms="'+pt.id+'"]');
    return {pai:n.pai===raiz.id, aninhada:!!b2.querySelector('.fdresp .fdcom.fdr'),
      saiu:!b2.querySelector('.fdrespalvo')};
  });
  t(env.pai&&env.aninhada,'a resposta entra ANINHADA sob o comentário, não solta no fim');
  t(env.saiu,'e o modo de resposta se desfaz sozinho depois de enviar');

  const vr=await p.evaluate(()=>{
    const pt=POSTS.find(x=>x.coments.some(c=>c.pai));
    const box=document.querySelector('[data-coms="'+pt.id+'"]');
    const rot=box.querySelector('[data-cvr]').textContent;
    box.querySelector('[data-cvr]').click();
    const b2=document.querySelector('[data-coms="'+pt.id+'"]');
    return {rot, depois:b2.querySelector('[data-cvr]').textContent,
      escondeu:!b2.querySelector('.fdresp .fdcom.fdr')};
  });
  t(/resposta/.test(vr.rot)&&vr.escondeu,
    '⟶ e as respostas RECOLHEM: "'+vr.depois+'" — um comentário com oito respostas '+
    'empurraria os outros para fora da tela');

  const um=await p.evaluate(()=>{
    const pt=POSTS.find(x=>x.coments.some(c=>c.pai));
    const resp=pt.coments.find(c=>c.pai);
    const box=document.querySelector('[data-coms="'+pt.id+'"]');
    box.querySelector('[data-cvr]').click();
    const b2=document.querySelector('[data-coms="'+pt.id+'"]');
    b2.querySelector('.fdcom.fdr [data-cresp]').click();
    const b3=document.querySelector('[data-coms="'+pt.id+'"]');
    b3.querySelector('.fdcombar input').value='segunda volta';
    b3.querySelector('.fdcombar button').click();
    const n=pt.coments[pt.coments.length-1];
    return {alvo:resp.id, pai:n.pai, netos:pt.coments
      .filter(c=>c.pai&&pt.coments.some(x=>x.id===c.pai&&x.pai)).length};
  });
  t(um.pai!==um.alvo&&um.netos===0,
    '⟶⟶ E A ÁRVORE DESCE UM NÍVEL SÓ. Responder a uma resposta responde à MESMA '+
    'raiz: escada de neto não cabe em 390px, e a conversa deixa de ser legível '+
    'justamente onde ela acontece. O @ já diz a quem se fala');

  const fx2=await p.evaluate(()=>{
    document.getElementById('fdp-txt').value='meu post com resposta';
    document.getElementById('fdp-postar').click();
    const meu=POSTS[POSTS.length-1];
    const c1=novoComentario(CREW.find(c=>!c.me).id,'raiz');
    meu.coments.push(c1);
    meu.coments.push(novoComentario(CREW.filter(c=>!c.me)[1].id,'uma resposta',c1.id));
    drawFeed();
    document.querySelector('[data-com="'+meu.id+'"]').click();
    const box=document.querySelector('[data-coms="'+meu.id+'"]');
    box.querySelector('[data-cvr]').click();
    const b2=document.querySelector('[data-coms="'+meu.id+'"]');
    return {raiz:!!b2.querySelector('.fdcom:not(.resp) [data-cfixar]'),
      resposta:!!b2.querySelector('.fdcom.fdr [data-cfixar]')};
  });
  t(fx2.raiz&&!fx2.resposta,
    '⟶ e FIXAR só existe no comentário raiz: fixar uma resposta a tiraria do '+
    'contexto, e o topo mostraria metade de uma conversa');

  /* ============ 11d. A MÍDIA ABRE EM TELA CHEIA ============
     "coloca a mídia postada no feed com a opção de abrir em tela cheia
     quando clicar e se for vídeo, abrir pra dar play no video." */
  await p.evaluate(()=>{FDP_ABA='praca';drawFeed()}); await p.waitForTimeout(300);
  const md=await p.evaluate(()=>({
    botoes:document.querySelectorAll('#fdp-lista [data-mid]').length,
    ehBotao:(document.querySelector('#fdp-lista [data-mid]')||{}).tagName,
    semControles:!document.querySelector('#fdp-lista video[controls]')
  }));
  t(md.botoes>0&&md.ehBotao==='BUTTON',
    'toda mídia do feed é um botão de verdade — teclado e leitor de tela chegam nela');
  /* ⚠️ A MÍDIA MANDA NA PRÓPRIA PROPORÇÃO. Era `aspect-ratio:16/9` com
     `object-fit:cover`, e mentia de dois jeitos: cortava cabeça e pé de foto
     retrato, e onde o corte não dava conta sobrava barra preta. Foto de show
     em 4/3 e vídeo vertical de celular são o caso normal aqui. */
  const prop=await p.evaluate(async()=>{
    const feito=[];
    for(const [w,h] of [[600,900],[700,700],[1200,500]]){
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
      const cx=cv.getContext('2d'); cx.fillStyle='#c04'; cx.fillRect(0,0,w,h);
      const id=Math.max(0,...POSTS.map(x=>x.id))+1;
      POSTS.push({id,autor:'eu',tipo:'entrega',q:new Date(),txt:w+'x'+h,
        img:cv.toDataURL('image/jpeg',.8),curtidas:0,coments:[],compart:0});
      feito.push({id,alvo:+(w/h).toFixed(3)});
    }
    FDP_ABA='praca'; drawFeed();
    await new Promise(r=>setTimeout(r,400));
    return feito.map(f=>{
      const im=document.querySelector('.fdpost[data-post="'+f.id+'"] img.fdimg');
      const b2=im.getBoundingClientRect();
      return {alvo:f.alvo, naTela:+(b2.width/b2.height).toFixed(3)};
    });
  });
  t(prop.every(x=>Math.abs(x.alvo-x.naTela)<0.03),
    '⟶⟶ A MÍDIA GUARDA A PROPORÇÃO DO ARQUIVO — retrato, quadrada e larga: '+
    prop.map(x=>x.alvo+'→'+x.naTela).join(', ')+'. Sem barra preta e sem corte');

  t(md.semControles,
    '⟶ e a prévia do vídeo NÃO tem controles: com eles o dedo cai na barra de '+
    'progresso e o toque vira scrub em vez de abrir');

  const ab=await p.evaluate(()=>{
    document.querySelector('#fdp-lista [data-mid]').click();
    const ov=document.getElementById('ovl-mid');
    return {aberto:!ov.hidden, img:!!ov.querySelector('#mid-palco img'),
      pe:document.getElementById('mid-pe').textContent,
      travou:document.body.style.overflow==='hidden'};
  });
  t(ab.aberto&&ab.img,'clicar abre a foto em tela cheia');
  const fundo=await p.evaluate(()=>{
    const ov=document.getElementById('ovl-mid'), cs=getComputedStyle(ov);
    return {blur:cs.backdropFilter||cs.webkitBackdropFilter,
      visTransparente:getComputedStyle(document.querySelector('.midvis')).backgroundColor,
      suporte:getComputedStyle(document.getElementById('fbk-btn')).opacity};
  });
  t(/blur/.test(fundo.blur)&&/rgba\(0, 0, 0, 0\)/.test(fundo.visTransparente),
    '⟶ o fundo é DESFOCADO, não preto — e o palco é transparente, senão ele '+
    'cobriria o desfoque E comeria o clique de fechar');
  t(fundo.suporte==='0',
    '⟶ e o botão de suporte recua: ele é z-index 96 e flutuaria por cima da foto');
  t(!!ab.pe&&ab.travou,'com autor e legenda no pé, e a página atrás travada');

  const fe=await p.evaluate(()=>{
    document.getElementById('mid-x').click();
    return {fechou:document.getElementById('ovl-mid').hidden,
      limpou:document.getElementById('mid-palco').innerHTML==='',
      rolagem:document.body.style.overflow===''};
  });
  t(fe.fechou&&fe.limpou&&fe.rolagem,'fechar limpa o palco e devolve a rolagem');

  /* ⚠️ FECHAR TOCANDO NO FUNDO. Medido: listar as camadas não bastava — o
     `.midpalco` só vai até 675 numa tela de 844, e os últimos 169px são a
     legenda. A regra é por EXCLUSÃO: fundo é tudo que não é a mídia nem o X. */
  const fora=await p.evaluate(()=>{
    document.querySelector('#fdp-lista [data-mid]').click();
    const g=document.getElementById('mid-pe').getBoundingClientRect();
    return {topoLegenda:Math.round(g.top), altura:innerHeight};
  });
  await p.mouse.click(12,fora.topoLegenda+30);
  await p.waitForTimeout(250);
  t(await p.evaluate(()=>document.getElementById('ovl-mid').hidden),
    '⟶⟶ TOCAR NO FUNDO FECHA, inclusive na faixa da legenda ('+
    fora.topoLegenda+'–'+fora.altura+'), que a lista de camadas deixava de fora');

  const naMidia=await p.evaluate(()=>{
    document.querySelector('#fdp-lista [data-mid]').click();
    document.querySelector('#mid-palco img').click();
    return !document.getElementById('ovl-mid').hidden;
  });
  t(naMidia,'⟶ e tocar NA mídia não fecha — no vídeo, pausar viraria fechar');
  await p.evaluate(()=>document.getElementById('mid-x').click());

  await p.setInputFiles('#fdp-video',{name:'t.mp4',mimeType:'video/mp4',buffer:Buffer.from('x')});
  await p.waitForTimeout(400);
  const vd=await p.evaluate(()=>{
    document.getElementById('fdp-txt').value='take bruto';
    document.getElementById('fdp-postar').click();
    const n=POSTS[POSTS.length-1];
    const el=document.querySelector('.fdpost[data-post="'+n.id+'"]');
    const r={play:!!el.querySelector('.fdplay'), muda:el.querySelector('video').muted, id:n.id};
    el.querySelector('[data-mid]').click();
    const v2=document.querySelector('#mid-palco video');
    r.abriu=!document.getElementById('ovl-mid').hidden;
    r.controles=!!(v2&&v2.hasAttribute('controls'));
    r.autoplay=!!(v2&&v2.hasAttribute('autoplay'));
    return r;
  });
  t(vd.play&&vd.muda,'a prévia do vídeo mostra o play e fica muda na lista');
  t(vd.abriu&&vd.controles&&vd.autoplay,
    '⟶⟶ E ABRIR O VÍDEO JÁ DÁ PLAY, com som e controle — que é onde ele deve tocar');

  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  t(await p.evaluate(()=>document.getElementById('ovl-mid').hidden),'e Esc fecha');

  const rp=await p.evaluate(()=>{
    const alvo=POSTS.find(x=>x.video&&!x.repost);
    document.querySelector('.fdpost[data-post="'+alvo.id+'"] [data-comp]').click();
    document.getElementById('cp2-ok').click();
    const n=POSTS[POSTS.length-1];
    const el=document.querySelector('.fdpost[data-post="'+n.id+'"]');
    return {video:!!el.querySelector('.fdrepost video'), play:!!el.querySelector('.fdrepost .fdplay')};
  });
  t(rp.video&&rp.play,
    '⟶ e o REPOST carrega o vídeo junto: antes ele desenhava só orig.img e '+
    'compartilhar um post de vídeo perdia a mídia no caminho');

  /* ============ 12. SEGUIR, E O PERFIL A UM TOQUE ============
     Victor: "preciso de botão de seguir e deixar de seguir a pessoa. No
     feed quando clicar na foto ou no nome da pessoa tem que abrir o
     perfil dela." */
  await p.evaluate(()=>{show('feed');FDP_ABA='praca';drawFeed()}); await p.waitForTimeout(350);
  const sg2=await p.evaluate(()=>{
    const b1=document.querySelector('#fdp-lista [data-fdseg]');
    const id=+b1.dataset.fdseg, era=FAV.has(id);
    b1.click();
    const b2=document.querySelector('#fdp-lista [data-fdseg="'+id+'"]');
    return {era, agora:FAV.has(id), sumiu:!b2,
      rot:b2?b2.textContent:null, pressed:b2?b2.getAttribute('aria-pressed'):null};
  });
  t(sg2.era!==sg2.agora,'o botão do feed segue e deixa de seguir');
  t(!sg2.sumiu,
    '⟶⟶ E O POST NÃO SOME DEBAixO DO DEDO. A aba "Seguindo" filtra por FAV: '+
    'redesenhar fazia o post desaparecer de quem acabou de tocar em "Seguindo" '+
    'para parar de seguir — o mesmo defeito do compartilhar com outra roupa');
  t(sg2.rot===(sg2.agora?'Seguindo':'Seguir')&&sg2.pressed===String(sg2.agora),
    'e o rótulo troca no lugar: "'+sg2.rot+'"');

  const pf=await p.evaluate(()=>{
    const b1=document.querySelector('#fdp-lista [data-fdperfil]');
    const id=+b1.dataset.fdperfil;
    b1.click();
    const bs=document.getElementById('p-seguir');
    return {tela:S.tab, certo:S.perfil===id, rot:bs.textContent,
      sincro:(bs.textContent==='Seguindo')===FAV.has(id),
      estrela:document.getElementById('p-star').getAttribute('aria-pressed')===String(FAV.has(id))};
  });
  t(pf.tela==='perfil'&&pf.certo,'tocar na foto ou no nome abre o perfil da pessoa');
  t(pf.sincro&&pf.estrela,
    '⟶ e o botão do perfil, a estrela e o do feed leem o MESMO FAV — dois estados '+
    'para a mesma relação dessincronizariam na primeira tela que esquecesse de repintar');

  const meuP=await p.evaluate(()=>{
    abrirPerfil(EU.id);
    return document.getElementById('p-seguir').hidden;
  });
  t(meuP,'e no meu próprio perfil o botão de seguir não existe');

  /* ============ 13. O "ME CHAMA" NO MEU PRÓPRIO POST ============
     Victor: "não tô conseguindo colocar o botão de me chama na hora de
     publicar algo." Ele publicava "preciso de gente" e não via nada. */
  const mc=await p.evaluate(()=>{
    show('feed'); FDP_TIPO='procura'; FDP_ABA='praca';
    document.getElementById('fdp-txt').value='Preciso de som direto sábado';
    document.getElementById('fdp-postar').click();
    const n=POSTS[POSTS.length-1];
    const el=document.querySelector('.fdpost[data-post="'+n.id+'"]');
    const outro=[...document.querySelectorAll('.fdpost')]
      .find(x=>x.querySelector('[data-fdchamar]'));
    return {tipo:n.tipo, aviso:!!el.querySelector('.fdmeu'),
      txt:(el.querySelector('.fdmeu')||{}).textContent||'',
      semBotao:!el.querySelector('[data-fdchamar]'),
      outroTem:!!outro};
  });
  t(mc.aviso&&/Me chama/.test(mc.txt),
    '⟶ no MEU post de "preciso de gente" o botão aparece desligado, com o motivo: "'+mc.txt+'"');
  t(mc.semBotao,'⟶ e não é botão de verdade — ninguém se chama, e fingir seria pior');
  t(mc.outroTem,'no post de outra pessoa ele continua sendo botão que funciona');

  /* ============ 14. PUBLICAÇÕES: ATIVIDADE ≠ OBRA ============
     Victor: "pode montar no perfil a aba de publicações, pode ser a
     primeira a abrir" — e a preocupação dele: "tem que ter cuidado pra n
     misturar muito pq o perfil do usuário também é o portfólio dele". */
  const pbl=await p.evaluate(()=>{
    document.querySelector('#fdp-lista [data-comp]').click();
    abrirPerfil(EU.id);
    const q=document.querySelectorAll('#p-pub .pubq').length;
    const meus=POSTS.filter(x=>x.autor==='eu');
    return {aba:S.ptab, primeira:document.querySelector('.pt').dataset.pt,
      quadros:q, meus:meus.length, reposts:meus.filter(x=>x.repost).length,
      semRepost:q===meus.filter(x=>!x.repost).length,
      nota:document.getElementById('p-pub').textContent};
  });
  t(pbl.aba==='pub'&&pbl.primeira==='pub','Publicações é a primeira aba do perfil e abre nela');
  t(pbl.quadros>0,'com a grade das publicações: '+pbl.quadros);
  t(pbl.reposts>0&&pbl.semRepost,
    '⟶⟶ E REPOST NÃO ENTRA NO PERFIL ('+pbl.reposts+' compartilhado(s) fora de '+pbl.quadros+
    ' quadros). Peça de outra pessoa não é obra sua, e o perfil é onde alguém decide te contratar');
  t(/compartilhado de outra pessoa fica só no feed/.test(pbl.nota),
    '⟶ e a tela diz a regra, em vez de o usuário descobrir por ausência');
  t(await p.locator('.pt[data-pt="port"]').count()===1,
    'o Portfólio continua existindo ao lado — obra curada e atividade são duas coisas');

  /* ============ 15. RODANDO ============
     "coloca no feed as bolinhas de stories, com fotos e vídeos
     temporários de até 30 segundos." */
  await p.evaluate(()=>{show('feed');drawFeed()}); await p.waitForTimeout(350);
  const st=await p.evaluate(()=>({
    bolinhas:document.querySelectorAll('#rd-bar .rdit').length,
    primeira:document.querySelector('#rd-bar .rdit span:last-child').textContent,
    mais:!!document.querySelector('.rdmais'),
    limite:RD_VIDEO_MAX, horas:RD_HORAS
  }));
  t(st.bolinhas>1,'o feed abre com as bolinhas do Rodando: '+st.bolinhas);
  t(!/[Ss]tor(y|ies)/.test(await p.locator('#v-feed').textContent()),
    '⟶ e a palavra "story" não aparece em lugar nenhum da tela');
  t(/Rodando/.test(await p.locator('.rdcab').textContent()),
    '⟶ o trilho se chama RODANDO — "timeline" seria o nome do FEED que está logo abaixo');
  t(st.primeira==='Você'&&st.mais,
    '⟶ e a MINHA é sempre a primeira, com o "+": esconder ela sem story deixaria a fileira sem porta');
  t(st.limite===30,'vídeo do Rodando vai até '+st.limite+'s, como pedido');

  const vis=await p.evaluate(()=>{
    document.querySelectorAll('#rd-bar .rdit')[1].click();
    const ov=document.getElementById('ovl-rd');
    return {aberto:!ov.hidden, nome:document.getElementById('rd-nome').textContent,
      barras:document.querySelectorAll('#rd-barras i').length,
      quando:document.getElementById('rd-quando').textContent,
      leg:document.getElementById('rd-leg').textContent};
  });
  t(vis.aberto&&vis.barras>0,'abre o visor com uma barra por item: '+vis.barras);
  t(/^há /.test(vis.quando),'dizendo de quando é: '+vis.quando);
  t(!!vis.leg,'com a legenda por cima');

  const fim=await p.evaluate(()=>{
    while(rdI<rdFila.length) document.getElementById('rd-prox').click();
    return {fechou:document.getElementById('ovl-rd').hidden, vistos:rdVistos.size};
  });
  t(fim.fechou&&fim.vistos>0,'chegando ao fim do grupo ele fecha sozinho');

  const exp=await p.evaluate(()=>{
    const antes=rdGrupos().length;
    RODANDO.forEach(x=>x.q=Date.now()-25*3600000);
    const dep=rdGrupos().length;
    drawRodando();
    return {antes, dep, bolinhas:document.querySelectorAll('#rd-bar .rdit').length};
  });
  t(exp.antes>0&&exp.dep===0,
    '⟶⟶ E ELES SOMEM SOZINHOS: "temporário" é DERIVADO da hora, não agendado. '+
    'Nada apaga nada — a conta é feita na hora de mostrar, e é por isso que '+
    'o protótipo expira story sem servidor nenhum');
  t(exp.bolinhas===1,'sobrando só a minha bolinha, que é a porta de publicar');

  /* ============ 16. O FEED QUE VIRA TRABALHO ============ */
  t(f.chamar===1,'"preciso de gente" tem botão de chamar — é onde o feed encosta no trabalho');

  /* ============ celular ============ */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  await p.evaluate(()=>{ document.querySelectorAll('.ovl').forEach(o=>o.hidden=true);
    document.body.style.overflow=''; show('feed'); });
  await p.waitForTimeout(400);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no celular: '+ov);

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();
