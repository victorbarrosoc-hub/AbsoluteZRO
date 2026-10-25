/* MOVIMENTO — as animações da casa e a saída para quem não quer nenhuma.
 *
 * A `som.js` mede o SOM. Esta mede o resto do gesto, e o que ela cobra são
 * três defeitos que hoje saem de graça:
 *
 *   1. nome de som que ninguém toca — `som("x")` cai num catch mudo, e um
 *      erro de digitação deixa o clique silencioso sem nada reclamar;
 *   2. `animation:` apontando para @keyframes que não existe — o navegador
 *      ignora sem avisar;
 *   3. prefers-reduced-motion. A regra é do usuário, não minha: quem
 *      desligou movimento no sistema não recebe NENHUM. Vale para o CSS e
 *      para as duas animações que rodam por JavaScript, que precisam
 *      checar a mídia por conta própria — @media não alcança quem
 *      adiciona classe no script.
 */
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const ARQ=path.resolve(__dirname,'..','public','index.html');
const url='file://'+ARQ;
const PRE=()=>{ try{
  localStorage.setItem('cdf-pv','1');
  localStorage.setItem('cdf-entrou','1');
  localStorage.setItem('cdf-guia','1');
  localStorage.removeItem('cdf-uso');
}catch(e){} };

(async()=>{
  const fonte=fs.readFileSync(ARQ,'utf8');
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

  /* ============ 1. todo som chamado existe na paleta ============ */
  const p=await b.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const errs=[];p.on('pageerror',e=>errs.push('ERR: '+e.message));
  await p.addInitScript(PRE);
  await p.goto(url,{waitUntil:'networkidle'});

  /* Três jeitos de pedir som, e a primeira versão desta suíte só lia um:
       som("toque")                       direto
       avisar({... som:"chegou"})         por dentro do aviso
       som(i===4?"conquista":"buzina")    escolhido na hora
     Com só o primeiro, três sons apareciam como abandonados — a suíte
     acusando peso morto que não existia. */
  const chamados=[...new Set([
    ...[...fonte.matchAll(/\bsom\([^)]*\)/g)]
        .flatMap(m=>[...m[0].matchAll(/"([a-zç]+)"/g)].map(x=>x[1])),
    ...[...fonte.matchAll(/\bsom\s*:\s*"([a-zç]+)"/g)].map(m=>m[1])
  ])].sort();
  const paleta=(await p.evaluate(()=>Object.keys(SONS))).sort();
  t(chamados.length>=6,'o arquivo chama vários sons pelo nome: '+chamados.join(', '));
  const orfaos=chamados.filter(n=>!paleta.includes(n));
  t(orfaos.length===0,'e todo nome chamado existe na paleta — nenhum clique mudo por digitação'
    +(orfaos.length?': '+orfaos.join(', '):''));
  const parados=paleta.filter(n=>!chamados.includes(n));
  t(parados.length===0,'e nenhum som sobra sem uso na paleta'+(parados.length?': '+parados.join(', '):''));

  /* ============ 2. toda animação aponta para um @keyframes ============ */
  const nomes=await p.evaluate(()=>{
    const usados=new Set(), definidos=new Set();
    for(const s of document.styleSheets){
      let rs; try{ rs=s.cssRules }catch(e){ continue }
      /* ⚠️ A ORDEM DESTES TRÊS IFS É O TESTE INTEIRO. Com `r.cssRules`
         antes de `r.style` esta suíte lia ZERO animações e passava: o
         Chromium ganhou aninhamento de CSS, e desde então TODA regra
         comum tem `.cssRules` — uma lista vazia, que é truthy. */
      const varrer=lista=>{ for(const r of lista){
        if(r.type===CSSRule.KEYFRAMES_RULE){ definidos.add(r.name); continue }
        if(r.style){
          const a=r.style.animationName||'';
          a.split(',').map(x=>x.trim()).forEach(x=>{ if(x&&x!=='none') usados.add(x) });
          continue;
        }
        if(r.cssRules) varrer(r.cssRules);
      }};
      varrer(rs);
    }
    return {usados:[...usados],definidos:[...definidos]};
  });
  const semKeyframes=nomes.usados.filter(n=>!nomes.definidos.includes(n));
  t(nomes.usados.length>10,'a folha usa '+nomes.usados.length+' animações');
  t(semKeyframes.length===0,'e todas têm @keyframes de verdade'
    +(semKeyframes.length?' — faltam: '+semKeyframes.join(', '):''));

  /* ============ 3. as quatro animações da casa animam ============ */
  const anima=async cls=>p.evaluate(c=>{
    const d=document.createElement('div');
    d.className=c; document.body.appendChild(d);
    const n=getComputedStyle(d).animationName;
    d.remove(); return n;
  },cls);
  for(const c of ['entra','sobe','pulsa','passou'])
    t(await anima(c)===c,'.'+c+' anima');
  await p.close();

  /* ============ 4. e nenhuma anima para quem desligou movimento ============
     Contexto NOVO: prefers-reduced-motion não se troca em página aberta. */
  const ctx=await b.newContext({viewport:{width:1280,height:1000},deviceScaleFactor:2,
    reducedMotion:'reduce'});
  const q=await ctx.newPage();
  const errs2=[];q.on('pageerror',e=>errs2.push('ERR: '+e.message));
  await q.addInitScript(PRE);
  await q.goto(url,{waitUntil:'networkidle'});

  t(await q.evaluate(()=>matchMedia('(prefers-reduced-motion:reduce)').matches),
    'o navegador do teste está com movimento desligado');
  const paradas=await q.evaluate(()=>['entra','sobe','pulsa','passou'].map(c=>{
    const d=document.createElement('div');
    d.className=c; document.body.appendChild(d);
    const n=getComputedStyle(d).animationName;
    d.remove(); return c+':'+n;
  }));
  t(paradas.every(x=>/:none$/.test(x)),'e as quatro param: '+paradas.join(' '));
  t(/@media\s*\(prefers-reduced-motion:reduce\)\{\*\{animation:none!important;transition:none!important\}\}/
    .test(fonte),'existe a trava geral `*{animation:none!important}` para o que vier depois');

  /* ---- as duas que rodam por JavaScript ---- */
  await q.locator('.homenav .entrar-cta').click(); await q.waitForTimeout(220);
  await q.locator('[data-lgtipo="contratante"]').click(); await q.waitForTimeout(160);
  await q.locator('[data-login="Google"]').click(); await q.waitForTimeout(500);
  await q.evaluate(()=>{ASSINANTE=true;MODO='contratante';aplicarModo()}); await q.waitForTimeout(250);
  await q.evaluate(()=>show('equipe')); await q.waitForTimeout(400);

  const pista=await q.evaluate(()=>{
    const el=document.getElementById('pista');
    if(!el) return null;
    passarOCarro(0);
    return {on:el.classList.contains('on'),rodando:carroRodando};
  });
  t(pista&&!pista.on&&!pista.rodando,
    'passarOCarro() não atravessa a tela — o @media não alcança classe posta por script, então a função checa a mídia');
  const bot=await q.evaluate(()=>{
    const el=document.getElementById('e-passar');
    if(!el) return null;
    carroNoBotao();
    return {rodou:el.classList.contains('rodou'),
            mini:getComputedStyle(el.querySelector('.minicarro')).display};
  });
  t(bot&&!bot.rodou,'e o carrinho do botão também não corre');
  t(bot&&bot.mini==='none','o carrinho nem fica no botão parado — some, em vez de virar enfeite mudo');
  /* ⚠️ desligar movimento NÃO pode desligar o som: são duas escolhas
     diferentes, e quem não enxerga bem costuma querer o contrário. */
  t(await q.evaluate(()=>SOM===true),'movimento desligado não desliga o som — são duas escolhas separadas');

  await ctx.close(); await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  const todos=[...new Set([...errs,...errs2])];
  if(todos.length){console.log('\n== CONSOLE =='); todos.forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+todos.length+' erros');
  process.exit(bad.length||todos.length?1:0);
})();
