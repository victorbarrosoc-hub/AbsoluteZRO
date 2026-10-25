/* O BRECHÓ CHEGANDO AO FEED
 *
 * Felipe (25/ago, testador, em áudio): *"não sei se a galera vai engajar e
 * postar umas parada."* Ele tem razão ENQUANTO o feed depender de alguém
 * decidir escrever. O anúncio do brechó é o único conteúdo que já é
 * subproduto de trabalho que a pessoa faz de qualquer jeito.
 *
 * ⚠️ O QUE ESTA SUÍTE GUARDA, ACIMA DE TUDO: que o cartão é DERIVADO e não
 * FABRICADO. Não entra em POSTS, não usa a classe `.fdpost`, e não nasce
 * com curtida nem comentário. Anúncio contado como post seria a plataforma
 * se gabando de um engajamento que não aconteceu — e as suítes que medem
 * `.fdpost` passariam a medir mentira.
 */
const { chromium } = require('playwright');
const path = require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const errs=[];
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});
  const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await p.addInitScript(()=>{ try{
    localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-entrou','1');
    localStorage.setItem('cdf-guia','1'); }catch(e){} });
  await p.goto(URL);
  await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:20000}).catch(()=>{});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(900);

  /* ============ 1. o anúncio aparece, e aparece COMO anúncio ============ */
  const r1=await p.evaluate(()=>{
    FDP_ABA='praca'; drawFeed();
    const el=document.getElementById('fdp-lista');
    const cartoes=[...el.querySelectorAll('.fdanu')];
    const c=cartoes[0];
    return {
      quantos:cartoes.length,
      naoEhPost:!el.querySelector('.fdanu.fdpost'),
      etiqueta:c?((c.querySelector('.fdanuet')||{}).textContent||''):'',
      temPreco:!!(c&&/R\$/.test(c.textContent)),
      semCurtir:!!c&&!c.querySelector('[data-curtir]')&&!c.querySelector('[data-com]')
                   &&!c.querySelector('[data-comp]'),
      nadaEmPosts:!POSTS.some(x=>x.anuncio||x.tipo==='anuncio')
    };
  });
  t(r1.quantos>0,'a praça mostra anúncio do brechó no feed ('+r1.quantos+' cartões)');
  t(r1.naoEhPost,'⟶⟶ e o cartão NÃO usa a classe `.fdpost` — as suítes que contam post '
    +'continuam contando post, não anúncio');
  t(/à venda no brechó/.test(r1.etiqueta),
    'a etiqueta diz de onde veio: "'+r1.etiqueta.trim()+'"');
  t(r1.temPreco,'o preço está no cartão — quem passa no feed já sabe se cabe no bolso');
  t(r1.semCurtir,'⟶⟶ sem curtir, comentar ou compartilhar: ninguém escreveu isto, e '
    +'curtida de brinde seria engajamento inventado');
  t(r1.nadaEmPosts,'⟶⟶ e nada foi empurrado para dentro de POSTS — o cartão é derivado, '
    +'não é um post fabricado na voz da pessoa');

  /* ============ 2. vendido e reservado NÃO aparecem ============ */
  const r2=await p.evaluate(()=>{
    const dispo=ANUNCIOS.filter(a=>a.estadoVenda==='disponivel').length;
    const fora=ANUNCIOS.filter(a=>a.estadoVenda!=='disponivel');
    const ids=[...document.querySelectorAll('#fdp-lista .fdanu')].map(x=>+x.dataset.fdanuc);
    return {dispo, casou:ids.length===dispo,
      nenhumFora:!fora.some(a=>ids.includes(a.id)), quantosFora:fora.length};
  });
  t(r2.casou,'aparecem exatamente os anúncios de pé ('+r2.dispo+')');
  t(r2.quantosFora>0&&r2.nenhumFora,
    '⟶⟶ vendido e reservado somem sozinhos ('+r2.quantosFora+' fora) — anunciar de novo '
    +'o que já foi vendido é fazer a pessoa perder a viagem');

  /* ============ 3. a hora vem de `dias`, e a lista é UMA só ============ */
  const r3=await p.evaluate(()=>{
    /* ⚠️ REPINTA ANTES DE MEDIR. A hora do anúncio é "N dias atrás de
       AGORA": ordenar num instante e conferir noutro abre um vão de
       segundos em que um post de idade quase igual troca de lado — a
       suíte reprovava por corrida na bateria, não por defeito no feed. */
    drawFeed();
    const filhos=[...document.getElementById('fdp-lista').children];
    const mist=filhos.some((x,i)=>i&&x.className!==filhos[i-1].className);
    const horas=filhos.map(x=>{
      if(x.classList.contains('fdanu')){
        const a=ANUNCIOS.find(y=>y.id===+x.dataset.fdanuc);
        return Date.now()-(a.dias||0)*86400000;
      }
      const pt=POSTS.find(y=>y.id===+x.dataset.post);
      return pt?+pt.q:0;
    });
    /* ⚠️ TOLERÂNCIA, e ela não é afrouxar a asserção: a hora do anúncio é
       "N dias atrás de AGORA", e este `Date.now()` roda milissegundos
       DEPOIS do que rodou na pintura. Dois itens de idade quase idêntica
       não têm ordem garantida entre si — exigir isso é exigir que o
       relógio não ande, não que o feed esteja certo. Fora da margem, a
       ordem continua sendo cobrada byte a byte. */
    const FOLGA=5000;
    return {mist, ordenado:horas.every((h,i)=>!i||horas[i-1]>=h-FOLGA),
      variados:new Set(horas).size>1};
  });
  t(r3.mist,'post e anúncio se misturam na mesma lista — "seção de anúncios" no fim é '
    +'seção que ninguém rola até');
  t(r3.ordenado&&r3.variados,
    '⟶⟶ e a ordem é a do relógio: a hora do anúncio sai de `dias`, senão todo anúncio '
    +'entraria no topo como se fosse de agora');

  /* ============ 4. o cartão LEVA ao anúncio de verdade ============ */
  const alvo=await p.evaluate(()=>+document.querySelector('#fdp-lista .fdanu').dataset.fdanuc);
  await p.locator('#fdp-lista .fdanu [data-fdanu]').first().click();
  await p.waitForTimeout(600);
  const r4=await p.evaluate(()=>({
    aberto:(typeof anuncioAtual==='object'&&anuncioAtual)?anuncioAtual.id:null,
    titulo:(document.getElementById('a-titulo')||{}).textContent||''
  }));
  t(r4.aberto===alvo,'⟶⟶ tocar no cartão abre o anúncio DE VERDADE, não uma cópia: preço, '
    +'ficha, ressalvas e proposta moram no brechó, e é lá que a compra acontece');
  t(r4.titulo.length>0,'e a tela do anúncio veio preenchida ("'+r4.titulo.slice(0,34)+'")');

  /* ============ 5. "Seguindo" só traz quem eu sigo ============ */
  const r5=await p.evaluate(()=>{
    const guarda=[...FAV];
    FAV.clear(); FDP_ABA='seguindo'; drawFeed();
    const semSeguir=[...document.querySelectorAll('#fdp-lista .fdanu')].map(x=>+x.dataset.fdanuc);
    const meus=ANUNCIOS.filter(a=>a.dono===EU.id&&a.estadoVenda==='disponivel').map(a=>a.id);
    const outro=ANUNCIOS.find(a=>a.dono!==EU.id&&a.estadoVenda==='disponivel');
    FAV.add(outro.dono); drawFeed();
    const comSeguir=[...document.querySelectorAll('#fdp-lista .fdanu')].map(x=>+x.dataset.fdanuc);
    FAV.clear(); guarda.forEach(x=>FAV.add(x));
    return {qtd:semSeguir.length, soMeus:semSeguir.every(id=>meus.includes(id)),
      entrou:comSeguir.includes(outro.id)};
  });
  t(r5.soMeus,'sem seguir ninguém, "Seguindo" só traz os meus anúncios ('+r5.qtd+')');
  t(r5.entrou,'e seguir a pessoa traz o anúncio dela para a aba');

  /* ============ 6. sem banner de demonstração no feed (17/out · 5) ============ */
  /* (17/out · 5) A PRÉVIA SE DECLARA NUM LUGAR SÓ. Victor: "tira as mensagens
     de protótipo". O banner desta tela saiu; quem diz o que é ilustrativo é o
     selo "Prévia" ao lado da marca — e é ele que esta asserção cobra. */
  const r6=await p.evaluate(()=>{
    FDP_ABA='praca'; drawFeed();
    const r={banner:!!document.getElementById('fdp-demo'),
      texto:/demonstra/i.test(document.getElementById('v-feed').innerText),
      selo:[...document.querySelectorAll('[data-previa]')].some(b=>b.offsetParent!==null)};
    /* e o dia 1 de verdade (nada postado, nada anunciado) continua com saída */
    const gPosts=POSTS.splice(0,POSTS.length), gAnu=ANUNCIOS.splice(0,ANUNCIOS.length);
    drawFeed();
    r.txt=document.getElementById('fdp-lista').textContent.trim().slice(0,90);
    ANUNCIOS.push(...gAnu); POSTS.push(...gPosts); drawFeed();
    return r;
  });
  t(!r6.banner&&!r6.texto,'⟶⟶ o feed não carrega banner nem frase de demonstração');
  t(r6.selo,'e a prévia continua declarada — no selo ao lado da marca');
  t(/calada/.test(r6.txt),'o vazio da praça continua sendo o que tem saída: "'
    +r6.txt.split('\n')[0].slice(0,50)+'"');

  /* ============ 7. fase: sem brechó de venda, sem cartão ============ */
  const fonte=require('fs').readFileSync(
    path.resolve(__dirname,'..','src','template.html'),'utf8');
  t(/faseTem\(FASE_BP\.vender\)/.test(fonte),
    '⟶⟶ o feed só busca anúncio na fase em que o brechó de venda existe — cartão '
    +'apontando para uma tela que ainda não abriu é porta pintada na parede');

  t(errs.length===0,'zero erro de console'+(errs.length?' — '+errs[0]:''));

  console.log('ANÚNCIO NO FEED');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await ctx.close(); await b.close();
  process.exit(bad.length?1:0);
})();
