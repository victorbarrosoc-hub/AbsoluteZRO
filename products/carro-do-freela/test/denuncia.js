/* DENÚNCIA DE POST E DE COMENTÁRIO
 *
 * A peça que o PRD listava como risco desde a v2.0 e nunca tinha sido
 * desenhada: *rede de nomes reais em praça pequena*. Um post "fulano me
 * deixou na mão" é a regra da casa de não atribuir defeito a pessoa real —
 * só que escrita por um usuário, e não pela plataforma. Com o feed na
 * Fase 1 (decisão do Victor), ela deixou de ser adiável.
 *
 * As três regras duras que esta suíte guarda, e que estão escritas na tela:
 * 1. DENÚNCIA NÃO DERRUBA POST SOZINHA — nada é removido por contagem.
 *    Sem isso vira brigada de denúncia: um grupo combina e derruba quem
 *    quiser, que é a concentração que a casa recusou por dinheiro e não vai
 *    entregar de graça por capital social.
 * 2. NINGUÉM SABE QUEM DENUNCIOU, nem o autor.
 * 3. O QUE SOME AGORA É DA SUA VISTA — a tela não promete que sumiu para
 *    os outros, porque não sumiu.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
/* ⚠️ ORIGEM http, e SEM apagar `cdf-uso` no preâmbulo — os dois por causa
   do mesmo teste, o de sobreviver ao recarregar.
   1. `addInitScript` roda em TODA navegação, o reload incluído: apagar o
      depósito ali é a suíte apagando justamente o que ela vai conferir.
      Contexto novo já nasce com storage limpo, então não há o que apagar.
   2. `file://` descarta o localStorage de vez em quando (~1 em 14 recargas)
      e a falha aparece longe da causa. Regra da casa: suíte que recarrega
      nasce em http. */
