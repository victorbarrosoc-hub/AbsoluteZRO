/* A ABERTURA — o primeiro quadro, e o carro que cobre ele.
 *
 * Victor (25/ago): *"tem um bug assim que abre o site, é como se ele
 * quisesse abrir a aba de login primeiro e vai bem rápido pra homepage.
 * Penso em colocar uma animação do carro com o símbolo da carro do freela
 * no começo, como se o site tivesse carregando."*
 *
 * ⚠️ OS DOIS PEDIDOS SÃO O MESMO CONSERTO, e é isso que esta suíte jura.
 * O defeito tinha causa exata: `#v-entrar` era a ÚNICA <section> do markup
 * SEM o atributo `hidden`. O navegador pinta o HTML antes de rodar o
 * script; então o primeiro quadro era a TELA DE LOGIN, e só depois o
 * `show("home")` do boot trocava. Não era lentidão — era ordem.
 *
 * O que ela guarda:
 *  1. NENHUMA seção nasce visível. É a asserção que reprova o defeito
 *     original, e ela é de FONTE: o que decide o primeiro quadro é o
 *     atributo no arquivo, não o que o JS faz depois.
 *  2. O VÉU MORA NO MARKUP. Véu criado por JavaScript aparece DEPOIS do
 *     quadro que ele precisava cobrir — seria o mesmo defeito com fantasia.
 *  3. A TELA DE LOGIN NUNCA APARECE no caminho até a home. Varredura
 *     quadro a quadro, que é como a pessoa vê.
 *  4. ELE SAI, SEMPRE, e sai INTEIRO (removido do DOM: véu invisível de
 *     tela cheia é um dia de caça a clique que não chega).
 *  5. A COREOGRAFIA TERMINA ANTES DO VÉU IR EMBORA. A primeira versão
 *     tinha a marca ainda aparecendo quando a tela já dissolvia — animação
 *     cortada no meio parece defeito, não abertura.
 *  6. `prefers-reduced-motion` não ganha uma tela branca: o carro some, a
 *     marca fica parada, e o piso encolhe.
 *
 * ⚠️ 19/out: A COREOGRAFIA MUDOU, E OS NÚMEROS DESTA SUÍTE MUDARAM JUNTO.
 * Victor: "mude a animação do início, pode ser mais criativo e com as
 * cores novas. Precisa ser rápido, o tempo suficiente pra carregar a
 * homepage." Era ~3s (o carro atravessando, a marca crescendo); agora é
 * ~1s — o carrinho do botão Menu desenha o anel azul e rosa, as barras
 * acendem, e a saída é o anel ABRINDO como íris. As GARANTIAS são as
 * mesmas; o que mudou foi o piso (2950 → 1050), a hora da buzina
 * (2,24s → 0,70s) e o mecanismo da saída (a marca crescendo → o buraco do
 * íris), cada um conferido no lugar dele.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const RAIZ = path.resolve(__dirname,'..');
const pub = f => path.join(RAIZ,'public',f);
const URL = 'file://'+pub('index.html');

/* a sonda nasce ANTES de qualquer script da página: ela grava um retrato
   por quadro (seções visíveis + estado do véu) até o véu sumir. É o filme
   do que a pessoa enxergou, não uma foto do fim. */
const SONDA = () => {
  window.__filme=[]; window.__t=performance.now();
  const vis=el=>{ if(el.hidden) return false;
    const r=el.getBoundingClientRect(); return r.width>0&&r.height>0 };
  const quadro=()=>{
    if(!document.body){ requestAnimationFrame(quadro); return }
    const sp=document.getElementById('splash');
    const cs=sp?getComputedStyle(sp):null;
    window.__filme.push({
      ms:Math.round(performance.now()-window.__t),
      secoes:[...document.querySelectorAll('section[id^="v-"]')].filter(vis).map(s=>s.id),
      veu:!!sp, sai:!!(sp&&sp.classList.contains('sai')),
      op:cs?+cs.opacity:0,
      alt:sp?Math.round(sp.getBoundingClientRect().height):0,
      larg:sp?Math.round(sp.getBoundingClientRect().width):0,
      fundo:cs?cs.backgroundColor:'',
      /* ⚠️ a barra CHEIA (.spb3), não o svg pai: as barras acendem uma a
         uma e o pai fica opaco o tempo todo — medir ele passaria sempre. */
      marca:sp&&sp.querySelector('.spb3')?+getComputedStyle(sp.querySelector('.spb3')).opacity:-1,
      nome:sp&&sp.querySelector('.sp-nome')?+getComputedStyle(sp.querySelector('.sp-nome')).opacity:-1,
      /* quanto da coreografia já correu. ⚠️ Desde 19/out · 4 ela nasce
         PAUSADA e anda quando o boot acaba: o relógio é o __abertura0 */
      anim:window.__abertura0!=null?Math.round(document.timeline.currentTime-window.__abertura0):-1,
      anda:!!(sp&&sp.classList.contains('anda')),
      orb:sp&&sp.querySelector('.sp-orb')?getComputedStyle(sp.querySelector('.sp-orb')).transform:''
    });
    if(window.__filme.length<400) requestAnimationFrame(quadro);
  };
  requestAnimationFrame(quadro);
};

