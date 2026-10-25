/* O CADASTRO SAI DO APARELHO — e as duas vezes em que ele NÃO sai
 *
 * `NUVEM` é a primeira e única saída de rede do arquivo. Até 22/ago o
 * protótipo era 100% local: quem preenchia, preenchia para si mesmo.
 *
 * ⚠️ As duas exclusões do `nuvemLigada()` são de produto, não de
 * conveniência, e esta suíte existe principalmente para protegê-las:
 *
 *   file://  — é o que as suítes carregam, e é o que acontece quando
 *              alguém salva a página. Nem um nem outro é "uma pessoa
 *              abriu o link".
 *   iframe   — a aba de aprovação do artifact bloqueia requisição externa.
 *              Sem essa linha TODA abertura registraria um erro vermelho
 *              no console, e como quase toda suíte reprova com erro de
 *              console, isto derrubaria a bateria inteira.
 */
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const ARQ=path.resolve(__dirname,'..','public','index.html');
const URL='file://'+ARQ;
/* ⚠️ PRECISA DAS DUAS ORIGENS. Em `file://` a nuvem tem que ficar MUDA, e
   essa é metade do contrato; a outra metade — a fila, o formulário de
   contato — só existe servido por http, que é como a pessoa abre o link.
   `_servir.js` faz isso sem rede de verdade. */
const {servir,URL:HTTP}=require('./_servir.js');

