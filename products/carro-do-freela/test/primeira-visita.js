/* O AVISO DA PRIMEIRA VISITA — hoje "SOBRE A PRÉVIA"
 *
 * (17/out · 5) Ele deixou de abrir sozinho. Victor: "tira as mensagens de
 * protótipo … isso tudo é cara de protótipo". A prévia se declara num lugar
 * só: o selo "Prévia" ao lado da marca, à vista em toda tela, abre ESTE
 * resumo. O que o resumo promete continua tendo que ser verdade — as
 * asserções de conteúdo abaixo são as mesmas.
 *
 * Ele é a primeira coisa que qualquer pessoa vê no link, e o que ele
 * promete tem que ser verdade — este é o único texto do produto que fala
 * sobre o produto em vez de sobre o mercado. Quando o registro por nuvem
 * entrou (22/ago), a frase antiga virou mentira no mesmo dia e teve de
 * ser reescrita: até então nada saía do aparelho.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  /* ⚠️ ESTA SUÍTE NÃO USA O PREÂMBULO. Todas as outras marcam `cdf-pv`
     para o aviso não interceptar clique — aqui o aviso É o objeto. */
  await p.goto(URL,{waitUntil:'networkidle'});
  /* espera a abertura sair: desde 17/out · 5 o que se mede é o selo, e o
     véu intercepta o toque enquanto está de pé */
  await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:20000}).catch(()=>{});
  await p.waitForTimeout(500);

  t(await p.locator('#ovl-pv').isHidden(),'⟶⟶ quem abre o link NÃO recebe aviso por cima da home');
  const selo=p.locator('.homenav [data-previa]');
  t(await selo.isVisible()&&/Prévia/.test(await selo.textContent()),'⟶⟶ o selo "Prévia" está à vista, junto da marca');
  await selo.click(); await p.waitForTimeout(300);
  t(await p.locator('#ovl-pv').isVisible(),'tocar no selo abre o resumo da prévia');
  t(await p.locator('#pv-bem').isVisible(),'no estado de "sobre a prévia"');
  t(await p.locator('#pv-zerar').isHidden(),'e não no de apagar, que é o outro estado do mesmo overlay');
  const itens=await p.locator('#ovl-pv .pv-i').count();
  t(itens>=4,'com os pontos que a pessoa precisa saber antes de entrar: '+itens);
  const txt=await p.locator('#ovl-pv').textContent();

  /* ---- o que ele promete tem que ser verdade ---- */
  t(/prévia/i.test(txt)&&/não foi lançado/i.test(txt),'ele diz que é uma prévia e que o produto não foi lançado');
  t(/ilustrativ/i.test(txt)&&/demonstração/i.test(txt),
    'e que pessoas, agendas e números são ilustrativos — de demonstração');
  t(/aparelho|navegador/i.test(txt),'diz que o que a pessoa fizer fica no aparelho');
  /* ⚠️ A FRASE MUDOU QUANDO O REGISTRO ENTROU. Antes dizia que NADA saía
     do aparelho; hoje um número sobe (abriu, começou, terminou) e o
     contato só sai se a pessoa deixar. Contar isso é o mínimo. */
  t(/número|conto quantos/i.test(txt),'e conta que sobe um NÚMERO — sem nome, sem o que foi digitado');
  t(/você escolhe|você quem decide|deixar contato/i.test(txt),
    'e que o contato só sai se a pessoa deixar');
  t(/limpar o navegador|pode sumir/i.test(txt),'avisa que limpar o navegador apaga tudo');
  t(/Safari|tela de início/i.test(txt),'inclusive o detalhe do iPhone, que é o aparelho de quem vai testar');
  t(/balão|suporte|erro/i.test(txt),'e diz por onde falar comigo');

  /* ---- ele intercepta, e é por isso que toda suíte o desliga ---- */
  const cobre=await p.evaluate(()=>{
    const o=document.getElementById('ovl-pv').getBoundingClientRect();
    return o.width>=innerWidth-2&&o.height>=innerHeight-2;
  });
  t(cobre,'ele cobre a tela inteira quando aberto');

  /* ---- e sai com um toque, para sempre ---- */
  await p.locator('#pv-ok').click(); await p.waitForTimeout(350);
  t(await p.locator('#ovl-pv').isHidden(),'"Entendi" fecha');
  await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(500);
  t(await p.locator('#ovl-pv').isHidden()&&await p.locator('.homenav [data-previa]').isVisible(),
    'recarregando, nada abre sozinho — e o selo continua lá');

  /* ============ o outro estado: apagar tudo ============ */
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(170);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);
  await p.evaluate(()=>{const g=v('ovl-guia'); if(g) g.hidden=true});
  await p.evaluate(()=>abrirGaveta()); await p.waitForTimeout(400);
  /* desde 17/out · 10 o "recomeçar do zero" mora em Ajustes, recolhido:
     apagar tudo não fica à mão de quem só abriu o menu */
  { const ab=p.locator('#gaveta [data-sanf="ajustes"] .mn-abre'); if(await ab.getAttribute('aria-expanded')!=='true'){ await ab.click(); await p.waitForTimeout(250) } }
  const gz=p.locator('#g-zerar');
  t(await gz.count()===1,'o menu tem "recomeçar do zero"');
  t(await p.locator('#gaveta [data-previa]').count()===1,'o topo do menu também leva ao resumo da prévia');
  await gz.click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl-pv').isVisible()&&await p.locator('#pv-zerar').isVisible(),
    'que abre o MESMO overlay no estado de apagar');
  t(await p.locator('#pv-bem').isHidden(),'e o de boas-vindas some — um overlay, dois estados');
  const zt=await p.locator('#pv-zerar').textContent();
  t(/apag|zero|volta/i.test(zt),'ele pergunta antes de apagar');
  await p.locator('#pv-zx').click(); await p.waitForTimeout(300);
  t(await p.locator('#ovl-pv').isHidden(),'dá para desistir sem apagar nada');

  await ctx.close(); await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  process.exit(bad.length||errs.length?1:0);
})();