const {servir,URL}=require('./_servir.js');
const PRE=pg=>pg.addInitScript(()=>{ try{
  localStorage.setItem('cdf-pv','1');
  localStorage.setItem('cdf-entrou','1');
  localStorage.setItem('cdf-guia','1');
}catch(e){} });

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  /* ⚠️ o envio da denúncia usa a MESMA porta do suporte (Web3Forms), e num
     `file://` sem rede isso vira ruído de console que não é defeito nosso —
     o código já cai na fila local. Mesmo filtro de `registro.js`. */
  p.on('console',m=>{ if(m.type()!=='error') return;
    const txt=m.text();
    if(/web3forms|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource/i.test(txt)) return;
    errs.push(txt); });
  await servir(p); await PRE(p);
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.evaluate(()=>show('feed'));
  await p.waitForTimeout(400);

  /* ============ o botão existe, e não no próprio post ============ */
  let m=await p.evaluate(()=>{
    const meu=POSTS.find(x=>x.autor==='eu');
    return {
      total:document.querySelectorAll('[data-den]').length,
      posts:document.querySelectorAll('.fdpost').length,
      noMeu:meu?!!document.querySelector('[data-post="'+meu.id+'"] [data-den]'):null
    };
  });
  t(m.total>0,'todo post de outra pessoa tem por onde denunciar: '+m.total);
  t(m.noMeu!==true,'e o próprio post não tem — não há o que denunciar em si mesmo');

  /* ============ o modal diz o que precisa dizer ============ */
  await p.locator('[data-den]').first().click(); await p.waitForTimeout(350);
  m=await p.evaluate(()=>({
    aberto:!v('ovl-den').hidden,
    tit:v('dn-t').textContent,
    prev:v('dn-prev').textContent.trim(),
    mots:[...document.querySelectorAll('[data-dnm]')].map(x=>x.dataset.dnm),
    regra:v('dn-regra').textContent,
    okDesligado:v('dn-ok').disabled
  }));
  t(m.aberto&&/post/i.test(m.tit),'o modal abre e diz o que está sendo denunciado');
  t(m.prev.length>10,'e mostra quem escreveu e o que — ninguém denuncia às cegas');
  t(m.mots.includes('pessoa'),'o motivo que motivou a peça está na lista: falar mal de alguém com nome');
  t(m.mots.length>=5&&m.mots.includes('outro'),'a lista é fechada e tem saída: '+m.mots.length+' motivos');
  t(m.okDesligado,'não dá para enviar sem escolher motivo — denúncia sem motivo não é denúncia');
  t(/não derruba post sozinha/i.test(m.regra),'a regra dura está NA TELA: denúncia não derruba post sozinha');
  t(/ninguém fica sabendo que foi você|ninguém sabe/i.test(m.regra),'e que ninguém sabe quem denunciou');

  /* ============ enviar ============ */
  await p.locator('[data-dnm="pessoa"]').click(); await p.waitForTimeout(150);
  t(await p.evaluate(()=>!v('dn-ok').disabled),'escolher o motivo libera o envio');
  const antes=await p.evaluate(()=>document.querySelectorAll('.fdpost').length);
  const alvo=await p.evaluate(()=>+document.querySelector('[data-den]').dataset.den);
  await p.locator('#dn-ok').click(); await p.waitForTimeout(600);
  m=await p.evaluate(a=>({
    n:DENUNCIAS.length, motivo:(DENUNCIAS[0]||{}).motivo, alvoGravado:(DENUNCIAS[0]||{}).alvo,
    fechou:v('ovl-den').hidden,
    posts:document.querySelectorAll('.fdpost').length,
    aindaNoPOSTS:POSTS.some(x=>x.id===a),
    aviso:[...document.querySelectorAll('#avisos .avz')].map(x=>x.textContent).join(' ')
  }),alvo);
  t(m.n===1&&m.motivo==='pessoa','a denúncia é registrada com o motivo escolhido');
  t(m.alvoGravado===alvo,'e aponta para o post certo');
  t(m.fechou,'o modal fecha ao enviar');
  t(m.posts===antes-1,'o post sai da MINHA vista na hora: '+antes+' → '+m.posts);
  t(m.aindaNoPOSTS,'⟶⟶ mas continua existindo — a denúncia NÃO apaga o post de ninguém');
  t(/sua vista/i.test(m.aviso)&&/uma pessoa/i.test(m.aviso),
    'e o aviso diz a verdade: saiu da sua vista, quem decide é uma pessoa');

  /* ============ não se denuncia duas vezes ============ */
  m=await p.evaluate(a=>{
    const antes=DENUNCIAS.length;
    abrirDenuncia('post',a);                 /* tentativa direta, sem passar pela tela */
    return {abriu:!v('ovl-den').hidden, n:DENUNCIAS.length, igual:DENUNCIAS.length===antes};
  },alvo);
  t(!m.abriu&&m.igual,'denunciar o mesmo post de novo não abre nada nem duplica registro');

  /* ============ o que EU denunciei some das DUAS abas ============ */
  m=await p.evaluate(a=>{
    FDP_ABA='praca'; drawFeed();
    const praca=!document.querySelector('[data-post="'+a+'"]');
    FDP_ABA='seguindo'; drawFeed();
    const seg=!document.querySelector('[data-post="'+a+'"]');
    FDP_ABA='praca'; drawFeed();
    return {praca,seg};
  },alvo);
  t(m.praca&&m.seg,'ele some da praça e do seguindo — é a MINHA vista, não uma aba só');

  /* ============ comentário também se denuncia ============ */
  m=await p.evaluate(()=>{
    const pt=POSTS.find(x=>x.coments&&x.coments.some(c=>c.autor!=='eu'));
    if(!pt) return {sem:true};
    const c=pt.coments.find(c=>c.autor!=='eu');
    abrirDenuncia('com',c.id,pt.id);
    return {aberto:!v('ovl-den').hidden, tit:v('dn-t').textContent, cid:c.id, pid:pt.id};
  });
  if(m.sem){ t(false,'não há comentário de terceiro semeado para testar') }
  else {
    t(m.aberto&&/coment/i.test(m.tit),'comentário também se denuncia — é onde o caso de risco mais aparece');
    await p.locator('[data-dnm="pessoa"]').click(); await p.waitForTimeout(120);
    await p.locator('#dn-ok').click(); await p.waitForTimeout(400);
    const r=await p.evaluate(c=>({n:DENUNCIAS.length,
      guardouPai:DENUNCIAS.some(d=>d.tipo==='com'&&d.alvo===c&&d.pai)}),m.cid);
    t(r.n===2,'e a denúncia de comentário entra no mesmo registro');
    t(r.guardouPai,'guardando de qual post ele é — sem isso ninguém acha o comentário depois');
  }

  /* ============ a regra também está nos TERMOS, não só no modal ============ */
  m=await p.evaluate(()=>{
    abrirAjuda('regras');
    const txt=document.getElementById('v-ajuda').textContent;
    return {
      existe:!!AJUDA.regras,
      naoDerruba:/não derruba post sozinha/i.test(txt),
      anonima:/ninguém sabe quem denunciou/i.test(txt),
      oQueSai:/fala mal de uma pessoa identificada|pessoa identificada/i.test(txt),
      oQueNaoSai:/crítica de trabalho sem apontar pessoa/i.test(txt),
      suaVista:/sua vista/i.test(txt)
    };
  });
  t(m.existe,'existe um artigo de regras do feed');
  t(m.oQueSai,'ele diz o que SAI — o limite é a pessoa identificada');
  t(m.oQueNaoSai,'⟶⟶ e o que NÃO sai: crítica sem apontar pessoa fica. Feed que só aceita elogio não serve');
  t(m.naoDerruba,'a regra de não remover por contagem está nos termos, não só no modal');
  t(m.anonima,'e a de ninguém saber quem denunciou também');
  t(m.suaVista,'e ele é honesto sobre o que some para quem: a sua vista');

  /* ============ sobrevive ao recarregar ============ */
  await p.goto(URL,{waitUntil:'networkidle'}); await p.waitForTimeout(600);
  m=await p.evaluate(()=>({n:DENUNCIAS.length}));
  t(m.n>=1,'a denúncia sobrevive ao recarregar — senão o post volta a aparecer sozinho');

  t(errs.length===0,'zero erro de console/página'+(errs.length?' — '+errs[0]:''));

  console.log('DENUNCIA');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();
