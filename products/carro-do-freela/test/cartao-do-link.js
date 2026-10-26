/* O CARTÃO QUE APARECE QUANDO ALGUÉM COLA O LINK NUM CHAT
 *
 * ⚠️ ESTE DEFEITO É INVISÍVEL DE DENTRO: sem as meta tags a página abre
 * perfeita, não há erro no console e nenhuma outra suíte reclama — só o
 * WhatsApp mostra a URL pelada, no exato momento em que alguém está
 * passando o link adiante.
 *
 * ⚠️ E A RÉGUA DA DESCRIÇÃO NÃO É CARACTERE, É LINHA RENDERIZADA. O
 * WhatsApp mostra DUAS linhas e corta o resto; duas frases de 92
 * caracteres podem uma caber e a outra não, dependendo de onde as palavras
 * quebram. Por isso esta suíte abre um navegador em vez de contar letras.
 */
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const RAIZ=path.resolve(__dirname,'..');
const ARQ=path.join(RAIZ,'public','index.html');

(async()=>{
  const html=fs.readFileSync(ARQ,'utf8');
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:400,height:400}});
  await p.setContent(html.slice(0,html.indexOf('</head>')+7)+'<body></body>');

  const meta=async n=>p.evaluate(sel=>{
    const el=document.querySelector(sel); return el?el.getAttribute('content'):null;
  },n);

  /* ============ o documento tem cabeça ============
     ⚠️ o template começa direto no <title> porque nasceu para virar
     artifact — quem monta doctype/head/body é o visualizador. Servido por
     conta própria, esse "por fora" não existe. */
  t(/^<!doctype html>/i.test(html),'index.html é documento completo, com doctype');
  /* ⚠️ PERGUNTAR AO DOM, NÃO AO TEXTO. Estas duas asserções nasceram como
     grep no arquivo e acusaram falso: o produto gera OUTROS documentos
     (`folhaDoc`), cada um com o próprio viewport dentro de uma string, e
     `viewport-fit=cover` aparece num COMENTÁRIO explicando por que ele não
     está lá. Texto do arquivo não é o que o navegador monta. */
  const vp=await meta('meta[name="viewport"]');
  t(!!vp,'o <head> tem viewport — sem ela o celular monta a página em 980px e encolhe: '+vp);
  t(!/viewport-fit=cover/.test(vp||''),
    'SEM viewport-fit=cover, e é decisão: com ele o Safari deixa uma faixa embaixo por onde o conteúdo aparece atrás da barra');
  t(await p.evaluate(()=>document.querySelectorAll('head meta[name="viewport"]').length)===1,
    'e só UMA — duas viewports deixam o navegador escolher, e ele escolhe a errada');

  /* ============ as tags do cartão ============ */
  const tit=await meta('meta[property="og:title"]');
  const desc=await meta('meta[property="og:description"]');
  const img=await meta('meta[property="og:image"]');
  t(!!tit,'og:title existe: "'+tit+'"');
  t(!!desc,'og:description existe');
  t(!!img,'og:image existe');
  /* ⚠️ ENDEREÇO ABSOLUTO: o robô do WhatsApp busca a imagem numa
     requisição PRÓPRIA, sem saber de que página veio. */
  t(/^https?:\/\//.test(img||''),'e é endereço absoluto — o robô busca a imagem sozinho: '+img);
  t(await meta('meta[property="og:image:width"]')==='1200'
    &&await meta('meta[property="og:image:height"]')==='630',
    'com largura e altura declaradas — ele decide entre cartão grande e miniatura ANTES de baixar');
  t(await meta('meta[name="twitter:card"]')==='summary_large_image','e o cartão grande no Twitter');
  t(await meta('meta[property="og:locale"]')==='pt_BR','com o idioma certo');

  /* ⚠️ og.jpg NÃO sai do build: sai de `node docs/gerar-og.cjs` e precisa
     subir junto. Apontar para arquivo que não existe dá o mesmo resultado
     de não ter tag nenhuma. */
  const jpg=path.join(RAIZ,'public','og.jpg');
  t(fs.existsSync(jpg),'e o arquivo og.jpg existe em public/ — sem ele a tag aponta para o vazio');
  if(fs.existsSync(jpg)){
    const kb=Math.round(fs.statSync(jpg).size/1024);
    t(kb>10&&kb<300,'com tamanho de cartão, não de pôster: '+kb+' KB');
  }

  /* ============ a descrição cabe em duas linhas ============ */
  const cabe=await p.evaluate(d=>{
    const box=document.createElement('div');
    /* a caixa do WhatsApp: ~300px úteis, 14px, system-ui */
    box.style.cssText='position:fixed;left:0;top:0;width:300px;font:14px system-ui,-apple-system,sans-serif;line-height:19px;visibility:hidden';
    box.textContent=d; document.body.appendChild(box);
    const linhas=Math.round(box.getBoundingClientRect().height/19);
    box.remove(); return linhas;
  },desc);
  t(cabe<=2,'a descrição cabe nas DUAS linhas que o WhatsApp mostra: '+cabe+' linha(s)');
  t(desc.length>40,'e não é curta demais para dizer o que é: '+desc.length+' caracteres');

  /* ============ o título diz o que é, e para quem ============ */
  t(/Carro do Freela/.test(tit),'o título traz o nome do produto');
  t(/Natal|audiovisual/i.test(tit+' '+desc),'e o cartão diz de que mercado se trata');

  await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, 0 erros');
  process.exit(bad.length?1:0);
})();
