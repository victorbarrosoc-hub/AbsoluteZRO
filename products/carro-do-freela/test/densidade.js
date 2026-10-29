/* QUANTO CHEGA DE UMA VEZ
 *
 * Um testador: *"é muita informação."* A medição desmontou a solução
 * óbvia — o texto explicativo era **3% a 13% da altura** das telas.
 * Apagar TODA a prosa de "Meu perfil" levava a página de 7,9 para 7,2
 * telas de iPhone. Não é quantas palavras: é quanto chega ABERTO.
 *
 * Três coisas saíram daí, e é o que esta suíte protege:
 *   1. "Meu perfil" virou sanfona — de 7,9 para ~1,7 telas;
 *   2. o brechó abre em duas colunas no celular — de 4,7 para 2,3;
 *   3. as notas de REGRA recolhem junto com o explicador, e as de
 *      ESTADO e de tela vazia ficam, porque são conteúdo.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
/* ⚠️ ORIGEM HTTP (17/out), pela regra da casa: suíte que recarrega nasce
   em http. Esta recarrega para provar que o bloco aberto continua aberto,
   e em `file://` o Chromium descarta o localStorage de vez em quando — ela
   reprovou na bateria completa e passou sozinha, a assinatura exata do
   flake que já tinha levado `orcamento` e `explicador` para o `_servir`. */
