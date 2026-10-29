/* O CATÁLOGO PASSOU A SUGERIR ENQUANTO SE DIGITA
 *
 * O catálogo existia e só respondia a quem já sabia o nome exato: ele
 * procurava o que a pessoa tinha digitado INTEIRO ("a7 iv"), e quem
 * escrevia "son" ou "trip" não recebia nada. Catálogo que só serve para
 * quem já não precisa dele.
 *
 * E duas das nove categorias da casa — tripé e acessório — existiam em
 * `CATS` e em `DEPREC` sem UM item no catálogo: quem anunciava um tripé
 * preenchia a ficha inteira e o avaliador ficava mudo. É a mesma raiz do
 * *"drone tá em acessório"* que um testador apontou: o suporte é a parte
 * do equipamento em que a plataforma menos tinha pensado.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const ctx=await b.newContext({viewport:{width:1280,height:1200},deviceScaleFactor:2});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.setItem('cdf-guia','1');    /* o guia das portas nao cobre a tela */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(170);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);

  /* ============ nenhuma categoria fica sem catálogo ============ */
  const vazias=await p.evaluate(()=>
    Object.keys(CATS).filter(k=>!CATALOGO.some(c=>c.cat===k)));
  t(vazias.length===0,
    'toda categoria da casa tem item no catálogo — tripé e acessório não tinham nenhum'
    +(vazias.length?': '+vazias.join(', '):''));
  const total=await p.evaluate(()=>CATALOGO.length);
  t(total>=70,'o catálogo tem '+total+' itens');
  /* ⚠️ item sem categoria válida quebraria `CATS[c.cat].nome` na sugestão */
  const soltos=await p.evaluate(()=>CATALOGO.filter(c=>!CATS[c.cat]).map(c=>c.nome));
  t(soltos.length===0,'e todo item aponta para uma categoria que existe'
    +(soltos.length?': '+soltos.join(', '):''));

  /* ============ a busca ============ */
  const busca=async q=>p.evaluate(x=>sugerirCatalogo(x).map(c=>c.nome),q);
  t((await busca('a')).length===0,'uma letra não sugere nada — lista inteira não é sugestão');
  const son=await busca('son');
  t(son.length>0&&son.every(n=>/sony/i.test(n)),'"son" já acha as Sony: '+son.length+' itens');
  t((await busca('godox')).length>0,'acha por APELIDO mesmo fora do nome: "godox" → Godox SL60');
  const trinta=await busca('35');
  t(trinta.length>=3&&trinta.every(n=>/35/.test(n)),'acha por pedaço de número: "35" → '+trinta.join(', '));
  /* ⚠️ quem digita as primeiras letras está escrevendo o COMEÇO do nome */
  const mini=await busca('mini');
  t(/DJI Mini/.test(mini[0]),'"mini" devolve o DJI Mini antes do Mac Mini: '+mini.join(' | '));
  /* ⚠️ digitar a CATEGORIA é navegar, não buscar — e usa o mesmo campo */
  const tripes=await busca('tripé');
  t(tripes.length>=5,'"tripé" lista a categoria inteira, não só os que têm a palavra no nome: '+tripes.length);
  t(tripes.some(n=>/C-stand|Girafa|Monopé/.test(n)),
    'inclusive os que ninguém chamaria de tripé ao digitar: '+tripes.join(', '));
  t((await busca('luz')).length>=4,'e "luz" lista as luzes');
  t((await busca('monitor')).length>=1,'"monitor" acha o Atomos — a palavra do set, não a da caixa');
  const duas=await busca('sony 85');
  t(duas.length===1&&/85/.test(duas[0]),'duas palavras somam: "sony 85" → '+duas.join(', '));
  t((await busca('zzznaoexiste')).length===0,'termo sem match devolve vazio, sem quebrar');
  const teto=await p.evaluate(()=>sugerirCatalogo('so').length);
  t(teto>0&&teto<=6,'a lista tem teto de 6 — sugestão longa vira catálogo, e catálogo já existe: '+teto);

  /* ============ na tela do inventário ============ */
  await p.evaluate(()=>{painelBrecho('inv');show('brecho')}); await p.waitForTimeout(500);
  await p.evaluate(()=>abrirItem(null)); await p.waitForTimeout(450);
  t(await p.locator('#iv-sugs').count()===1,'o campo de nome do inventário tem lista de sugestão');
  t(await p.locator('#iv-sugs .sug').count()===0,'que começa vazia');
  /* ⚠️ vazia PRECISA sumir: `.sugs` tem borda, e um `div` vazio desenharia
     uma barra de dois pixels embaixo do campo o tempo todo */
  t(await p.locator('#iv-sugs').evaluate(e=>getComputedStyle(e).display)==='none',
    'e vazia ela nem ocupa espaço — a borda apareceria sozinha embaixo do campo');

  await p.fill('#iv-nome','trip'); await p.waitForTimeout(300);
  const n=await p.locator('#iv-sugs .sug').count();
  t(n>0,'digitar "trip" abre a lista: '+n+' sugestões');
  const primeira=await p.locator('#iv-sugs .sug').first().textContent();
  t(/Tripé e suporte/.test(primeira),'com a CATEGORIA junto, para escolher o item certo');
  t(/tabela R\$/.test(primeira),'e o valor de tabela — é o que a pessoa vai usar como referência');

  await p.locator('#iv-sugs .sug').first().click(); await p.waitForTimeout(400);
  t(await p.inputValue('#iv-nome')==='Benro Tripé Vídeo S-Series','escolher preenche o nome');
  t(await p.$eval('#iv-cat',e=>e.value)==='tripe','e troca a categoria sozinho — a ficha muda com ela');
  t(+(await p.inputValue('#iv-ref'))>0,'e já põe o preço de tabela como referência: '+await p.inputValue('#iv-ref'));
  t(await p.locator('#iv-sugs .sug').count()===0,'a lista some depois de escolher');
  /* ⚠️ ela some POR ESTADO, não porque o clique tirou o foco. Antes disso
     funcionava por acidente: o `blur` limpava a lista 180ms depois. */
  await p.evaluate(()=>v('iv-nome').dispatchEvent(new Event('input')));
  await p.waitForTimeout(200);
  t(await p.locator('#iv-sugs .sug').count()===0,
    'e continua sumida mesmo se a digitação for reprocessada — não é o blur que a esconde');
  t(/Benro/.test(await p.locator('#iv-achou').textContent()),
    'o cartão de confirmação reconhece o nome COMPLETO que a lista acabou de preencher');
  await p.fill('#iv-nome','ninja'); await p.waitForTimeout(300);
  t(await p.locator('#iv-sugs .sug').count()>0,'mudar o texto volta a sugerir');

  /* ============ e no anúncio do brechó, que é o outro campo ============ */
  await p.evaluate(()=>{v('ovl20').hidden=true;document.body.style.overflow=''});
  await p.evaluate(()=>abrirNovoAnuncio()); await p.waitForTimeout(500);
  t(await p.locator('#nv-sugs').count()===1,'o anúncio também sugere');
  await p.fill('#nv-titulo','amaran'); await p.waitForTimeout(300);
  const na=await p.locator('#nv-sugs .sug').count();
  t(na>0,'"amaran" abre a lista no anúncio: '+na);
  await p.locator('#nv-sugs .sug').first().click(); await p.waitForTimeout(450);
  t(/Amaran/.test(await p.inputValue('#nv-titulo')),'escolher preenche');
  t(await p.$eval('#nv-cat',e=>e.value)==='luz','e a categoria vira luz');
  t(+(await p.inputValue('#nv-ref'))>0,'com a referência preenchida: '+await p.inputValue('#nv-ref'));

  /* ============ onde a pessoa DECLARA o que tem ============
     Victor, com o exemplo exato: *"digito A7… aí completasse com a
     sugestão: A7IV ou A7III."* O autocompletar nasceu no inventário e no
     anúncio e não alcançava os campos do perfil nem do cadastro — que são
     onde a digitação livre mais dói. */
  await p.evaluate(()=>{document.querySelectorAll('.ovl').forEach(o=>o.hidden=true);document.body.style.overflow='';show('meu')});
  await p.waitForTimeout(500);
  await p.evaluate(()=>{pfLer().add('Meu equipamento');sanfonaPerfil()}); await p.waitForTimeout(350);
  await p.fill('#pf-cam-novo','A7'); await p.waitForTimeout(300);
  const a7=await p.locator('#pf-cam-sugs .sug').allTextContents();
  t(a7.length>=3,'o exemplo do pedido: "A7" sugere '+a7.length+' corpos');
  t(a7.some(x=>/A7 IV/.test(x))&&a7.some(x=>/A7 III/.test(x)),'incluindo A7 IV e A7 III');
  t(a7.every(x=>!/Lente|Tripé|Luz/.test(x)),
    'e SÓ câmera — o campo de corpos não sugere lente, seria a lista contradizendo o rótulo acima dela');
  t(a7.every(x=>!/R\$/.test(x)),
    'sem preço de tabela: aqui a pessoa declara o que TEM, e preço seria a plataforma avaliando sem ninguém pedir');
  t(a7.every(x=>!/Câmera/.test(x)),
    'e sem a etiqueta "Câmera" repetida — num campo filtrado ela só ecoaria o rótulo');

  /* ⚠️ escolher JÁ vira chip: segundo toque no "Adicionar" seria devolver
     metade do atrito que a sugestão tirou */
  const chipsAntes=await p.locator('#pf-cams .eqchip').count();
  await p.locator('#pf-cam-sugs .sug').filter({hasText:'A7 IV'}).click(); await p.waitForTimeout(400);
  t(await p.locator('#pf-cams .eqchip').count()===chipsAntes+1,'escolher já adiciona o chip, sem segundo toque');
  t(await p.inputValue('#pf-cam-novo')==='','e o campo limpa para o próximo');
  t((await p.locator('#pf-cams .eqchip').allTextContents()).some(x=>/Sony A7 IV/.test(x)),
    'com o nome canônico do catálogo — é o que faz "quem tem A7 IV" achar na busca');

  await p.fill('#pf-len-novo','24-70'); await p.waitForTimeout(300);
  const lens=await p.locator('#pf-len-sugs .sug').allTextContents();
  t(lens.length>=2&&lens.every(x=>/24-70/.test(x)),'o campo de lentes sugere só lente: '+lens.length);

  /* ============ o cadastro, em modo fragmento ============
     estes campos guardam VÁRIOS itens numa linha — a sugestão vale para o
     pedaço depois da última vírgula, e escolher completa SÓ ele */
  await p.evaluate(()=>{cadTodo=true;abrirCadastro('meu');irPasso(3)}); await p.waitForTimeout(500);
  await p.fill('#cd-cam','Sony FX3, a7s'); await p.waitForTimeout(300);
  const frag=await p.locator('#cd-cam-sugs .sug').allTextContents();
  t(frag.length>=1&&/A7S/.test(frag[0]),'com "Sony FX3, a7s" a sugestão olha só o pedaço novo: '+frag[0]);
  await p.locator('#cd-cam-sugs .sug').first().click(); await p.waitForTimeout(300);
  t(await p.inputValue('#cd-cam')==='Sony FX3, Sony A7S III',
    'e escolher completa o fragmento SEM apagar o que já estava escrito');
  /* ⚠️ campo preenchido por código não dispara `input` sozinho, e o
     cadastro salva EU.cam justamente ali — sem o dispatch, a pessoa veria
     o valor na tela e o perfil nunca receberia */
  t(await p.evaluate(()=>EU.cam)==='Sony FX3, Sony A7S III',
    'e o dado CHEGA ao perfil — o preenchimento dispara o mesmo evento da digitação');

  /* ============ mobile ============ */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  await p.fill('#cd-cam','fx'); await p.waitForTimeout(300);
  t(await p.locator('#cd-cam-sugs .sug').count()>0,'no celular também');
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal: '+ov);
  const corta=await p.evaluate(()=>{
    const s=document.querySelector('#cd-cam-sugs .sug');
    return s?Math.round(s.scrollWidth-s.clientWidth):0;
  });
  t(corta<=1,'e o nome do item não corta dentro da linha: '+corta);
  await p.screenshot({path:path.join(__dirname,'saida','catalogo-autocompletar.png')});

  await ctx.close(); await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  process.exit(bad.length||errs.length?1:0);
})();
