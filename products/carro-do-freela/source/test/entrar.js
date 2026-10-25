/* A TELA DE ENTRAR (17/out · 13).
 *
 * Victor, com a tela de login da Lorien World de referência: "coloca um
 * menu de login mais bonito, mais animado. Deixa só pra entrar com Google
 * e com a conta oficial da Carro do Freela. Brinca com a ideia do carro,
 * UX/UI Design precisa ser de high end." E, na mesma mensagem: "o tema
 * principal da plataforma tem que ser o dark, esse é o padrão."
 *
 * O que esta suíte jura:
 *   1. SÓ DUAS PORTAS: Google e a conta oficial (e-mail e senha). Apple,
 *      WhatsApp e Microsoft não voltam por engano;
 *   2. a conta oficial VALIDA o que a pessoa digitou e diz o que faltou —
 *      e NUNCA guarda a senha (nem o e-mail) em lugar nenhum do aparelho;
 *   3. "Criar conta" é um modo do mesmo cartão e leva ao perfil;
 *      "Esqueci a senha" diz a verdade em vez de fingir que mandou e-mail;
 *   4. a cena é o carro da casa na estrada, e ela se mexe — menos para
 *      quem pediu menos movimento;
 *   5. cabe na tela sem rolagem (a regra de 19/ago) no celular e no
 *      desktop, e a partida do carro não segura a entrada de ninguém.
 * Roda em origem http porque confere o armazenamento depois de entrar.
 */
