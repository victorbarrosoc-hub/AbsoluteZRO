/* HOME CLARA — o topo que diz o que o produto é (17/out).
 *
 * Victor, sobre a home de 04/out: "não dá pra entender nada, no mobile tá
 * confuso e a imagem de fundo não condiz com o que quero pra plataforma.
 * Pense no mobile também." Os três defeitos, e o que esta suíte guarda:
 *   1. NÃO DAVA PRA ENTENDER: a manchete pedia que a pessoa já soubesse o
 *      que era a casa. Agora o olho diz a categoria, a manchete diz o que
 *      se faz aqui, e os dois botões dizem para quem — e cada um abre o
 *      login já na aba do lado certo.
 *   2. A IMAGEM DE FUNDO: saiu. O topo mostra a própria busca — o dia, as
 *      funções e quem está livre, com rosto —, e ela funciona sem conta.
 *      Os números saem da mesma status() de dentro da plataforma.
 *   3. O CELULAR: a home tinha 16 telas de rolagem. Manchete, os dois
 *      botões e o começo da busca cabem na primeira; a página inteira
 *      cabe em menos de dez, sem rolagem de lado.
 *
 * (17/out · 2) Victor: "informação demais… olha a ElevenLabs, a Apple".
 * A home virou vitrine em blocos — título curto, uma linha, um visual
 * vivo — e os depoimentos fictícios saíram. A régua apertou: menos de
 * nove telas no celular, e um teto de palavras na página inteira.
 *
 * (17/out · 3) Victor escolheu a proposta C: claro, objetos 3D, pastel,
 * botão de tinta — "a plataforma inteira pode ser nesse estilo". A busca
 * saiu de ao lado do texto e foi para LOGO EMBAIXO do topo, na largura
 * inteira, como na referência; a régua do primeiro quadro continua (no
 * desktop ela começa na primeira tela). E o que a referência trazia e não
 * podia entrar fica cobrado aqui: estrela, "+8 mil", "mais escolhido",
 * "profissionais verificados".
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const PRE=pg=>pg.addInitScript(()=>{ try{
  localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-entrou','1');
  localStorage.setItem('cdf-guia','1'); localStorage.removeItem('cdf-uso');
}catch(e){}
  /* (18/out) quem dá play em quê, e se o véu da abertura já tinha saído */
  window.__plays=[]; const tocar=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){ window.__plays.push({id:this.id,abriu:!!document.body&&document.body.classList.contains('abriu')}); return tocar.apply(this,arguments) };
});

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const errs=[];
  const abrir=async(W,H,mob)=>{
    const ctx=await b.newContext({viewport:{width:W,height:H},isMobile:!!mob});
    const p=await ctx.newPage(); await PRE(p);
    p.on('pageerror',e=>errs.push('ERR: '+e.message));
    await p.goto(URL,{waitUntil:'networkidle'});
    await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:20000}).catch(()=>{});
    await p.waitForTimeout(250);
    return {ctx,p};
  };
  /* o que a prévia mostra, conferido contra a base — não contra ela mesma */
  const ler=p=>p.evaluate(()=>{
    const linhas=[...document.querySelectorAll('#hj-lista li:not(.vazio)')].map(li=>{
      const nome=li.querySelector('b').textContent;
      const c=CREW.find(x=>titulo(x.nome)===nome);
      return {nome, achou:!!c, livre:!!c&&status(c,hjDia)==='livre', func:c?c.func:[],
        rosto:/data:image\//.test(li.querySelector('.av').style.backgroundImage),
        st:li.querySelector('.st').textContent.trim()};
    });
    const esperado=CREW.filter(c=>!c.me&&c.foto&&!(c.principal||[]).includes('Perfil incompleto')&&status(c,hjDia)==='livre'
      &&(!hjEscala.length||c.func.some(f=>hjEscala.includes(f)))).length;
    return {linhas, esperado, dia:hjDia,
      n:+(document.querySelector('#hj-linha b')||{}).textContent,
      linha:document.getElementById('hj-linha').textContent,
      ver:document.getElementById('hj-ver').textContent,
      dias:document.querySelectorAll('#hj-dias .hp-dia').length,
      chips:[...document.querySelectorAll('#hj-chips .hj-chip')].map(x=>x.dataset.hjf)};
  });

  /* ================= 1. o topo diz o que é ================= */
  {
    const {ctx,p}=await abrir(1440,900);
    const r=await p.evaluate(()=>({
      /* desde 17/out · 14 o topo começa NA manchete: o olho em caixa alta
         ("Agenda e contratação · audiovisual") saiu a pedido do Victor —
         "isso é muito cara de IA". O que ele dizia, a manchete já diz. */
      olho:!!document.querySelector('.hp-olho'),
      primeiro:(()=>{ const tx=document.querySelector('.hp-texto'); const f=tx&&tx.firstElementChild; return f?f.id||f.tagName:'' })(),
      h1:v('hh-t').textContent,
      ctas:[...document.querySelectorAll('.hprod .hcta .btn')].map(x=>x.textContent.trim()+'|'+x.dataset.lg),
      /* (17/out · 15) Victor: "a homepage também precisa ficar à altura da
         área de login". O topo deixou de ser o objeto 3D solto e virou a
         CENA do carro da casa (HOME_VIDEO: a cidade vista de cima, o carro
         passando, os alfinetes acendendo). O que continua proibido é a foto
         de set que ele recusou em 17/out: nenhuma imagem de FOTOS nem das
         fotos de cabeçalho no topo. */
      foto:[...document.querySelectorAll('#v-home .hero img')].length>0||
        [...Object.values(FOTOS.capas||{}),...Object.values(HERO_ARTE)].some(u=>(v('hp-cena').style.backgroundImage||'').includes(u)),
      /* (18/out) a CARONA trouxe dois quadros parados: o da cidade vista de
         cima (poster, onde a abertura começa) e o do banco do carona
         (parado, onde a cena descansa). Os dois são a cena da casa. */
      arte:!!HOME_VIDEO.poster&&[HOME_VIDEO.poster,HOME_VIDEO.parado].some(q=>q&&(v('hp-cena').style.backgroundImage||'').includes(q)),
      busca:(()=>{ const a=document.querySelector('.hp-texto').getBoundingClientRect(),
        c=document.getElementById('h-jogo').getBoundingClientRect(),
        w=document.querySelector('.hp-jogo-w .wrap').getBoundingClientRect();
        return {abaixo:c.top>=a.bottom-1, topo:c.top, largura:c.width/(w.width-44)} })(),
      tela:(()=>{ const h=document.querySelector('#v-home .hero.hprod').getBoundingClientRect(),
        q=document.getElementById('hp-busca'), qb=q&&!q.hidden?q.getBoundingClientRect():null;
        /* quem, entre a cena e o .hero, cria contexto de empilhamento — o
           que recortava a cena no Safari (18/out · 6) */
        const pai=x=>x.parentElement, cria=x=>{ const c=getComputedStyle(x), fx=/flex|grid/.test(getComputedStyle(pai(x)).display);
          return (c.zIndex!=='auto'&&(c.position!=='static'||fx))||+c.opacity<1||c.transform!=='none'||c.filter!=='none'
            ||(c.backdropFilter||c.webkitBackdropFilter||'none')!=='none'||c.isolation==='isolate'||c.mixBlendMode!=='normal'
            ||/transform|opacity|filter/.test(c.willChange)||/paint|layout|strict|content/.test(c.contain)
            ||(c.maskImage||c.webkitMaskImage||'none')!=='none'||c.clipPath!=='none'||c.perspective!=='none' };
        const arte=document.querySelector('#v-home .hp-arte'), hero=document.querySelector('#v-home .hero.hprod'), ctxs=[];
        for(let x=pai(arte);x&&x!==hero;x=pai(x)) if(cria(x)) ctxs.push(x.className||x.tagName);
        const cn=document.getElementById('hp-cena').getBoundingClientRect();
        return {topo:h.top, fim:h.bottom, alto:innerHeight, ctxs,
          cena:{t:cn.top-h.top, b:h.bottom-cn.bottom, l:cn.left-h.left, r:h.right-cn.right},
          busca:qb?{topo:qb.top, fim:qb.bottom, larg:qb.width}:null,
          jogo:document.getElementById('h-jogo').getBoundingClientRect().top} })()
    }));
    t(!r.olho&&(r.primeiro==='hh-t'||r.primeiro==='H1'),'⟶⟶ sem rotulinho em cima: o topo abre na manchete ('+r.primeiro+')');
    t(/audiovisual/i.test(r.h1)&&/livre/i.test(r.h1),'e a manchete diz o que se faz aqui: "'+r.h1+'"');
    t(r.ctas.join()==='Quero contratar|contratante,Sou freela|freela','⟶⟶ dois botões, um por lado: '+r.ctas.join(' · '));
    t(!r.foto,'sem foto de set no topo — nem capa de ofício, nem foto de cabeçalho');
    t(r.arte,'⟶⟶ o topo é a cena do carro da casa (HOME_VIDEO), no mesmo nível da tela de entrar');
    /* a cena em movimento segue as regras do vídeo do login: mudo, em laço,
       sem tela cheia no iPhone, Blob só com a home à vista, e pausa ao sair.
       Este Chromium não toca H.264: o vídeo some e fica o quadro — que é a
       saída de emergência de verdade (iPhone em economia de bateria). */
    const vd=await p.evaluate(()=>{ const x=v('hp-video'); return {mudo:x.muted,laco:x.loop,inline:x.playsInline,
      src:x.getAttribute('src')||'', tem:!!HOME_VIDEO.mp4, fundo:!!v('hp-cena').style.backgroundImage,
      videos:v('hp-cena').querySelectorAll('video').length, intro:'intro' in HOME_VIDEO||!!document.getElementById('hp-intro'),
      cenas:HOME_VIDEO.cenas||[], seg:+HOME_VIDEO.seg||0,
      vis:!x.hidden, parado:!!HOME_VIDEO.parado&&(v('hp-cena').style.backgroundImage||'').includes(HOME_VIDEO.parado),
      plays:window.__plays.filter(q=>q.id==='hp-video')} });
    t(vd.tem&&vd.mudo&&vd.laco&&vd.inline,'a cena tem vídeo, mudo, em laço e sem tela cheia no iPhone');
    /* (18/out · 2) o vídeo é ARQUIVO do domínio (m/), não base64 dentro do
       HTML — era isso que o deixava em baixa no computador */
    t(/\/m\/home-laco[.@]/.test(vd.src)&&vd.fundo,'o vídeo é o arquivo do domínio, e o quadro fica por baixo como fundo');
    /* (18/out · 3) MUDOU A REGRA, e é decisão do Victor: "não pode repetir
       cena, usa as cenas com uma narrativa de ordem e depois volta pra cena
       inicial". Até a 18/out · 2 eram dois <video> — a abertura, uma vez, e o
       laço — e o laço mostrava o carro de trás duas vezes por volta. Agora é
       UM arquivo em ciclo, cada cena uma vez; e sem a passagem de um vídeo
       para o outro, que era onde o Safari congelava. As asserções da abertura
       separada saíram junto com ela. */
    t(vd.videos===1&&!vd.intro,'⟶⟶ a carona é UM vídeo só, em ciclo — sem abertura separada nem passagem entre dois vídeos');
    t(vd.cenas.length>=4&&new Set(vd.cenas).size===vd.cenas.length,'⟶⟶ e cada cena entra UMA vez por volta: '+vd.cenas.join(' → ')+' → (de volta ao começo)');
    t(vd.seg>12&&vd.seg<20,'o ciclo inteiro dura '+vd.seg.toFixed(1)+'s');
    t(vd.plays.length>0&&vd.plays.every(q=>q.abriu),'⟶⟶ a carona não dá a partida embaixo do véu da abertura do site ('+vd.plays.map(q=>q.id+(q.abriu?'':'·cedo')).join(', ')+')');
    /* ⚠️ (25/out) A ASSERÇÃO ANTIGA ADIVINHAVA O NAVEGADOR: "este Chromium
       não toca H.264", então o vídeo tinha de falhar. O Chromium do
       Playwright novo (e o do CI) TOCA H.264 — o produto fez o certo e a
       suíte reprovava. Agora são duas conferências, e nenhuma depende de
       qual Chromium roda:
       1. o que ACONTECEU de verdade: se o vídeo está à vista, ele tem de
          estar tocando (o tempo anda); se não está, a cena tem de estar no
          quadro do banco do carona;
       2. a saída de emergência é PROVOCADA, sempre: o vídeo falha (o que um
          navegador sem o codec dispara) e o play é recusado (iPhone em
          economia de bateria) — nos dois a cena descansa no quadro parado. */
    const real=await p.evaluate(async()=>{ const x=v('hp-video'), t0=x.currentTime;
      await new Promise(r=>setTimeout(r,900));
      return {vis:!x.hidden, andou:x.currentTime>t0, pausado:x.paused,
        parado:!!HOME_VIDEO.parado&&(v('hp-cena').style.backgroundImage||'').includes(HOME_VIDEO.parado)} });
    if(real.vis) t(real.andou&&!real.pausado,'⟶⟶ este Chromium toca H.264: a carona está à vista e TOCANDO (o tempo anda)');
    else t(real.parado,'⟶⟶ este Chromium não toca o vídeo: a cena descansa no quadro do banco do carona');
    const emergencia=await p.evaluate(async()=>{
      const x=v('hp-video'), cena=v('hp-cena'), noParado=()=>(cena.style.backgroundImage||'').includes(HOME_VIDEO.parado);
      x.dispatchEvent(new Event('error'));
      const erro={vis:!x.hidden, parado:noParado()};
      /* de novo à vista, e agora o play é recusado */
      cena.style.backgroundImage=''; x.hidden=false;
      x.play=()=>Promise.reject(new DOMException('recusado','NotAllowedError'));
      ligarVideoHome(); await new Promise(r=>setTimeout(r,50));
      const recusa={vis:!x.hidden, parado:noParado()};
      delete x.play;
      return {erro, recusa};
    });
    t(!emergencia.erro.vis&&emergencia.erro.parado,'⟶⟶ quando o vídeo falha (navegador sem o codec), ele some e a cena descansa no quadro do banco do carona');
    t(!emergencia.recusa.vis&&emergencia.recusa.parado,'⟶⟶ quando o play é recusado (economia de bateria), a mesma saída: quadro parado, sem vídeo à vista');
    const pausa=await p.evaluate(()=>{ show('entrar'); const r=v('hp-video').paused; show('home'); return r });
    t(pausa,'sair da home pausa a cena');
    t(r.busca.abaixo&&r.busca.largura>.98,'a busca fica logo embaixo do topo, na largura inteira do conteúdo');
    /* (18/out · 4) MUDOU A REGRA, e é pedido do Victor, com a home da
       Artlist de referência: "que o site desktop preencha as páginas como na
       referência … identifique o tamanho da tela e se adeque a ela". A
       primeira tela do computador passou a ser a CENA inteira, de borda a
       borda, com a manchete embaixo — e a prévia da busca (#h-jogo) começa
       onde a cena termina. O que garantia "a busca na primeira tela" agora
       é a busca do próprio topo (#hp-busca: praça, função, data), que tem
       de caber inteira dentro dela. */
    const tl=r.tela;
    t(tl.topo<=1&&tl.fim>=tl.alto-2,'⟶⟶ no desktop a cena ocupa a primeira tela inteira ('+Math.round(tl.topo)+'→'+Math.round(tl.fim)+' de '+tl.alto+'px)');
    /* (18/out · 6) No Safari a cena saía recortada na caixa do texto: o topo
       da tela preto e o vídeo só atrás da manchete e dos botões. A .wrap do
       texto era item de flex com z-index:1 — contexto de empilhamento — e a
       cena (z-index:-1) morava dentro dela; com o vídeo numa camada composta,
       o Safari recortava tudo naquela caixa. Este Chromium não recorta (e não
       toca H.264), então a guarda é sobre o MECANISMO: a cena tem o tamanho
       do .hero e nenhum ancestral entre os dois cria contexto próprio. */
    t(Math.max(Math.abs(tl.cena.t),Math.abs(tl.cena.b),Math.abs(tl.cena.l),Math.abs(tl.cena.r))<=1,'⟶⟶ a cena tem o tamanho do topo inteiro ('+JSON.stringify(tl.cena)+')');
    t(tl.ctxs.length===0,'⟶⟶ nenhum contexto de empilhamento entre a cena e o topo — o que a recortava no Safari ('+(tl.ctxs.join(' · ')||'nenhum')+')');
    /* (18/out · 7) e na VOLTA: o Victor entrou na conta, voltou pela logo e a
       cena encolheu de novo — a animação de entrada de tela (.entra, com
       transform) caía na caixa do texto do topo. Isto reproduzia aqui também. */
    const volta=await p.evaluate(async()=>{ show('planos'); await new Promise(r=>setTimeout(r,80)); show('home');
      await new Promise(r=>setTimeout(r,700));
      const h=document.querySelector('#v-home .hero.hprod').getBoundingClientRect(), c=document.getElementById('hp-cena').getBoundingClientRect(),
        w=document.querySelector('#v-home .hprod>.wrap:first-child'), cs=getComputedStyle(w);
      return {d:Math.max(Math.abs(c.top-h.top),Math.abs(c.bottom-h.bottom)), tr:cs.transform, an:cs.animationName} });
    t(volta.d<=1&&volta.tr==='none','⟶⟶ voltando de outra tela, a cena continua do tamanho do topo (desvio '+Math.round(volta.d)+'px, transform da caixa: '+volta.tr+', animação: '+volta.an+')');
    t(tl.busca&&tl.busca.topo>=0&&tl.busca.fim<=tl.alto&&tl.busca.larg>=480,'⟶⟶ e a busca do topo cabe inteira nela ('+(tl.busca?Math.round(tl.busca.topo)+'→'+Math.round(tl.busca.fim):'sem busca')+')');
    t(tl.jogo>=tl.fim-1,'a prévia da busca começa onde a cena termina ('+Math.round(tl.jogo)+' ≥ '+Math.round(tl.fim)+')');
    /* (18/out · 5) Victor: "os planos na homepage, podem ficar só 3 com o
       toggle de mudar a categoria do usuário". O computador passa a fazer o
       que o celular faz desde 17/out · 9: a chave mostra um lado por vez. */
    const pd=await p.evaluate(()=>({chave:!!document.querySelector('#hp-pl-lado')&&document.querySelector('#hp-pl-lado').offsetParent!==null,
      vis:[...document.querySelectorAll('#h-planos .plano')].filter(x=>x.offsetParent!==null).map(x=>x.dataset.plano)}));
    t(pd.chave&&pd.vis.join()==='base,premium,estrada','⟶⟶ no desktop os planos são três de cada vez, com a chave (abre no do freela): '+pd.vis.join(' · '));
    await p.locator('#hp-pl-lado [data-pllado="contratante"]').click(); await p.waitForTimeout(200);
    const pd2=await p.evaluate(()=>[...document.querySelectorAll('#h-planos .plano')].filter(x=>x.offsetParent!==null).map(x=>x.dataset.plano));
    t(pd2.join()==='carona,volante,frota','e "Quero contratar" troca para os três de quem contrata: '+pd2.join(' · '));
    await p.locator('#hp-pl-lado [data-pllado="freela"]').click();

    /* ================= 1c. a C, e o que dela NÃO entrou ================= */
    {
      const c=await p.evaluate(()=>{
        const home=v('v-home'), txt=home.innerText;
        const pri=document.querySelector('.hprod .hcta .btn:not(.gh)');
        const objs=[...home.querySelectorAll('img.bn-obj')].filter(x=>x.offsetParent);
        const hoje=CREW.filter(c=>hjMostravel(c)&&status(c,0)==='livre').length;
        return {claro:document.documentElement.classList.contains('app-light'),
          tinta:getComputedStyle(pri).backgroundColor,
          acao:getComputedStyle(document.documentElement).getPropertyValue('--ciano').trim(),
          hl:(document.querySelector('#hh-t .hl')||{}).textContent,
          objs:objs.length, objsOk:objs.every(i=>/\/m\/obj-[a-z]+(@hd)?\.\w+\.webp$/.test(i.src)&&i.naturalWidth>0),
          blocosComObj:[...home.querySelectorAll('#h-rec .bn-t')].filter(x=>x.offsetParent&&x.id!=='h-moeda').every(b=>b.querySelector('img.bn-obj')),
          prova:v('hp-prova').innerText, hoje,
          rostosProva:[...document.querySelectorAll('#hp-prova .avs i')].filter(i=>/data:image\//.test(i.style.backgroundImage)).length,
          mentira:(txt.match(/★|☆|\d,\d\s*\(\d+\)|mil profissionais|mais escolhido|profissionais verificados|sem mensalidade/gi)||[]),
          praca:[...document.querySelectorAll('#h-praca .pc-it b')].map(b=>b.textContent),
          guildaFase:(document.querySelector('#h-praca .pc-it b')&&[...document.querySelectorAll('#h-praca li')].find(li=>/Guildas/.test(li.textContent)).dataset.fase),
          capas:[...document.querySelectorAll('#h-praca [data-capa]')].every(i=>/\/m\/(capa|heroi)-/.test(i.style.backgroundImage)),
          entrarTopo:document.querySelectorAll('.homenav .entrar-cta').length};
      });
      /* ⚠️ MUDOU EM 17/out · 13, por decisão do Victor: "o tema principal
         da plataforma tem que ser o dark, esse é o padrão. O light é
         opção." Até ali a asserção exigia o claro como padrão (17/out · 3).
         O claro continua inteiro — com o botão de tinta da C —, só deixou
         de ser o que abre sem escolha. */
      t(!c.claro,'⟶⟶ o tema ESCURO é o padrão: quem nunca escolheu abre no escuro');
      const hex2rgb=h=>{const m=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);return m?'rgb('+parseInt(m[1],16)+', '+parseInt(m[2],16)+', '+parseInt(m[3],16)+')':h};
      t(c.tinta===hex2rgb(c.acao),'e no escuro o botão principal é o ciano de ação: '+c.tinta);
      {
        /* lê o TOKEN, não a cor pintada: o botão tem transição de fundo e,
           medido no quadro seguinte à troca de tema, ainda está no meio dela */
        const tintaClaro=await p.evaluate(()=>{ document.documentElement.classList.add('app-light');
          const b=getComputedStyle(document.documentElement).getPropertyValue('--btn-bg').trim();
          document.documentElement.classList.remove('app-light'); return b });
        t(tintaClaro.toUpperCase()==='#1B1815','o claro continua opção, com o botão de tinta da C: '+tintaClaro);
      }
      t(c.hl==='livre na sua data.','a manchete destaca o que se acha aqui: "'+c.hl+'"');
      t(c.objs>=6&&c.objsOk,'⟶⟶ os objetos 3D vêm do próprio domínio e carregam: '+c.objs+' na página');
      t(c.blocosComObj,'todo bloco do bento (fora a moeda, que gira em 3D própria) tem o seu objeto');
      t(new RegExp('^'+c.hoje+' livres hoje').test(c.prova)&&!/demonstra/.test(c.prova)&&c.rostosProva===5,
        '⟶⟶ a prova do topo sai da mesma status(): "'+c.prova.replace(/\n/g,' · ')+'"');
      t(!c.mentira.length,'⟶⟶ nada de estrela, "+mil", "mais escolhido" ou "verificados" da referência'+(c.mentira.length?' — '+c.mentira.join(' | '):''));
      t(c.praca.join()==='Feed do set,Guildas,Coletivos'&&c.guildaFase==='4','a praça só lista o que existe, e as guildas só a partir da Fase 4');
      t(c.capas,'com as capas de ofício do próprio domínio (sem rosto, sem marca)');
      t(c.entrarTopo===1,'o topo tem UM "Entrar" de classe entrar-cta — "Criar conta" é outro botão');
      await p.locator('#hn-criar').click(); await p.waitForTimeout(250);
      t(await p.locator('#v-entrar').isVisible(),'"Criar conta" abre a porta de entrada');
      await p.locator('#lg-back').click(); await p.waitForTimeout(250);
    }

    /* ================= 1b. vitrine, não manual (17/out · 2) ================= */
  {
    const r=await p.evaluate(()=>{
      const home=v('v-home');
      const pal=home.innerText.split(/\s+/).filter(Boolean).length;
      /* parágrafo da home: nenhum passa de 20 palavras — explicação mora
         na Ajuda e dentro do produto */
      const longos=[...home.querySelectorAll('p')].filter(x=>x.offsetParent&&x.innerText.split(/\s+/).length>20)
        .map(x=>x.innerText.slice(0,40));
      const blocos=[...home.querySelectorAll('.bn-t')].filter(x=>x.offsetParent);
      /* o objeto 3D é enfeite; o VISUAL VIVO (dado derivado) continua exigido */
      const comVisual=blocos.filter(b=>b.querySelector('.vis-carro,.vis-custo,.vis-semana,.vis-sinal,.vis-direto,.vis-fotos,canvas'));
      return {pal, longos, blocos:blocos.length, comVisual:comVisual.length,
        semDepo:!document.getElementById('h-depo'),
        /* (18/out · 2) as FOTOS de categoria (img[data-cat]); o objeto 3D do
           bloco (img.bn-obj) é conferido com os outros objetos, acima */
        fotos:(()=>{ const f=[...home.querySelectorAll('#hb-brecho img[data-cat]')]; return f.length===3&&f.every(i=>/\/m\/brecho-/.test(i.src)&&i.naturalWidth>0) })()};
    });
    t(r.pal<700,'⟶⟶ a home inteira tem menos de 700 palavras: '+r.pal+' (eram 1.290)');
    t(!r.longos.length,'nenhum parágrafo da home passa de 20 palavras'+(r.longos.length?' — '+r.longos.join(' | '):''));
    t(r.blocos>=6&&r.comVisual===r.blocos,'cada recurso é um bloco com visual próprio: '+r.comVisual+' de '+r.blocos);
    t(r.semDepo,'os depoimentos fictícios saíram da vitrine');
    t(r.fotos,'o bloco do brechó usa as fotos de categoria do domínio');
  }

  /* ================= 2. a busca sem conta ================= */
    let q=await ler(p);
    t(q.dias===7&&q.chips.length===6,'a prévia tem a semana (7 dias) e seis funções');
    t(q.chips[0]==='Op. de câmera','e começa pela função que mais se procura');
    t(q.linhas.length===4&&q.linhas.every(x=>x.achou&&x.rosto&&x.st==='livre'),
      '⟶⟶ quatro pessoas, com rosto e marcadas "livre"');
    t(q.linhas.every(x=>x.livre),'⟶⟶ e todas estão livres de verdade no dia (mesma status() de dentro)');
    t(q.n===q.esperado&&q.n>4,'a contagem bate com a base: '+q.n+' livres hoje');
    t(new RegExp('\\b'+q.n+'\\b').test(q.ver),'e o botão leva o mesmo número: "'+q.ver+'"');
    t(new Set(q.linhas.map(x=>x.func[0])).size>1||q.linhas.length<2,'sem filtro, a lista mistura funções');

    await p.locator('#hj-dias [data-hjd="3"]').click(); await p.waitForTimeout(150);
    const q3=await ler(p);
    t(q3.dia===3&&await p.locator('#hj-dias [data-hjd="3"]').getAttribute('aria-pressed')==='true',
      'tocar num dia troca o dia');
    t(q3.linhas.every(x=>x.livre)&&q3.n===q3.esperado,'⟶⟶ e a lista e a contagem passam a ser as desse dia: '+q3.linhas.length+' de '+q3.n);
    t(!/^Hoje/.test(q3.linha),'a linha diz o dia escolhido: "'+q3.linha+'"');

    await p.locator('#hj-chips [data-hjf="Op. de drone"]').click(); await p.waitForTimeout(150);
    const qd=await ler(p);
    t(qd.linhas.length>0&&qd.linhas.every(x=>x.livre&&x.func.includes('Op. de drone')),
      '⟶⟶ filtrar por drone deixa só quem faz drone e está livre');
    t(qd.n===qd.esperado&&qd.n<=q3.n,'e a contagem cai junto: '+q3.n+' → '+qd.n);
    t(/Op\. de drone/.test(qd.linha),'a linha diz o filtro');
    await p.locator('#hj-chips [data-hjf="Op. de drone"]').click(); await p.waitForTimeout(150);
    t((await ler(p)).n===q3.n,'tocar de novo tira o filtro');

    /* (17/out · 5) A PRÉVIA SE DECLARA NUM LUGAR SÓ. Victor: "tira as mensagens
     de protótipo". O banner desta tela saiu; quem diz o que é ilustrativo é o
     selo "Prévia" ao lado da marca — e é ele que esta asserção cobra. */
    t(await p.locator('#h-jogo .hp-nota').count()===0&&await p.locator('.homenav [data-previa]').isVisible(),
      '⟶⟶ o cartão não repete aviso — a prévia está dita no selo da barra');
    const dentro=await p.locator('#h-jogo').textContent();
    t(!/R\$|\(\d{2}\)|@/.test(dentro),'sem diária, telefone ou perfil de rede na prévia — isso fica do lado de dentro');

    /* ================= 3. cada botão abre o lado certo ================= */
    await p.locator('.hprod .hcta [data-lg="freela"]').click(); await p.waitForTimeout(250);
    t(await p.locator('#v-entrar').isVisible(),'"Sou freela" abre o login');
    t(await p.locator('[data-lgtipo="freela"]').getAttribute('aria-selected')==='true','⟶⟶ já na aba do freela');
    await p.locator('#lg-back').click(); await p.waitForTimeout(250);
    await p.locator('.hprod .hcta [data-lg="contratante"]').click(); await p.waitForTimeout(250);
    t(await p.locator('[data-lgtipo="contratante"]').getAttribute('aria-selected')==='true','⟶⟶ "Quero contratar" abre na aba do contratante');
    await p.locator('#lg-back').click(); await p.waitForTimeout(250);
    await p.locator('[data-lgtipo]').first().evaluate(()=>{ LG_TIPO='freela'; pintarLogin() });
    await p.locator('#hj-ver').click(); await p.waitForTimeout(250);
    t(await p.locator('[data-lgtipo="contratante"]').getAttribute('aria-selected')==='true','e "chamar" na prévia também é do lado de quem contrata');
    await p.locator('#lg-back').click(); await p.waitForTimeout(250);
    await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(250);
    t(await p.locator('#v-entrar').isVisible(),'o "Entrar" do topo continua neutro e funcionando');
    await ctx.close();
  }

  /* ================= 4. o celular ================= */
  for(const [W,H] of [[390,844],[360,740]]){
    const {ctx,p}=await abrir(W,H,true);
    const r=await p.evaluate(H=>{
      const bx=s=>document.querySelector(s).getBoundingClientRect();
      const ctas=[...document.querySelectorAll('.hprod .hcta .btn')].map(x=>x.getBoundingClientRect());
      return {h1:bx('#hh-t').bottom, ctas:Math.max(...ctas.map(c=>c.bottom)),
        lado:ctas.length===2&&Math.abs(ctas[0].top-ctas[1].top)<2,
        card:bx('#h-jogo').top, dias:bx('#hj-dias').bottom,
        diasCabem:[...document.querySelectorAll('#hj-dias .hp-dia')].every(d=>{const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),
        altura:document.documentElement.scrollHeight,
        ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};
    },H);
    t(r.h1<H&&r.ctas<H,'⟶⟶ '+W+'px: a manchete e os dois botões cabem na primeira tela');
    t(r.lado,W+'px: os dois botões lado a lado, mesmo peso de leitura');
    t(r.card<H,W+'px: e a busca começa ainda na primeira tela (topo em '+Math.round(r.card)+'px)');
    t(r.diasCabem,W+'px: os sete dias cabem sem rolar de lado');
    t(r.ov<=1,W+'px: sem rolagem horizontal na página ('+r.ov+')');
    if(W===390) t(r.altura<9*H,'⟶⟶ a home inteira cabe em menos de nove telas: '+(r.altura/H).toFixed(1)+' (eram 16)');
    if(W===390){
      /* planos viram trilho de lado, e nada some no caminho.
         17/out · 9, decisão do Victor: "pode ter um toggle ou botão pra
         mudar, em vez de ficar os 6 planos aparecendo de uma vez". O
         celular mostra UM trilho por vez, escolhido pela chave; os seis
         continuam no documento e o trilho à vista continua de arrastar. */
      const pl=await p.evaluate(()=>{
        const tr=[...document.querySelectorAll('#h-planos .pl-trilho')];
        const vis=tr.filter(x=>x.offsetParent!==null);
        return {trilhos:tr.length, visiveis:vis.length, lado:vis[0]&&vis[0].dataset.lado,
          rola:vis.every(x=>x.scrollWidth>x.clientWidth+40),
          chave:!!document.querySelector('#hp-pl-lado')&&document.querySelector('#hp-pl-lado').offsetParent!==null,
          seis:document.querySelectorAll('#h-planos .plano').length};
      });
      t(pl.trilhos===2&&pl.seis===6,'no celular os seis planos continuam no documento, em dois trilhos');
      t(pl.chave&&pl.visiveis===1&&pl.lado==='freela'&&pl.rola,
        '⟶⟶ e a chave mostra UM lado por vez (abre no do freela), num trilho de arrastar');
      await p.locator('#hp-pl-lado [data-pllado="contratante"]').click(); await p.waitForTimeout(250);
      const pl2=await p.evaluate(()=>[...document.querySelectorAll('#h-planos .pl-trilho')]
        .filter(x=>x.offsetParent!==null).map(x=>x.dataset.lado));
      t(pl2.length===1&&pl2[0]==='contratante','"Quero contratar" troca para os planos de quem contrata');
      /* Passe o carro: o carro não cobre a frase (o defeito do aparelho do
         Victor era a regra da chegada perdendo para a da partida) */
      await p.evaluate(()=>document.getElementById('hb-carro').scrollIntoView({block:'center'}));
      await p.waitForTimeout(1600);
      const cobre=await p.evaluate(()=>{
        const c=document.querySelector('#hb-carro .bn-obj').getBoundingClientRect();
        return [...document.querySelectorAll('#hb-carro h3, #hb-carro .bn-tx p, #hb-carro .vc-p')].some(e=>{
          const r=e.getBoundingClientRect(); return !(r.right<=c.left||r.left>=c.right||r.bottom<=c.top||r.top>=c.bottom) });
      });
      t(!cobre,'⟶⟶ no "Passe o carro" o carro não cobre o título, a frase nem as pílulas');
      /* o fim da página: sem a frase do grupo e sem papel em branco */
      const fim=await p.evaluate(()=>({
        frase:/Nasceu no grupo/.test(document.getElementById('v-home').textContent),
        sobra:Math.round(document.documentElement.scrollHeight-(document.querySelector('.fim-pe').getBoundingClientRect().bottom+scrollY))
      }));
      t(!fim.frase,'a frase "Nasceu no grupo de WhatsApp" saiu do rodapé');
      t(fim.sobra<=40,'e embaixo do rodapé não sobra papel em branco: '+fim.sobra+'px');
      await p.screenshot({path:path.join(__dirname,'saida','home-clara-390.png')});
    }
    await ctx.close();
  }

  t(errs.length===0,'zero erro de console'+(errs.length?' — '+errs[0]:''));
  console.log('HOME CLARA');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();
