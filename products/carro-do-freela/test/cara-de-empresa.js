/* CARA DE EMPRESA GRANDE — a revisão de 04/out, executável.
 *
 * Victor pediu para olhar a plataforma "crítico o suficiente pra dizer se
 * está com cara de amadora". A revisão achou quatro famílias de defeito, e
 * esta suíte guarda as quatro:
 *   1. TEXTO QUE MENTIA: "os cadastros são reais" (a lista é fictícia desde
 *      13/set), o Premium da home vendendo três coisas cortadas em 19/ago,
 *      "Mais escolhido" antes de alguém ter escolhido, e "esperando você"
 *      dizendo 4 numa aba e 3 no número logo abaixo.
 *   2. AULA ANTES DO CONTEÚDO: Propostas, Agenda e Jobs abriam com painel de
 *      números e parágrafo; no celular a primeira tela não tinha proposta.
 *   3. ACABAMENTO: a marca cortada ("Carro d…") no iPhone, a palavra
 *      "abaixo" quebrando sozinha, "Quem te chamou: Você".
 *   4. NENHUMA FOTO numa plataforma de audiovisual.
 *
 * (17/out) A foto de fundo do hero SAIU — Victor: "a imagem de fundo não
 * condiz com o que quero pra plataforma". As fotos que ficam são as de
 * rosto e de capa, e o topo da home agora mostra a própria busca; quem
 * guarda o topo novo é a suíte home-clara.
 *
 * (17/out · 3) A home C ganhou uma ilustração 3D no topo — o carro saindo
 * da agenda, gerado com fundo transparente. ILUSTRAÇÃO não é a foto que o
 * Victor recusou: a regra continua sendo "nenhuma fotografia de fundo", e
 * a asserção agora exige que toda imagem do hero seja um objeto de HOME3D.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const PRE=pg=>pg.addInitScript(()=>{ try{
  localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-entrou','1');
  localStorage.setItem('cdf-guia','1'); localStorage.removeItem('cdf-uso');
}catch(e){} });

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const errs=[];
  const abrir=async(W,H,mob)=>{
    const ctx=await b.newContext({viewport:{width:W,height:H},isMobile:!!mob});
    const p=await ctx.newPage(); await PRE(p);
    p.on('pageerror',e=>errs.push('ERR: '+e.message));
    await p.goto(URL,{waitUntil:'networkidle'});
    await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:20000}).catch(()=>{});
    return {ctx,p};
  };
  const entrar=async p=>{
    await p.evaluate(()=>{show('entrar')}); await p.waitForTimeout(150);
    await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(120);
    await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(600);
  };

  /* ================= 1. texto que não mente ================= */
  {
    const {ctx,p}=await abrir(1280,900);
    const r=await p.evaluate(()=>{
      const html=document.body.innerHTML;
      const prem=[...document.querySelectorAll('#h-planos .plano[data-plano="premium"] .lista li')].map(x=>x.textContent.trim());
      return {reais:/cadastros s[aã]o reais|Cadastros reais|cadastros profissionais s[aã]o reais|Dados profissionais reais/i.test(html),
        mais:/Mais escolhido/i.test(html),
        prem, det:PLANO_DET.premium,
        cortados:prem.filter(x=>/Recibo e contrato|apareceu em busca|Clube de desconto/i.test(x)),
        nasceu:(document.querySelector('.hnasceu')||{}).textContent||'',
        selo:!!document.querySelector('.homenav [data-previa]'),
        resumo:(document.getElementById('pv-bem')||{}).textContent||''};
    });
    t(!r.reais,'⟶⟶ nenhum texto diz que os cadastros são reais — a lista é fictícia desde 13/set');
    /* (17/out · 5) A PRÉVIA SE DECLARA NUM LUGAR SÓ. Victor: "tira as mensagens
     de protótipo". O banner desta tela saiu; quem diz o que é ilustrativo é o
     selo "Prévia" ao lado da marca — e é ele que esta asserção cobra. */
    t(!/fict[ií]cios|demonstra/i.test(r.nasceu)&&r.selo&&/ilustrativ/i.test(r.resumo),
      'o fechamento não repete aviso — o selo "Prévia" da barra abre o resumo: pessoas e números ilustrativos');
    t(!r.mais,'⟶⟶ "Mais escolhido" não existe antes de alguém escolher — virou "Recomendado"');
    t(r.cortados.length===0,'o Premium da home não vende o que foi cortado em 19/ago: '+(r.cortados.join(' | ')||'nada'));
    t(JSON.stringify(r.prem)===JSON.stringify(r.det),
      '⟶⟶ e a lista da home é a MESMA de PLANO_DET (a fonte da tela de planos) — duas listas descolam');

    await entrar(p);
    await p.evaluate(()=>{show('propostas');painelProp('receb')}); await p.waitForTimeout(350);
    const n=await p.evaluate(()=>({aba:v('bg-receb').textContent, kpi:v('pp-novas').textContent,
      menu:v('bg-top').textContent, conta:String(esperandoVoce())}));
    t(n.aba===n.kpi&&n.kpi===n.menu&&n.menu===n.conta,
      '⟶⟶ "esperando você" é UM número: aba '+n.aba+' · painel '+n.kpi+' · menu '+n.menu+' · conta '+n.conta);
    await ctx.close();
  }

  /* ================= 2. a tela abre no conteúdo ================= */
  {
    const {ctx,p}=await abrir(390,844,true);
    await entrar(p);
    const antes=(a,b)=>p.evaluate(([a,b])=>{
      const x=document.querySelector(a), y=document.querySelector(b);
      return !!(x&&y&&(x.compareDocumentPosition(y)&Node.DOCUMENT_POSITION_FOLLOWING));
    },[a,b]);
    t(await antes('#pp-lista','#v-propostas .kpis'),'Propostas: a lista vem antes do painel de números');
    t(await antes('#ag-cal','#v-agenda .kpis'),'Agenda: o calendário vem antes dos cartões de dinheiro');
    t(await antes('#jb-lista','#jb-kpis'),'Jobs: os jobs vêm antes do resumo');

    await p.evaluate(()=>{show('propostas');painelProp('receb');scrollTo(0,0)}); await p.waitForTimeout(400);
    const pr=await p.evaluate(()=>{
      const c=document.querySelector('#pp-equip .vitem, #pp-lista .prop');
      return c?Math.round(c.getBoundingClientRect().top):9999;
    });
    t(pr<844,'⟶⟶ no iPhone a primeira proposta aparece na PRIMEIRA tela (topo em '+pr+'px de 844)');
    await p.evaluate(()=>{show('agenda');scrollTo(0,0)}); await p.waitForTimeout(400);
    const ag=await p.evaluate(()=>Math.round(document.getElementById('ag-cal').getBoundingClientRect().top));
    t(ag<844,'e o calendário da agenda também ('+ag+'px)');
    await ctx.close();
  }

  /* ================= 3. acabamento ================= */
  for(const W of [360,375,390]){
    const {ctx,p}=await abrir(W,800,true);
    await entrar(p);
    const r=await p.evaluate(()=>{ ASSINANTE=true; aplicarModo(); show('feed');
      const bb=document.querySelector('.top .brand b');
      return {inteira:bb.scrollWidth<=bb.clientWidth+1&&bb.textContent==='Carro do Freela',
        aria:(document.getElementById('modo-tog').getAttribute('aria-label')||'')};
    });
    t(r.inteira,'⟶⟶ a '+W+'px a marca aparece INTEIRA no topo — "Carro d…" era a primeira coisa vista');
    if(W===390) t(/lado (freela|contratante)/.test(r.aria),'e a chave do chapéu, sem rótulo no celular, diz o lado pelo aria');
    await ctx.close();
  }
  {
    const {ctx,p}=await abrir(1280,900);
    await entrar(p);
    const r=await p.evaluate(()=>{
      PROPOSTAS.forEach(x=>x.status='novo'); const bk=PRECOS.base; PRECOS.base={};
      show('propostas'); drawPropostas();
      const st=document.querySelector('#pp-tabela strong');
      const out={inline:st?getComputedStyle(st).display:'(sem)'};
      PRECOS.base=bk; return out;
    });
    t(r.inline==='inline','a palavra "abaixo" do convite da tabela fica na frase (display '+r.inline+')');
    t(await p.evaluate(()=>contratanteDe({equipe:[]})!=='Você'),'"Quem te chamou" nunca responde só "Você"');
    await ctx.close();
  }

  /* ================= 4. fotografia ================= */
  {
    const {ctx,p}=await abrir(1440,900);
    const r=await p.evaluate(()=>{
      const hero=document.querySelector('#v-home .hero');
      const comFoto=CREW.filter(c=>!c.me&&!(c.principal||[]).includes('Perfil incompleto'));
      /* (26/out) o rosto saiu do base64 para um arquivo em m/ (foto-rostos-<id>.<hash>.webp):
         continua sendo foto de verdade, só não mora mais dentro do HTML */
      const ROSTO=/(?:data:image\/|\/m\/foto-rostos-\d+\.\w+\.webp)/;
      const sem=comFoto.filter(c=>!ROSTO.test(c.foto||''));
      const unicos=new Set(comFoto.map(c=>c.foto)).size;
      const eu=CREW.find(c=>c.me);
      const imgs=[...hero.querySelectorAll('img')];
      /* (17/out · 15) o topo virou a CENA do carro da casa (HOME_VIDEO), a
         pedido do Victor ("à altura da área de login"). A regra de 17/out
         continua: nenhuma FOTO de set ou de gente no topo — nem capa de
         ofício, nem foto de cabeçalho; a única imagem dele é a cena. */
      const cena=(document.getElementById('hp-cena')||{style:{}}).style.backgroundImage||'';
      return {heroSemFoto:!!hero&&!/url\(/.test(getComputedStyle(hero).backgroundImage)
          /* (18/out) a carona tem dois quadros parados — o da cidade (poster)
             e o do banco do carona (parado) —, e os dois são a cena */
          &&imgs.length===0&&!!HOME_VIDEO.poster&&[HOME_VIDEO.poster,HOME_VIDEO.parado].some(q=>q&&cena.includes(q))
          &&![...Object.values(FOTOS.capas||{}),...Object.values(HERO_ARTE)].some(u=>cena.includes(String(u))),
        heroComRosto:[...document.querySelectorAll('#hj-lista .av')].filter(x=>ROSTO.test(x.style.backgroundImage)).length,
        semAsset:!('hero' in FOTOS)&&!('recorte' in FOTOS),
        n:comFoto.length, sem:sem.length, unicos, euSemRosto:!eu||!FOTOS.rostos[eu.id],
        incompletos:CREW.filter(c=>(c.principal||[]).includes('Perfil incompleto')&&FOTOS.rostos[c.id]).length};
    });
    t(r.heroSemFoto,'⟶⟶ o hero da home NÃO tem foto de set (17/out: "não condiz com o que quero pra plataforma") — a única imagem é a cena do carro da casa');
    t(r.semAsset,'e a foto e o recorte saíram do pacote — 118 KB que ninguém via');
    t(r.heroComRosto>=3,'a fotografia do topo agora é gente: '+r.heroComRosto+' rostos na prévia de quem está livre');
    t(r.sem===0,'⟶⟶ todo perfil fictício completo tem rosto: '+(r.n-r.sem)+' de '+r.n);
    t(r.unicos===r.n,'e ninguém divide rosto com ninguém ('+r.unicos+' rostos para '+r.n+' perfis)');
    t(r.euSemRosto,'⟶⟶ a conta de demonstração NÃO ganha rosto gerado — é o dono, que sobe a própria foto');
    t(r.incompletos===0,'perfil incompleto fica sem foto, que é o que acontece de verdade');

    const capa=await p.evaluate(()=>({
      drone:capaFuncao({principal:['Op. de drone'],func:[]}), som:capaFuncao({principal:['Técnico de som'],func:[]}),
      foto:capaFuncao({principal:['Fotógrafo'],func:[]}), ed:capaFuncao({principal:['Editor'],func:[]}),
      luz:capaFuncao({principal:['Direção de fotografia'],func:[]}), cam:capaFuncao({principal:['Op. de câmera'],func:[]})}));
    t(capa.drone==='drone'&&capa.som==='som'&&capa.foto==='foto'&&capa.ed==='edicao'&&capa.luz==='luz'&&capa.cam==='camera',
      'a capa do perfil acompanha a função: '+JSON.stringify(capa));
    await entrar(p);
    const pc=await p.evaluate(()=>{
      const c=CREW.find(x=>!x.me&&!trabalhosDe(x).length&&x.foto);
      abrirPerfil(c.id);
      const cp=document.getElementById('p-capa'), av=document.querySelector('#p-av img');
      return {foto:cp.classList.contains('foto'), av:!!av&&/(?:data:image\/|\/m\/foto-rostos-\d+\.\w+\.webp)/.test(av.src)};
    });
    t(pc.foto,'⟶⟶ perfil sem trabalho publicado ganha a foto da função como capa, nítida — não o quadro borrado');
    t(pc.av,'e a foto de rosto no lugar das iniciais');
    await ctx.close();
  }

  t(errs.length===0,'zero erro de console'+(errs.length?' — '+errs[0]:''));
  console.log('CARA DE EMPRESA');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();