const { chromium } = require('playwright');
const {servir,URL}=require('./_servir.js');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const errs=[];
  const semVideoAntes=[];
  const abrir=async(W,H,opts={})=>{
    const mob=W<821;
    const ctx=await b.newContext({viewport:{width:W,height:H},isMobile:mob,hasTouch:mob,
      reducedMotion:opts.reduz?'reduce':'no-preference'});
    const p=await ctx.newPage(); await servir(p);
    p.on('pageerror',e=>errs.push(W+': '+e.message));
    p.on('console',m=>{ if(m.type()==='error'&&!/web3forms/.test(m.text())) errs.push(W+': '+m.text()) });
    await p.addInitScript(o=>{ try{
      localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-guia','1');
      if(o.entrou) localStorage.setItem('cdf-entrou','1');
      if(o.tema) localStorage.setItem('cf-app-tema',o.tema);
    }catch(e){} },opts);
    await p.goto(URL,{waitUntil:'networkidle'});
    await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:20000}).catch(()=>{});
    semVideoAntes.push(await p.evaluate(()=>!document.getElementById('lg-video').getAttribute('src')));
    if(opts.criar) await p.locator('#hn-criar').click(); else await p.locator('.homenav .entrar-cta').click();
    await p.waitForTimeout(opts.reduz?250:1300);
    return {ctx,p};
  };

  /* ================= 1. as duas portas, no escuro ================= */
  {
    const {ctx,p}=await abrir(390,844);
    const r=await p.evaluate(()=>({
      escuro:!document.documentElement.classList.contains('app-light'),
      provs:[...document.querySelectorAll('#v-entrar [data-login]')].map(b=>b.dataset.login),
      textos:document.getElementById('v-entrar').innerText,
      campos:['lg-email','lg-senha'].map(id=>{const e=document.getElementById(id);return e&&e.offsetParent?e.type:null}),
      rotulos:[...document.querySelectorAll('#v-entrar .lgn-campo label')].map(l=>l.textContent),
      abas:[...document.querySelectorAll('#v-entrar .lgaba')].map(a=>a.textContent),
      fonte:getComputedStyle(document.getElementById('lg-email')).fontSize,
      sh:document.documentElement.scrollHeight, ih:innerHeight, sw:document.documentElement.scrollWidth, iw:innerWidth,
      okVis:(()=>{const e=document.getElementById('lg-ok').getBoundingClientRect();return e.bottom<=innerHeight})(),
      gVis:(()=>{const e=document.querySelector('#v-entrar [data-login="Google"]').getBoundingClientRect();return e.bottom<=innerHeight})(),
      carro:(()=>{const i=document.querySelector('#v-entrar .lgn-carimg');return !!(i&&i.complete&&i.naturalWidth>0&&i.src===HOME3D.carro.src)})(),
      video:(()=>{const vd=document.getElementById('lg-video'), cena=document.querySelector('#v-entrar .lgn-cena');
        return {tem:!!(LOGIN_VIDEO&&LOGIN_VIDEO.mp4), mudo:vd.muted, loop:vd.loop, inline:vd.hasAttribute('playsinline'), oculto:vd.getAttribute('aria-hidden'),
          /* (18/out · 2) o vídeo e o pôster são ARQUIVOS do domínio (m/), não
             base64 dentro do HTML — era isso que os deixava em baixa no computador */
          arq:/\/m\/login[.@]/.test(vd.getAttribute('src')||''), poster:/^url\("?[^"]*\/m\/login-poster[.@][^"]*\.webp/.test(cena.style.backgroundImage),
          classe:cena.classList.contains('com-video'), desenho:getComputedStyle(document.querySelector('#v-entrar .lgn-carro')).display,
          h264:document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"'), escondido:vd.hidden}})(),
      suporte:getComputedStyle(document.getElementById('fbk-btn')).display
    }));
    t(r.escuro,'⟶⟶ quem nunca escolheu tema abre a tela de entrar no ESCURO — o padrão desde 17/out · 13');
    t(r.provs.join()==='Google','⟶⟶ só UM provedor de fora: o Google ('+r.provs.join(', ')+')');
    t(!/Apple|WhatsApp|Microsoft/.test(r.textos),'Apple, WhatsApp e Microsoft não aparecem em lugar nenhum da tela');
    t(r.campos[0]==='email'&&r.campos[1]==='password','a conta oficial é e-mail e senha, com a senha escondida');
    t(r.rotulos.join()==='E-mail,Senha','e os campos dizem o que pedem (o rótulo é <label>, não só placeholder)');
    t(r.abas.join()==='Sou freela,Quero contratar','a chave de lado usa as palavras dos botões da home');
    t(parseFloat(r.fonte)>=16,'campo com 16px — o Safari não amplia a página ao tocar ('+r.fonte+')');
    t(r.sh<=r.ih+1&&r.sw<=r.iw,'⟶⟶ 390×844: cabe na tela, sem rolagem ('+r.sh+' de '+r.ih+')');
    t(r.okVis&&r.gVis,'Entrar e Continuar com Google à vista sem rolar');
    /* ⚠️ desde a segunda rodada de 17/out · 13 a cena é um VÍDEO (Higgsfield,
       aprovado pelo Victor); a cena desenhada em código fica de reserva */
    t(r.video.tem&&r.video.classe&&r.video.desenho==='none','⟶⟶ a cena é o vídeo do carro na orla, e a cena desenhada sai de vista');
    t(r.video.mudo&&r.video.loop&&r.video.inline&&r.video.oculto==='true','o vídeo é mudo, em loop, toca no lugar (playsinline) e é enfeite para leitor de tela');
    t(r.video.arq,'e o vídeo é o arquivo do domínio, pedido só quando a tela abre');
    t(r.video.poster,'⟶⟶ o pôster (o mesmo quadro) é o FUNDO da cena por baixo do vídeo');
    /* O Chromium das suítes não toca H.264 — é a prova da saída de emergência */
    if(!r.video.h264) t(r.video.escondido,'⟶⟶ onde o H.264 não toca (este Chromium), o vídeo some e fica o quadro — a cena nunca fica vazia');
    t(r.carro,'a reserva desenhada continua montada, com o carro 3D da casa carregado');
    t(r.suporte==='none','no celular o botão de suporte não cobre a tela de entrar');

    /* --- 2. validação, e a senha que não fica --- */
    await p.locator('#lg-ok').click(); await p.waitForTimeout(120);
    const e1=await p.evaluate(()=>({txt:document.getElementById('lg-erro').textContent, vis:!document.getElementById('lg-erro').hidden,
      inv:document.getElementById('lg-email').getAttribute('aria-invalid'), tela:S.tab}));
    t(e1.vis&&/e-mail/i.test(e1.txt)&&e1.inv==='true'&&e1.tela==='entrar','vazio não entra: o aviso diz o que falta e marca o campo ("'+e1.txt+'")');
    await p.locator('#lg-email').fill('alguem@exemplo.com'); await p.locator('#lg-senha').fill('123');
    await p.locator('#lg-ok').click(); await p.waitForTimeout(120);
    const e2=await p.evaluate(()=>({txt:document.getElementById('lg-erro').textContent,tela:S.tab}));
    t(/6 caracteres/.test(e2.txt)&&e2.tela==='entrar','senha curta também não, e o aviso diz o tamanho ("'+e2.txt+'")');
    await p.locator('#lg-olho').click();
    t(await p.locator('#lg-senha').getAttribute('type')==='text'&&await p.locator('#lg-olho').getAttribute('aria-pressed')==='true',
      'o olho mostra a senha e diz que está mostrando');
    await p.locator('#lg-olho').click();
    /* (18/out · 7) Victor, no iPhone: "quando clica em mostrar senha, o ícone
       desce". O olho era centrado por translateY(-50%) e a pressão da casa
       (button:active) trocava o transform inteiro. Com o botão forçado em
       :active, o centro dele tem de continuar no centro do campo. */
    const olhoNoMeio=()=>p.evaluate(()=>{ const o=document.getElementById('lg-olho').getBoundingClientRect(), c=document.getElementById('lg-senha').getBoundingClientRect();
      return Math.abs((o.top+o.height/2)-(c.top+c.height/2)) });
    const cdpO=await p.context().newCDPSession(p); await cdpO.send('DOM.enable'); await cdpO.send('CSS.enable');
    const {root:rO}=await cdpO.send('DOM.getDocument',{depth:-1}); const {nodeId:nO}=await cdpO.send('DOM.querySelector',{nodeId:rO.nodeId,selector:'#lg-olho'});
    const dRepouso=await olhoNoMeio();
    await cdpO.send('CSS.forcePseudoState',{nodeId:nO,forcedPseudoClasses:['active']}); await p.waitForTimeout(200);
    const dAtivo=await olhoNoMeio();
    await cdpO.send('CSS.forcePseudoState',{nodeId:nO,forcedPseudoClasses:[]});
    t(dRepouso<1.5&&dAtivo<1.5,'⟶⟶ o olho fica no meio do campo, parado e apertado ('+dRepouso.toFixed(1)+' e '+dAtivo.toFixed(1)+'px do centro)');
    await p.locator('#lg-esqueci').click(); await p.waitForTimeout(80);
    t(/nenhuma senha fica guardada/i.test(await p.locator('#lg-erro').textContent()),
      '⟶⟶ "Esqueci a senha" diz a verdade da prévia em vez de fingir que mandou um e-mail');
    await p.locator('#lg-senha').fill('segredo-da-ana');
    await p.locator('#lg-ok').click(); await p.waitForTimeout(160);
    const d=await p.evaluate(()=>{ let tudo=''; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); tudo+=k+'='+localStorage.getItem(k)}
      for(let i=0;i<sessionStorage.length;i++){const k=sessionStorage.key(i); tudo+=k+'='+sessionStorage.getItem(k)}
      return {tela:S.tab, modo:MODO, guardou:/segredo-da-ana|alguem@exemplo/.test(tudo),
        campos:[document.getElementById('lg-email').value,document.getElementById('lg-senha').value],
        saida:document.querySelectorAll('.lgn-saida').length,
        saidaSemId:[...document.querySelectorAll('.lgn-saida [id]')].length,
        saidaToque:document.querySelector('.lgn-saida')?getComputedStyle(document.querySelector('.lgn-saida')).pointerEvents:'-'} });
    t(d.tela!=='entrar'&&d.modo==='freela','e-mail e senha válidos entram, no lado escolhido (foi para "'+d.tela+'")');
    t(!d.guardou,'⟶⟶ a senha e o e-mail NÃO foram parar no armazenamento do aparelho');
    t(d.campos.join('')==='','e os dois campos esvaziaram na hora');
    t(d.saida===1&&d.saidaSemId===0&&d.saidaToque==='none',
      'a partida do carro é uma cópia por cima, sem id nem toque — a entrada já aconteceu por baixo');
    await p.waitForTimeout(1000);
    t(await p.evaluate(()=>document.querySelectorAll('.lgn-saida').length)===0,'e a cópia some sozinha depois da partida');
    await ctx.close();
  }

  /* ================= 3. criar conta é um modo do mesmo cartão ================= */
  {
    /* "Criar conta" mora na barra da home do DESKTOP; no celular a porta é
       o link do próprio cartão ("Ainda não tem conta? Criar conta") */
    const {ctx,p}=await abrir(1280,800,{criar:true,entrou:true});
    const c=await p.evaluate(()=>({tit:document.getElementById('lg-tit').textContent, ok:document.getElementById('lg-ok-t').textContent,
      auto:document.getElementById('lg-senha').getAttribute('autocomplete'), esq:document.getElementById('lg-esqueci').hidden,
      volta:document.getElementById('lg-cad').textContent}));
    t(c.tit==='Crie sua conta.'&&c.ok==='Criar conta'&&c.volta==='Entrar','"Criar conta" da home abre o cartão no modo de criar');
    t(c.auto==='new-password'&&c.esq,'no modo de criar a senha é nova (o gerenciador sugere uma) e "Esqueci" some');
    await p.locator('[data-lgtipo="contratante"]').click();
    t(/de graça/.test(await p.locator('#lg-sub').textContent()),'do lado de quem contrata a frase diz que entrar não cobra (é o Carona)');
    await p.locator('[data-lgtipo="freela"]').click();
    await p.locator('#lg-email').fill('nova@exemplo.com'); await p.locator('#lg-senha').fill('senha-nova');
    await p.locator('#lg-ok').click(); await p.waitForTimeout(500);
    t(await p.evaluate(()=>S.tab)==='cadastro','⟶⟶ criar a conta leva ao perfil, mesmo num aparelho que já entrou antes');
    await p.evaluate(()=>show('entrar')); await p.waitForTimeout(200);
    t(await p.locator('#lg-tit').textContent()==='De volta à estrada.','e o cartão volta ao modo de entrar, saudando quem já passou pela porta');
    await ctx.close();
  }

  /* ================= 4. aparelho baixo, claro, desktop ================= */
  for(const [W,H,tema] of [[360,640,'light'],[390,664,'dark'],[1440,900,'dark'],[1280,720,'light'],[1470,870,'dark'],[1920,1080,'light'],[1100,760,'dark']]){
    const {ctx,p}=await abrir(W,H,{tema});
    const r=await p.evaluate(()=>{
      const ok=document.getElementById('lg-ok').getBoundingClientRect(), g=document.querySelector('#v-entrar [data-login="Google"]').getBoundingClientRect();
      const car=document.querySelector('#v-entrar .lgn-carro').getBoundingClientRect(), cx=document.getElementById('lg-cx').getBoundingClientRect();
      return {sh:document.documentElement.scrollHeight, ih:innerHeight, sw:document.documentElement.scrollWidth, iw:innerWidth,
        vis:ok.bottom<=innerHeight&&g.bottom<=innerHeight, claro:document.documentElement.classList.contains('app-light'),
        carroLivre:car.bottom<=cx.top+4||car.right<=cx.left+4,
        /* onde o carro do VÍDEO cai na tela: a caixa dele no quadro (medida
           no pôster: x 19–49%, y 43–78%) passada pelo object-fit:cover.
           (18/out · 5) a caixa do vídeo voltou a ser a cena inteira — a
           ampliação --k de 18/out · 3 saiu (ela empurrava o carro para a
           ponta esquerda) */
        carroVideo:(()=>{ const ce=document.querySelector('#v-entrar .lgn-cena'), cena=ce.getBoundingClientRect(), vd=document.getElementById('lg-video');
          const bx={left:cena.left, top:cena.top, width:cena.width, height:cena.height};
          const [px,py]=getComputedStyle(vd).objectPosition.split(' ').map(x=>parseFloat(x)/100);
          const W0=LOGIN_VIDEO.w, H0=LOGIN_VIDEO.h, k=Math.max(bx.width/W0,bx.height/H0), rw=W0*k, rh=H0*k;
          const ox=bx.left+(bx.width-rw)*px, oy=bx.top+(bx.height-rh)*py;
          const c={l:ox+.19*rw, r:ox+.49*rw, t:oy+.43*rh, b:oy+.78*rh};
          /* as torres da frente da ponte (pôster: x 1365–1425 de 1912, y 31–52%) */
          const tr={l:ox+1365/1912*rw, r:ox+1425/1912*rw, t:oy+.31*rh};
          const tese=ce.parentElement.querySelector('.lgn-tese'), tb=tese&&tese.offsetParent?tese.getBoundingClientRect():null;
          return {dentro:c.l>=cena.left-2&&c.r<=cena.right+2&&c.t>=cena.top-2, folga:Math.round(c.l-cena.left), largura:Math.round(cena.width),
            livre:c.b<=cx.top+6||c.r<=cx.left+6, semFrase:!tb||tb.bottom<=c.t+6||tb.right<=c.l+6,
            ponte:tr.l>=cena.left&&tr.r<=cx.left&&tr.t>=cena.top, torres:Math.round(tr.r), cartao:Math.round(cx.left)}; })(),
        tese:(()=>{const e=document.querySelector('#v-entrar .lgn-tese');return e&&e.offsetParent?e.innerText.replace(/\s+/g,' '):''})()};
    });
    t(r.sh<=r.ih+1&&r.sw<=r.iw&&r.vis,W+'×'+H+' ('+tema+'): cabe sem rolagem, com Entrar e Google à vista ('+r.sh+'/'+r.ih+')');
    t(r.claro===(tema==='light'),'e respeita o tema escolhido ('+(r.claro?'claro':'escuro')+')');
    t(r.carroLivre,'o cartão não cobre o carro da reserva desenhada');
    t(r.carroVideo.dentro&&r.carroVideo.livre,'⟶⟶ o recorte do vídeo mostra o carro inteiro e o cartão não o cobre');
    t(r.carroVideo.semFrase,'e a frase do desktop não encosta nele');
    /* (18/out · 5) MUDOU A REGRA, e é decisão do Victor. A de 18/out · 3
       ("a ponte aparece: as torres terminam antes do cartão") empurrou o
       carro para a ponta esquerda, e ele viu: "o carro tbm ta muito na
       ponta". Com o cartão compacto ele liberou o fundo — "veja o melhor
       lugar sem precisar pensar no bg" —, então quem manda no quadro volta
       a ser o carro: longe da borda, a pelo menos 10% da largura. */
    if(W>=821) t(r.carroVideo.folga>=.1*r.carroVideo.largura,'⟶⟶ '+W+'×'+H+': o carro fica longe da borda esquerda ('+r.carroVideo.folga+'px de '+r.carroVideo.largura+')');
    /* (18/out · 3) e sem rotulinho em cima da frase — "AGENDA E CONTRATAÇÃO
       DE EQUIPE AUDIOVISUAL" saiu, como saíram os do resto (17/out · 14) */
    if(W>=821) t(r.tese==='Olha o carro do freela passando.','no desktop a cena carrega SÓ a frase de onde o nome saiu, sem rótulo em cima: "'+r.tese+'"');
    await ctx.close();
  }

  /* ================= 4b. o cartão que abre com o cursor perto (18/out · 5) ================= */
  /* Victor, com o vídeo de referência: "quero que esteja menorzinho a área
     de login, e quando o mouse chegar perto ela expanda pra o que é hoje".
     Longe, o vidro encolhe até a pílula "Entrar"; perto, cresce e os campos
     entram. Os campos NUNCA saem do lugar nem do alcance — quem encolhe é o
     vidro, não o cartão. */
  for(const [W,H] of [[1440,900],[1920,1080]]){
    const {ctx,p}=await abrir(W,H);
    const est=()=>p.evaluate(()=>{ const cx=document.getElementById('lg-cx'), f=cx.querySelector('.lgn-fundo');
      const r=cx.getBoundingClientRect(), rf=f.getBoundingClientRect(), ab=cx.querySelector('.lgn-abre');
      const em=document.getElementById('lg-email');
      const tt=document.getElementById('lg-tit').getBoundingClientRect(), pl=ab.getBoundingClientRect();
      return {compacto:cx.classList.contains('compacto'), cx:{l:r.left,t:r.top,r:r.right,b:r.bottom,h:r.height}, fundo:rf.height,
        vt:rf.top-r.top, vb:rf.bottom, tit:tt.top-rf.top, pil:pl.bottom<=rf.bottom+1&&pl.top>=rf.top-1,
        pilula:+getComputedStyle(ab).opacity, campo:+getComputedStyle(em.parentElement).opacity,
        /* o campo continua no mesmo lugar, alcançável pelo ponto do meio */
        alcance:(()=>{ const e=em.getBoundingClientRect(); const x=document.elementFromPoint(e.left+e.width/2,e.top+e.height/2); return x===em||em.parentElement.contains(x) })() } });
    await p.mouse.move(24,H-24,{steps:4}); await p.waitForTimeout(900);
    const a=await est();
    t(a.compacto&&a.fundo<a.cx.h*.5,W+'×'+H+': ⟶⟶ com o cursor longe o vidro encolhe ('+Math.round(a.fundo)+' de '+Math.round(a.cx.h)+'px)');
    t(a.pilula>.95&&a.campo<.05,'e mostra a pílula "Entrar" no lugar da chave, com os campos escondidos');
    t(a.alcance,'⟶⟶ mas os campos continuam no lugar e alcançáveis (nada pula quando ele abre)');
    /* (18/out · 6) Victor: "a aba de login pode estar um pouco mais em baixo,
       e subir abrindo a caixa em motion". Compacto, o vidro desce (o centro
       dele perto do meio da janela) e leva o título e a pílula junto. */
    const meio=a.cx.t+a.vt+a.fundo/2;
    t(a.vt>=40&&meio>H*.36&&meio<H*.56,'⟶⟶ compacto, o vidro fica mais embaixo — o centro dele em '+Math.round((a.cx.t+a.vt+a.fundo/2)/H*100)+'% da altura (desce '+Math.round(a.vt)+'px)');
    t(a.tit>=0&&a.pil,'e o título e a pílula descem junto, dentro do vidro');
    await p.mouse.move(a.cx.l-60,a.cx.t+a.cx.h*.3,{steps:6}); await p.waitForTimeout(950);
    const b2=await est();
    t(!b2.compacto&&Math.abs(b2.fundo-b2.cx.h)<2&&Math.abs(b2.vt)<1&&b2.campo>.95,'⟶⟶ com o cursor perto ele sobe abrindo: o vidro volta ao topo do cartão, inteiro, e os campos entram');
    t(Math.abs(b2.tit-a.tit)<2,'o título sobe colado no vidro (a '+Math.round(a.tit)+'px do topo dele, aberto e fechado)');
    t(Math.abs(b2.cx.t-a.cx.t)<1&&Math.abs(b2.cx.h-a.cx.h)<1,'e o cartão não mudou de lugar nem de tamanho — só o vidro cresceu');
    await p.locator('#lg-email').fill('quem@exemplo.com');
    await p.mouse.move(24,H-24,{steps:4}); await p.waitForTimeout(1000);
    t(!(await est()).compacto,'⟶⟶ com texto num campo ele não fecha, mesmo com o cursor longe');
    await p.locator('#lg-email').fill(''); await p.evaluate(()=>document.activeElement&&document.activeElement.blur());
    await p.mouse.move(30,H-30,{steps:3}); await p.waitForTimeout(1000);
    t((await est()).compacto,'campo vazio e sem foco, o cursor longe: ele volta a encolher');
    await p.keyboard.press('Tab'); await p.waitForTimeout(80);
    for(let i=0;i<12&&!(await p.evaluate(()=>document.getElementById('lg-cx').contains(document.activeElement)));i++){ await p.keyboard.press('Tab'); await p.waitForTimeout(40) }
    await p.waitForTimeout(120);
    t(!(await est()).compacto,'pelo teclado o foco entra no cartão e ele abre');
    await ctx.close();
  }
  {
    /* sem cursor (celular) ele nasce aberto e nunca encolhe */
    const {ctx,p}=await abrir(390,844);
    t(await p.evaluate(()=>!document.getElementById('lg-cx').classList.contains('compacto')),'no celular o cartão nasce aberto — não há "chegar perto" no toque');
    await ctx.close();
  }

  /* ================= 5. movimento reduzido: a cena para ================= */
  {
    const {ctx,p}=await abrir(390,844,{reduz:true});
    const a=await p.evaluate(()=>['.lgn-faixa','.lgn-carimg','.lgn-carro','.lgn-postes','.lgn-cx','.lgn-ok'].map(q=>getComputedStyle(document.querySelector('#v-entrar '+q)).animationName));
    t(a.every(n=>n==='none'),'com `prefers-reduced-motion` nada da cena anda ('+a.join(',')+')');
    const rv=await p.evaluate(()=>{const vd=document.getElementById('lg-video');
      return {sem:!vd.getAttribute('src')&&vd.hidden, poster:/\/m\/login-poster[.@]/.test(document.querySelector('#v-entrar .lgn-cena').style.backgroundImage)}});
    t(rv.sem&&rv.poster,'⟶⟶ e o vídeo nem nasce: fica o quadro parado');
    await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(200);
    t(await p.evaluate(()=>document.querySelectorAll('.lgn-saida').length)===0&&await p.evaluate(()=>S.tab)!=='entrar',
      'e o Google entra sem a partida por cima');
    await ctx.close();
  }

  t(semVideoAntes.every(Boolean),'⟶⟶ o vídeo só nasce quando a tela de entrar abre — a home não paga o peso dele');
  t(errs.length===0,'zero erro de console/página'+(errs.length?' — '+errs[0]:''));
  console.log('ENTRAR');
  ok.forEach(x=>console.log('  ✓ '+x));
  bad.forEach(x=>console.log('  ✗ '+x));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();