const {servir,URL}=require('./_servir.js');
const TELA=844;

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const ctx=await b.newContext({viewport:{width:390,height:TELA},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.setItem('cdf-guia','1');    /* o guia das portas nao cobre a tela */
    localStorage.removeItem('cdf-uso');
  } catch(e) {} });
  /* ⚠️ `cdf-pf-abertos` NÃO PODE SER LIMPO NO addInitScript. Ele roda em
     TODA navegação — inclusive no reload que esta suíte usa para provar
     que o bloco aberto continua aberto. Limpando ali, o teste apagava
     justamente o que ia medir, e acusava o produto por isso. Limpa uma
     vez, depois da primeira carga. */
  await servir(p);
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.evaluate(()=>{try{localStorage.removeItem('cdf-pf-abertos')}catch(e){}});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(170);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(850);

  /* ============ 1. Meu perfil ============ */
  await p.evaluate(()=>show('meu')); await p.waitForTimeout(700);
  const alt=await p.evaluate(()=>Math.round(document.getElementById('v-meu').getBoundingClientRect().height));
  t(alt<TELA*3,'"Meu perfil" cabe em menos de três telas de iPhone: '+(alt/TELA).toFixed(1)+' — era 7,9');
  const cabs=await p.locator('#v-meu .pfhead.san').count();
  t(cabs>=5,'a página virou índice, com '+cabs+' blocos');

  /* ⚠️ FECHADO NÃO É ESCONDIDO: cada cabeça diz o que tem dentro. Sem o
     resumo, a sanfona seria só uma forma nova de perder as coisas. */
  const resumos=await p.evaluate(()=>[...document.querySelectorAll('#v-meu .pfhead.san')]
    .map(c=>({n:(c.querySelector('.lab')||{}).textContent.trim(),
              r:((c.querySelector('[data-pfres]')||{}).textContent||'').trim(),
              ab:c.getAttribute('aria-expanded')==='true'})));
  const fechados=resumos.filter(x=>!x.ab);
  t(fechados.every(x=>x.r.length>0),
    'e todo bloco FECHADO diz o que tem dentro: '+fechados.map(x=>x.n+' → '+x.r).join(' · '));
  t(resumos.filter(x=>x.ab).length===1,'um bloco nasce aberto — ninguém chega numa tela toda fechada');
  /* ⚠️ aberto, o resumo SAI: com o bloco à mostra ele vira eco */
  t(resumos.filter(x=>x.ab).every(x=>x.r===''),'e o aberto perde o resumo, que viraria eco do que está logo abaixo');

  /* ⚠️ O MEDIDOR E O "COMPLETAR CADASTRO" FICAM FORA DA SANFONA. É a
     promessa que a porta curta faz — "o resto você preenche depois" — e
     promessa atrás de seta fechada não é promessa. */
  t(await p.locator('#mp-cad').isVisible(),
    '"Completar cadastro" fica sempre à vista, fora dos blocos');
  const acima=await p.evaluate(()=>{
    const c=document.getElementById('mp-cad').closest('.card');
    const h=document.querySelector('#v-meu .pfhead.san');
    return c.compareDocumentPosition(h)&Node.DOCUMENT_POSITION_FOLLOWING?1:0;
  });
  t(acima===1,'e vem ANTES do índice — é o resumo da página inteira');

  /* ---- abrir e fechar, e o que a pessoa abriu FICA aberto ---- */
  const tab=p.locator('#v-meu .pfhead.san').filter({hasText:'Tabela'});
  await tab.click(); await p.waitForTimeout(450);
  t(await p.locator('#pr-tab').isVisible(),'tocar na cabeça abre o bloco');
  const altAberta=await p.evaluate(()=>Math.round(document.getElementById('v-meu').getBoundingClientRect().height));
  t(altAberta>alt+800,'e a tabela de diária sozinha traz de volta '+(altAberta-alt)+'px — era ela o peso da página');
  await p.reload({waitUntil:'networkidle'});
  /* ⚠️ espera de CONDIÇÃO, não de relógio: a página passou de 2 MB e o boot
     dela sob a carga da bateria estourava os 600ms fixos que moravam aqui —
     a suíte reprovava por corrida, não por defeito. Mesmo padrão do conserto
     da contraste: esperar o splash sair é esperar o boot inteiro. */
  await p.waitForFunction(()=>typeof show==='function'&&!document.getElementById('splash'),
    null,{timeout:20000}).catch(()=>{});
  await p.evaluate(()=>show('meu')); await p.waitForTimeout(600);
  t(await p.locator('#pr-tab').isVisible(),
    'e o que a pessoa abriu continua aberto depois de recarregar — quem mexe na tabela toda semana não reabre toda semana');
  await tab.click(); await p.waitForTimeout(400);
  t(!await p.locator('#pr-tab').isVisible(),'fecha de novo com o mesmo toque');

  /* ============ 2. o brechó em duas colunas ============ */
  await p.evaluate(()=>show('brecho')); await p.waitForTimeout(700);
  const cols=await p.evaluate(()=>getComputedStyle(document.querySelector('.catgrid')).gridTemplateColumns.split(' ').length);
  t(cols===2,'no celular o brechó abre em DUAS colunas de categoria: '+cols);
  const altB=await p.evaluate(()=>Math.round(document.getElementById('v-brecho').getBoundingClientRect().height));
  t(altB<TELA*3,'e cabe em menos de três telas: '+(altB/TELA).toFixed(1)+' — era 4,7');
  /* ⚠️ mexer no padding junto com a coluna cortava o preço dentro do
     cartão: `.catfoto` sobe até a borda com margem negativa casada com o
     padding padrão, e o `overflow:hidden` come o que sobra */
  const corte=await p.evaluate(()=>{
    const c=document.querySelector('.catcard');
    return Math.round(c.scrollHeight-c.clientHeight);
  });
  t(corte<=1,'sem cortar o preço dentro do cartão: '+corte+'px de sobra');
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'e sem overflow horizontal: '+ov);

  /* ============ 3. as notas de regra recolhem ============ */
  await p.evaluate(()=>show('orcar')); await p.waitForTimeout(600);
  const notas=await p.evaluate(()=>{
    const sec=document.getElementById('v-orcar');
    const todas=[...sec.querySelectorAll('.note')];
    return {todas:todas.length, regra:todas.filter(n=>notaEhRegra(n)).length};
  });
  t(notas.todas>5,'o orçamento tem '+notas.todas+' notas');
  t(notas.regra>0&&notas.regra<notas.todas,
    'e '+notas.regra+' delas são REGRA — o resto é estado ou tela vazia, e fica');

  /* ⚠️ A REGRA DE CLASSIFICAÇÃO É DERIVADA, não uma lista à mão que
     envelhece na primeira nota nova: nota com NÚMERO é estado (saldo,
     taxa atual, quantos dias), nota que começa com "Nenhum/Sem" é tela
     vazia, nota com botão dentro é ação. */
  const classifica=await p.evaluate(()=>{
    const d=document.createElement('p'); d.className='note'; document.body.appendChild(d);
    const teste=txt=>{ d.textContent=txt; return notaEhRegra(d) };
    const r={
      regra:teste('Cada função tem o próprio contrato e libera sozinha, então quem edita recebe quando entregar a edição'),
      comNumero:teste('Sua taxa por job é de quatro por cento e 89 reais por mês, e voltando ela sobe de novo para seis'),
      vazia:teste('Nenhuma vaga ainda. Use os botões acima para montar a escala do job que você está fechando agora'),
      curta:teste('Só você vê isto aqui.')
    };
    d.remove(); return r;
  });
  t(classifica.regra,'frase de regra recolhe');
  t(!classifica.comNumero,'frase com número NÃO recolhe — número quase sempre quer dizer estado da conta');
  t(!classifica.vazia,'estado vazio NÃO recolhe — ele é o conteúdo da tela naquele momento');
  t(!classifica.curta,'e legenda curta não conta como explicação');

  /* ---- e elas seguem o "?" da tela, num botão só ----
     ⚠️ O "?" SÓ APARECE NA SEGUNDA VISITA, e é a regra antiga da casa:
     nada recolhe no meio do uso, então na primeira vez a tela abre
     inteira e não há o que reabrir. Aqui a suíte faz o que a pessoa faz —
     visita, volta depois. */
  await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(600);
  await p.evaluate(()=>show('orcar')); await p.waitForTimeout(500);
  const antes=await p.evaluate(()=>{
    const sec=document.getElementById('v-orcar');
    return [...sec.querySelectorAll('.note')].filter(n=>n.classList.contains('rec')).length;
  });
  /* (17/out · 5) SEM "COMO FUNCIONA". Victor: "explicação sobre como
     funciona … é cara de protótipo". A tela não tem mais porta para o
     texto longo, e as notas de regra continuam recolhidas com ele —
     explicação mora na Ajuda. */
  t(await p.locator('#v-orcar .explitog').count()===0,'⟶⟶ a tela não tem "?" nem "Como funciona"');
  t(antes>0,'e as notas de regra continuam recolhidas junto com o texto do topo: '+antes);

  await ctx.close(); await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  process.exit(bad.length||errs.length?1:0);
})();