(async()=>{
  const fonte=fs.readFileSync(ARQ,'utf8');
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  /* toda requisição para fora é registrada e BLOQUEADA: a suíte não fala
     com o Supabase de verdade — ela mede se o arquivo TENTARIA */
  const saidas=[];
  await p.route('**://*/**',r=>{
    const u=r.request().url();
    if(!u.startsWith('file:')){ saidas.push(u); return r.fulfill({status:201,body:''}) }
    r.continue();
  });
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');
    localStorage.setItem('cdf-guia','1');
    localStorage.removeItem('cdf-entrou');
    localStorage.removeItem('cdf-uso');
    localStorage.removeItem('cdf-guardei');
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.waitForTimeout(600);

  /* ============ em file:// ele CALA ============ */
  t(await p.evaluate(()=>typeof NUVEM==='object'&&!!NUVEM.URL),'o endereço da nuvem está no arquivo');
  t(await p.evaluate(()=>nuvemLigada()===false),
    'e `nuvemLigada()` é FALSO em file:// — abrir do disco não é alguém abrindo o link');
  t(saidas.length===0,'nenhuma requisição saiu: '+saidas.length);
  t(errs.length===0,'e nenhum erro de console — é isto que mantém a bateria de pé');

  /* ⚠️ a chave anon fica no HTML de propósito, e só é segura enquanto a
     política for de INSERT. Uma policy de select vaza a lista inteira. */
  const papel=await p.evaluate(()=>{
    try{ return JSON.parse(atob(NUVEM.KEY.split('.')[1])).role }catch(e){ return '?' }
  });
  t(papel==='anon','a chave publicada é a ANON, não a de serviço: role="'+papel+'"');
  t(/INSERT|insert/.test(fonte),'e o arquivo registra que a segurança depende da policy ser só de inserção');

  /* ⚠️ EM file:// A FILA NEM ENCHE, e é de propósito: `nuvemPost` sai antes
     de tentar. Encher a fila aqui guardaria no aparelho de quem abriu o
     arquivo do disco um monte de linha que nunca teria destino. */
  const filaOff=await p.evaluate(()=>{
    nuvemPost('passos',{quem:'teste',passo:'abriu'});
    try{ return JSON.parse(localStorage.getItem('cdf-nuvem-fila')||'[]').length }catch(e){ return -1 }
  });
  t(filaOff===0,'e desligada ela nem enche a fila — sai antes de tentar');

  /* ⚠️ O TEXTO DO CONVITE, DESLIGADO, É O MELHOR PEDAÇO DESTE PRODUTO:
     em vez de mostrar um campo que não vai a lugar nenhum, ele diz que
     dali não dá, e não finge que anotou. */
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(170);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(900);
  const off=await p.locator('#cd-guardar').textContent();
  t(/não consigo anotar/.test(off),'desligada, a tela DIZ que não consegue anotar: "'+off.slice(30,80).trim()+'…"');
  t(/não vou fingir/.test(off),'e que não vai fingir que anotou');
  t(await p.locator('#cd-guardar .gdrc').count()===0,
    'sem campo de contato — campo que não leva a lugar nenhum é a mentira de UI que esta casa trata como defeito');
  await ctx.close();

  /* ============ servida por http, ela funciona ============ */
  const ctx2=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const h=await ctx2.newPage();
  h.on('pageerror',e=>errs.push('ERR: '+e.message));
  /* ⚠️ O ANDAIME FAZ BARULHO, e o barulho dele não conta. Esta suíte
     derruba a requisição de propósito para ver a fila encher — e toda
     resposta ruim escreve "Failed to load resource" no console, que é
     justamente o que ela reprova. Filtrar aqui é honesto porque o erro é
     MEU; qualquer outro continua reprovando. */
  h.on('console',m=>{ if(m.type()!=='error') return;
    if(/Failed to load resource/.test(m.text())) return;
    errs.push(m.text()); });
  await servir(h);
  const enviados=[];
  /* ⚠️ 500, NUNCA `abort()`. Abortar dá `net::ERR_FAILED` no console — e
     esta suíte reprova com erro de console, então ela reprovaria por causa
     do próprio andaime. Um 500 faz `nuvemEnviar` lançar do mesmo jeito
     (ele checa `r.ok`), que é o caminho que enche a fila. */
  await h.route('**/rest/v1/**',r=>{ enviados.push(r.request().url());
    r.fulfill({status:500,contentType:'application/json',body:'{}'}) });
  await h.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-guia','1');
    localStorage.removeItem('cdf-entrou'); localStorage.removeItem('cdf-uso');
    localStorage.removeItem('cdf-guardei'); localStorage.removeItem('cdf-nuvem-fila');
  } catch(e) {} });
  await h.goto(HTTP,{waitUntil:'networkidle'}); await h.waitForTimeout(600);
  t(await h.evaluate(()=>nuvemLigada()===true),'servida por http, `nuvemLigada()` é verdadeiro');

  /* ⚠️ NADA SE PERDE EM SILÊNCIO: o que não sobe fica na fila e tenta de
     novo na abertura seguinte. É a mesma postura do balão de suporte. */
  await h.evaluate(()=>nuvemPost('passos',{quem:'teste',passo:'abriu'}));
  await h.waitForTimeout(400);
  const fila=await h.evaluate(()=>{
    try{ return JSON.parse(localStorage.getItem('cdf-nuvem-fila')||'[]').length }catch(e){ return -1 }});
  t(fila>0,'o que não sobe cai na fila local em vez de sumir: '+fila+' na fila');
  const teto=await h.evaluate(async()=>{
    for(let i=0;i<60;i++) nuvemPost('passos',{quem:'teste',n:i});
    await new Promise(r=>setTimeout(r,600));
    try{ return JSON.parse(localStorage.getItem('cdf-nuvem-fila')||'[]').length }catch(e){ return -1 }});
  t(teto<=40,'e a fila tem teto — ela não cresce para sempre no aparelho de ninguém: '+teto);
  t(enviados.length>0,'e ela TENTA de verdade: '+enviados.length+' requisições para /rest/v1/');

  /* ============ o id é do APARELHO, não da pessoa ============ */
  const q1=await h.evaluate(()=>quemSou());
  const q2=await h.evaluate(()=>quemSou());
  t(q1===q2&&q1.length>6,'`quemSou()` devolve sempre o mesmo id nesta sessão');
  t(!/[@.]/.test(q1),'e ele não é e-mail nem nome — serve para desduplicar, não para identificar: '+q1);

  /* ============ o convite do lançamento, ligado ============ */
  await h.locator('.homenav .entrar-cta').click(); await h.waitForTimeout(240);
  await h.locator('[data-lgtipo="freela"]').click(); await h.waitForTimeout(170);
  await h.locator('[data-login="Google"]').click(); await h.waitForTimeout(900);
  const p2=h;
  const gdr=h.locator('#cd-guardar').first();
  t(await gdr.count()===1,'o cadastro tem o convite para deixar contato');
  const gt=await gdr.textContent();
  /* ⚠️ BOTÃO, NÃO CAIXA MARCADA: consentimento tem que ser ato positivo */
  t(await gdr.locator('input[type="checkbox"]').count()===0,
    'e ele NÃO é uma caixa já marcada — consentimento é ato, não descuido');
  t(await gdr.locator('button.gdrb').count()>0,'é um botão que a pessoa aperta');
  t(/chamado|abrir/i.test(gt),'e diz para que serve o contato');
  t(/nome, praça e funções/.test(gt),'listando o que sobe, campo por campo');
  t(/Nada do que você fez dentro da prévia/.test(gt),'e o que NÃO sobe junto');

  /* ---- deixar contato sem preencher não passa ---- */
  await h.evaluate(()=>{
    const c=document.querySelector('#cd-guardar .gdrc'); if(c) c.value='ab';
    const b=document.querySelector('#cd-guardar .gdrb'); if(b) b.click();
  });
  await h.waitForTimeout(300);
  t(await h.evaluate(()=>{try{return !localStorage.getItem('cdf-guardei')}catch(e){return true}}),
    'contato curto demais não é guardado — nem no aparelho');

  /* ---- e com contato de verdade, a marca fica ---- */
  await h.evaluate(()=>{
    const c=document.querySelector('#cd-guardar .gdrc'); if(c) c.value='84999990000';
    const b=document.querySelector('#cd-guardar .gdrb'); if(b) b.click();
  });
  await h.waitForTimeout(400);
  t(await h.evaluate(()=>{try{return localStorage.getItem('cdf-guardei')==='84999990000'}catch(e){return false}}),
    'com contato válido ele fica marcado no aparelho');
  t(/Anotado/.test(await h.locator('#cd-guardar').textContent()),
    'e a tela confirma, dizendo o contato que ficou');
  /* ⚠️ GUARDEI_KEY NÃO ENTRA EM USO_APAGAVEIS: "recomeçar do zero" limpa o
     protótipo, mas o contato já saiu do aparelho e não volta. Sem esta
     marca, quem recomeçasse mandaria a mesma linha de novo. */
  t(!/USO_APAGAVEIS=\[[^\]]*GUARDEI_KEY/.test(fonte),
    'e ele NÃO é apagado por "recomeçar do zero" — senão a lista nasceria com gente repetida');

  await ctx2.close(); await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  process.exit(bad.length||errs.length?1:0);
})();