(async()=>{
  /* ============ 1. o defeito, na FONTE ============ */
  const tpl = fs.readFileSync(path.join(RAIZ,'src','template.html'),'utf8');
  const secoes = tpl.match(/<section id="v-[a-z0-9-]+"[^>]*>/g)||[];
  const nuas = secoes.filter(s=>!/\shidden[\s>]/.test(s));
  t(secoes.length>10&&nuas.length===0,
    '⟶⟶ nenhuma das '+secoes.length+' seções nasce visível — era `#v-entrar` sem `hidden` '
    +'que pintava o login no primeiro quadro'+(nuas.length?': '+nuas.join(' '):''));

  /* ============ 2. o véu é markup, não JavaScript ============ */
  const semJS = tpl.slice(0, tpl.indexOf('<script'));
  t(/<div id="splash"/.test(semJS),
    '⟶⟶ o véu está no markup, antes de qualquer <script> — criado por JS ele nasceria '
    +'DEPOIS do quadro que precisa cobrir');
  const saidas=['index'].concat([1,2,3,4,5,6].map(f=>'fase-'+f))
    .filter(n=>fs.existsSync(pub(n+'.html')));
  const faltando=saidas.filter(n=>{
    const h=fs.readFileSync(pub(n+'.html'),'utf8');
    return !h.includes('id="splash"') || /<section id="v-[a-z0-9-]+"(?![^>]*hidden)/.test(h);
  });
  t(faltando.length===0,'e ele existe nas '+saidas.length+' saídas, com todas as seções fechadas'
    +(faltando.length?' — falha em '+faltando.join(', '):''));

  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const abrir=async(reduz)=>{
    const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,
      reducedMotion:reduz?'reduce':'no-preference'});
    const p=await ctx.newPage(); const errs=[];
    p.on('pageerror',e=>errs.push('ERR: '+e.message));
    p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
    await p.addInitScript(SONDA);
    await p.goto(URL,{waitUntil:'load'});
    await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000})
      .catch(()=>{});
    await p.waitForTimeout(150);
    const r=await p.evaluate(()=>({filme:window.__filme,
      veu:!!document.getElementById('splash'),
      tela:typeof S!=='undefined'?S.tab:'?',
      home:!document.getElementById('v-home').hidden,
      entrar:!document.getElementById('v-entrar').hidden}));
    return {...r,errs,ctx,p};
  };

  /* ============ 3. o filme: o login nunca aparece ============ */
  const a=await abrir(false);
  const f=a.filme;
  t(f.length>10,'a sonda gravou '+f.length+' quadros da abertura');
  const login=f.filter(q=>q.secoes.includes('v-entrar'));
  t(login.length===0,
    '⟶⟶ a tela de login NÃO aparece em nenhum quadro da abertura — era o que o Victor via');

  /* qualquer seção que apareça ANTES de o véu começar a sair tem de estar
     COBERTA. ⚠️ O corte é o quadro em que a saída começa, não o `sai` de
     cada quadro: depois de removido o véu, `sai` volta a ser falso porque
     não há mais elemento — e aí toda a home legítima entraria na conta. */
  const iSai=f.findIndex(q=>q.sai);
  const antes=iSai<0?f:f.slice(0,iSai);
  const primeiroDesc=antes.find(q=>q.secoes.length
    &&(!q.veu||q.op<.99||q.alt<844||q.larg<390));
  t(!primeiroDesc,
    '⟶⟶ enquanto o véu está de pé ele cobre a tela inteira (390×844, opaco) — nada pisca por baixo'
    +(primeiroDesc?': '+JSON.stringify(primeiroDesc):''));
  /* ⚠️ o primeiro quadro COM véu, não o f[0]: o rAF da sonda pode rodar
     antes de o parser chegar ao #splash — e nesse quadro também não há
     seção nenhuma, então não há o que cobrir. */
  const q0=f.find(q=>q.veu)||{fundo:''};
  t(/rgba?\((\d+),\s*(\d+),\s*(\d+)\)/.test(q0.fundo),
    'o fundo do véu é opaco de verdade ('+q0.fundo+') — véu translúcido deixaria ver o que ele esconde');

  /* ============ 4. ele sai, e sai inteiro ============ */
  const saiu=f.find(q=>q.sai);
  t(!!saiu,'o véu recebe a saída em '+(saiu?saiu.ms+'ms':'NUNCA'));
  t(!a.veu,'⟶⟶ e some do DOM — véu invisível de tela cheia comeria clique para sempre');
  t(a.home&&!a.entrar&&a.tela==='home','o que fica é a homepage: tela="'+a.tela+'"');
  /* ⚠️ 19/out · 4: a coreografia ANDA SÓ DEPOIS DO BOOT e dura 1950ms
     (era 1050, contados do começo da página). Victor, com a gravação do
     iPhone: "tá muito rápido. Precisa ser mais lento e mais fluido" — o
     disco ficava parado enquanto o app montava e a volta do carro corria
     em ~0,2s para recuperar o relógio. Mede-se: sai depois da coreografia
     inteira, e não espera à toa depois dela (teto de 2400). */
  const antesDaSaida=iSai>0?f[iSai-1]:null;
  t(antesDaSaida&&antesDaSaida.anim>=1880,
    'sai depois da coreografia inteira ('+(antesDaSaida?antesDaSaida.anim:'-')+'ms de animação, piso de 1950)');
  t(saiu&&saiu.anim>0&&saiu.anim<2400,
    'e não espera à toa depois dela ('+(saiu?saiu.anim:'-')+'ms da coreografia quando a saída começa)');
  /* ⚠️ O CARRO NÃO ANDA ENQUANTO O APP MONTA: em todo quadro antes do
     `.anda` a órbita está parada — e desde 19/out · 5 parada a 42°, no
     lugar onde ele estaciona (Victor: "o carrinho pode começar no ponto
     final já, roda 360° só"). Era o defeito da gravação: parado, e depois
     o pulo. */
  const angulo=tr=>{ const m=/matrix\(([^)]+)\)/.exec(tr||''); if(!m) return tr==='none'?0:NaN;
    const [a,b2]=m[1].split(',').map(Number); let g=Math.atan2(b2,a)*180/Math.PI; return g<0?g+360:g };
  const parado=f.filter(q=>q.veu&&!q.anda&&q.orb);
  const andouCedo=parado.filter(q=>Math.abs(angulo(q.orb)-42)>.5);
  t(parado.length>0&&andouCedo.length===0,
    '⟶⟶ o carro espera o app montar parado no ponto onde estaciona, a 42° (' +parado.length+' quadros de pose, '+andouCedo.length+' fora dele)');
  /* e a volta é UMA: termina onde começou */
  const ultimo=[...f].reverse().find(q=>q.veu&&q.anda&&q.orb);
  t(ultimo&&Math.abs(angulo(ultimo.orb)-42)<.5,'e termina onde começou, depois de uma volta só ('+(ultimo?angulo(ultimo.orb).toFixed(1):'-')+'°)');
  const boot=await a.p.evaluate(()=>({fim:window.__bootFim,t0:window.__abertura0}));
  t(boot.fim!=null&&boot.t0!=null&&boot.t0>=boot.fim,
    'e arranca depois do fim do boot ('+(boot.t0!=null&&boot.fim!=null?Math.round(boot.t0-boot.fim):'-')+'ms depois)');

  /* ============ 5. a coreografia acaba ANTES do véu ir ============
     ⚠️ medido no último quadro ANTES da saída, não no quadro dela: o
     `.sai` apaga o nome com `animation:none`, então no quadro em que ele
     entra o nome já está legitimamente a zero. */
  const antesSai=iSai>0?f[iSai-1]:null;
  t(antesSai&&antesSai.marca>=.99&&antesSai.nome>=.99,
    '⟶⟶ marca e nome já estão inteiros quando o véu começa a sair — animação cortada no meio '
    +'parece defeito (marca '+(antesSai?antesSai.marca:'-')+', nome '+(antesSai?antesSai.nome:'-')+')');
  t(a.errs.length===0,'zero erro de console na abertura'+(a.errs[0]?' — '+a.errs[0]:''));

  /* ⚠️ ESTE CONTEXTO É UMA PRIMEIRA VISITA DE VERDADE — sem `cdf-pv` no
     armazenamento, que é como a pessoa abre o site. Desde 17/out · 5 nada
     abre sozinho por cima da home: a prévia se declara no selo. */
  t(await a.p.locator('#ovl-pv').isHidden()&&await a.p.locator('.homenav [data-previa]').isVisible(),
    'depois do véu, nenhum aviso abre sozinho — a prévia está dita no selo ao lado da marca');
  await a.p.locator('.homenav .entrar-cta').click();
  await a.p.waitForTimeout(250);
  t(await a.p.locator('#v-entrar').isVisible(),
    'e o app responde ao toque depois dele — o véu não deixou nada preso');
  await a.ctx.close();

  /* ============ 5b. a saída abre NÍTIDA (17/out · 12 → 19/out) ============
     A lição de 17/out · 12 continua: o Safari pinta a camada no tamanho de
     partida e estica o bitmap, então NADA da saída pode crescer por
     scale(). Desde 19/out a saída é o íris: um buraco que cresce no fundo
     do véu (o raio de um radial-gradient, redesenhado a cada quadro) com as
     cores do anel na borda. O Chromium não mostraria serrilhado de qualquer
     jeito, então a guarda é sobre o MECANISMO: no meio da saída o buraco já
     é maior que o disco, o fundo é o degradê do íris, nenhum elemento do
     véu está ampliado além de um respiro, e a página não alarga. */
  {
    const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});
    const p=await ctx.newPage();
    await p.goto(URL,{waitUntil:'load'});
    await p.waitForFunction(()=>{const s=document.getElementById('splash');return s&&s.classList.contains('sai')},null,{timeout:8000}).catch(()=>{});
    /* ⚠️ 380ms desde 19/out · 4: o íris passou de 0,62s para 1s, e o
       "meio da saída" anda junto (era 220 de 620) */
    await p.waitForTimeout(380);
    const m=await p.evaluate(()=>{
      const sp=document.getElementById('splash'); if(!sp) return null;
      const cs=getComputedStyle(sp);
      const esc=Math.max(1,...[...sp.querySelectorAll('*')].map(el=>{ const tr=getComputedStyle(el).transform;
        if(!tr||tr==='none') return 1; const mt=new DOMMatrix(tr); return Math.hypot(mt.a,mt.b) }));
      return {r:parseFloat(cs.getPropertyValue('--sp-r')), bg:cs.backgroundImage, esc,
        cena:+getComputedStyle(sp.querySelector('.sp-cena')).opacity,
        iw:innerWidth, sw:document.documentElement.scrollWidth};
    });
    t(m&&m.r>104&&/radial-gradient/.test(m.bg),
      '⟶⟶ no meio da saída o íris já abriu além do disco (raio '+(m?Math.round(m.r):'-')+'px) — é o buraco que cresce, redesenhado a cada quadro');
    t(m&&m.esc<=1.1,'e nada do véu cresce por scale() — escala estica o bitmap e serrilha no iPhone (maior escala '+(m?m.esc.toFixed(2):'-')+')');
    t(m&&m.cena<.5,'o emblema já saiu de cima da home, em vez de ficar fantasma no meio do íris (opacidade '+(m?m.cena.toFixed(2):'-')+')');
    t(m&&m.iw===390&&m.sw<=390,'e a saída não alarga a página por baixo do véu ('+(m?m.iw+'/'+m.sw:'-')+')');
    await ctx.close();
  }
  /* 5c. O halo nasce ESCONDIDO atrás do disco (19/out). Com o raio partindo
     de 40px, a faixa colorida (44px) passava da borda do disco e o halo rosa
     aparecia inteiro num quadro só — o Victor parou o vídeo exatamente ali.
     Antes da saída, raio + faixa tem de caber dentro do disco. */
  {
    const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});
    const p=await ctx.newPage();
    await p.goto(URL,{waitUntil:'domcontentloaded'});
    const m=await p.evaluate(()=>{ const sp=document.getElementById('splash'); if(!sp||sp.classList.contains('sai')) return null;
      return {r:parseFloat(getComputedStyle(sp).getPropertyValue('--sp-r')), disco:sp.querySelector('.sp-cena').getBoundingClientRect().width/2} });
    t(m&&m.r+44<=m.disco,'o halo do íris começa escondido atrás do disco (raio '+(m?m.r:'-')+' + faixa 44 ≤ '+(m?m.disco:'-')+') — sem estourar num quadro só');
    await ctx.close();
  }

  /* 5d. O carro da abertura estaciona onde o do botão Menu estaciona
     (19/out · 2): por fora do anel, do mesmo tamanho relativo. A primeira
     versão andava EM CIMA do anel, menor — e nenhuma asserção media isso.
     Compara as duas geometrias pelo estilo computado (o botão não aparece
     na home, mas o estilo dele existe). */
  {
    const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});
    const p=await ctx.newPage();
    await p.goto(URL,{waitUntil:'domcontentloaded'});
    const g=await p.evaluate(()=>{
      const px=(el,k)=>parseFloat(getComputedStyle(el)[k]);
      const geo=(disco,orb,car)=>{ const R=px(disco,'width')/2, fora=-px(orb,'top');
        return {r:(R+fora-(px(car,'top')+px(car,'height')/2))/R, w:px(car,'width')/(2*R)} };
      const sp=document.getElementById('splash'); if(!sp) return null;
      return {ab:geo(sp.querySelector('.sp-cena'),sp.querySelector('.sp-orb'),sp.querySelector('.sp-carro')),
        bt:geo(document.querySelector('#bt-menu .mnb'),document.querySelector('#bt-menu .mnb-orb'),document.querySelector('#bt-menu .mnb-car'))} });
    const f=x=>x?x.r.toFixed(2)+'R, '+Math.round(x.w*100)+'%':'-';
    t(g&&Math.abs(g.ab.r-g.bt.r)<.03&&Math.abs(g.ab.w-g.bt.w)<.02&&g.ab.r>1,
      '⟶⟶ o carro da abertura anda por fora do anel, como o do botão Menu (abertura '+f(g&&g.ab)+' · botão '+f(g&&g.bt)+')');
    await ctx.close();
  }

  /* ============ 6. movimento reduzido ============ */
  const r=await abrir(true);
  const rq=r.filme[Math.min(3,r.filme.length-1)];
  const car=await (async()=>{
    const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,reducedMotion:'reduce'});
    const p=await ctx.newPage(); await p.goto(URL,{waitUntil:'commit'});
    await p.waitForTimeout(120);
    const x=await p.evaluate(()=>{const c=document.querySelector('.sp-carro');
      const m=document.querySelector('.spb3');
      return {carro:c?getComputedStyle(c).display:'-',
        marca:m?+getComputedStyle(m).opacity:-1}});
    await ctx.close(); return x;
  })();
  t(car.carro==='none','com movimento reduzido o carro não atravessa (display:'+car.carro+')');
  t(car.marca>=.99,'e a marca já está lá, parada — a abertura vira um cartão, não some');
  const rsaiu=r.filme.find(q=>q.sai);
  t(!r.veu&&r.home,'o véu sai igual e a home fica');
  t(rsaiu&&rsaiu.ms<900,'e o piso encolhe ('+(rsaiu?rsaiu.ms:'-')+'ms) — sem animação não há o que ler');
  t(r.filme.filter(q=>q.secoes.includes('v-entrar')).length===0,
    'o login também não aparece aqui');
  t(r.errs.length===0,'zero erro de console'+(r.errs[0]?' — '+r.errs[0]:''));
  await r.ctx.close();

  /* ============ 7. o som da abertura ============
     Victor (25/ago): *"pode colocar bem discreto, só pra ter uma interação
     e ser legal, mas sem ser chato de ficar ouvindo."*

     ⚠️ A ASSERÇÃO QUE MAIS IMPORTA AQUI É A DO SILÊNCIO. Navegador nenhum
     deixa tocar áudio antes de um gesto, e nó agendado em contexto
     suspenso NÃO é descartado: ele fica na fila e dispara todo de uma vez
     quando a pessoa finalmente toca em qualquer coisa. Sem a trava, a
     buzina estouraria sozinha minutos depois, com a abertura fora da tela
     — e ninguém ligaria o som à causa. */
  /* o relógio da coreografia: desde o começo das animações do véu */
  const RELOGIO=()=>{ const sp=document.getElementById('splash'); if(!sp) return null;
    return window.__abertura0!=null?document.timeline.currentTime-window.__abertura0:null };
  const espiar=(rel)=>{ window.__ab=[]; window.__rel=eval('('+rel+')');
    const t=setInterval(()=>{
      if(typeof SONS==="object"&&SONS.abertura&&!SONS.__e){ SONS.__e=1;
        const o=SONS.abertura;
        SONS.abertura=function(t0){
          window.__ab.push({t0,agora:ac.currentTime,
            buzina:Math.max(t0+1.12,ac.currentTime+.02),
            anim:window.__rel()});
          return o.call(this,t0) };
        clearInterval(t) } },1) };
  const somAo=async(tocarEm,mudo)=>{
    const c2=await b.newContext({viewport:{width:390,height:844},isMobile:true});
    const pg=await c2.newPage(); const er=[];
    pg.on('pageerror',e=>er.push('ERR: '+e.message));
    pg.on('console',m=>m.type()==='error'&&er.push(m.text()));
    if(mudo) await pg.addInitScript(()=>{ try{
      localStorage.setItem('cf-app-som','0') }catch(e){} });
    await pg.addInitScript(espiar,RELOGIO.toString());
    await pg.goto(URL);
    /* ⚠️ "CEDO" E "TARDE" SE MEDEM NO RELÓGIO DA ANIMAÇÃO, não no da
       parede (17/out · 15): o load chega quando quer, a animação começa no
       primeiro quadro. Desde 19/out · 4 a coreografia dura ~1,9s e começa
       depois do boot, então "cedo" é durante a volta do carro (190ms) e
       "tarde" é depois da buzina (1,12s) e antes de o véu sair. */
    if(tocarEm!==null){
      const alvo=tocarEm==='tarde'?1380:190;
      await pg.waitForFunction((alvo)=>{ const sp=document.getElementById('splash');
        if(!sp||sp.classList.contains('sai')) return false;
        const r=window.__rel&&window.__rel(); return r!=null&&r>=alvo },alvo,{timeout:10000,polling:16});
      await pg.mouse.click(195,300);
    }
    await pg.waitForTimeout(700);
    const r=await pg.evaluate(()=>({ab:window.__ab,
      estado:(()=>{try{return ac?ac.state:'sem-ac'}catch(e){return '-'}})()}));
    await c2.close(); return {...r,er};
  };

  const mudo=await somAo(null,false);
  t(mudo.ab.length===0,
    '⟶⟶ sem ninguém tocar na tela, NADA de áudio é agendado — nó em contexto '
    +'suspenso não some, ele espera e dispara junto no primeiro toque');
  t(mudo.estado!=='running','e o contexto de áudio segue suspenso, como o navegador manda ('+mudo.estado+')');

  const cedo=await somAo('cedo',false);
  t(cedo.ab.length===1,'tocar na abertura toca o som — é o gesto que o navegador exige');
  const q=cedo.ab[0]||{};
  const naAnim=q.anim!=null?(q.anim/1000+(q.buzina-q.agora)):null;
  t(naAnim!==null&&Math.abs(naAnim-1.12)<.08,
    '⟶⟶ e a buzina cai no quadro da MARCA (' +(naAnim||0).toFixed(2)+'s da animação, alvo 1,12s) — '
    +'alinhada à imagem, não 1,12s depois do dedo');
  t(q.t0<0,'o som se alinha pelo começo da animação, não pelo toque (t0='+(q.t0||0).toFixed(2)+'s)');

  const tarde=await somAo('tarde',false);
  const q2=tarde.ab[0]||{};
  t(tarde.ab.length===1&&q2.buzina-q2.agora<.1,
    'tocando depois da hora a buzina desliza para agora em vez de sumir — quem tocou ouve algo');

  const semSom=await somAo('cedo',true);
  t(semSom.ab.length===0,'e com o som desligado no menu ela não toca nem no toque');
  t([mudo,cedo,tarde,semSom].every(x=>x.er.length===0),
    'zero erro de console nos quatro casos');

  console.log('ABERTURA');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();
