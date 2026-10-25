/* AS VERSÕES DO ROADMAP — um protótipo por fase, do mesmo fonte.
 *
 * Victor: "a partir do Roadmap Faseado vc refaz os protótipos com as
 * versões de lá. Um protótipo pra cada versão."
 *
 * O que esta suíte jura:
 * 1. O BUILD PADRÃO NÃO MUDA. `FASE=0` faz todo portão virar no-op — é a
 *    razão de as outras 64 suítes continuarem valendo.
 * 2. Cada fase mostra só o que ela entrega, e as fases são CUMULATIVAS.
 * 3. A Fase 1 não promete dinheiro que não existe: sem carteira, sem
 *    contrato, sem sinal — e `comGarantia` devolve falso, então fechar
 *    escala ali é acerto direto, que é o que a fase é de verdade.
 * 4. A porta de entrada existe na fase: o login não cai numa tela que
 *    aquela versão não tem.
 * 5. O gate sobrevive à troca de chapéu (foi o defeito real: `aplicarModo`
 *    reescreve o hidden de toda aba e desfazia o gate).
 */
const { chromium } = require('playwright');
const path=require('path');
const fs=require('fs');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const PRE=pg=>pg.addInitScript(()=>{ try{
  localStorage.setItem('cdf-pv','1');
  localStorage.setItem('cdf-entrou','1');
  localStorage.setItem('cdf-guia','1');
  localStorage.removeItem('cdf-uso');
}catch(e){} });
const arq=f=>path.resolve(__dirname,'..','public',f?('fase-'+f+'.html'):'index.html');

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

  /* ============ os seis arquivos existem ============ */
  const faltando=[1,2,3,4,5,6].filter(f=>!fs.existsSync(arq(f)));
  t(faltando.length===0,'os seis protótipos foram gerados'+(faltando.length?' — faltam: '+faltando.join(', '):''));
  if(faltando.length){ console.log('VERSOES'); bad.forEach(m=>console.log('  ✗ '+m)); await b.close(); process.exit(1) }

  /* ⚠️ ESTA SUÍTE TESTA ARQUIVOS, NÃO O TEMPLATE — e arquivo velho passa
     verde testando código que não existe mais.

     Custou uma bateria inteira em 12/set. `npm run build` regenera só o
     index; as seis fases só são regeneradas por `npm run publicar` (ou,
     agora, por `npm run build:fases`). Depois de uma leva que mexeu no
     brechó, `fase-1.html` estava fresco — eu tinha rodado `--fase=1` à mão
     para sondar — e as fases 2 a 6 continuavam sendo o build de duas
     semanas antes. A suíte estourou com `ReferenceError: anGar is not
     defined`, que não diz nada sobre a causa e manda o operador caçar
     escopo de JavaScript por meia hora.

     O caso PERIGOSO é o silencioso, e é por ele que esta asserção existe:
     se a leva não tivesse tocado em nada que a suíte olha, ela teria
     passado VERDE contra seis arquivos velhos — dando por testado um
     produto que ninguém construiu. Comparar mtime é o detector mais barato
     que existe, e é irmão do `assert` na âncora dos patches. */
  const tpl=fs.statSync(path.resolve(__dirname,'..','src','template.html')).mtimeMs;
  const velhos=[0,1,2,3,4,5,6].filter(f=>fs.statSync(arq(f)).mtimeMs<tpl);
  t(velhos.length===0,
    'os builds estão mais novos que o template'+(velhos.length
      ? ' — DEFASADOS: '+velhos.map(f=>f?'fase-'+f:'index').join(', ')+
        '. Rode `npm run build:fases` e repita a bateria; o que vem abaixo testou código velho.'
      : ''));

  const ler=async(f)=>{
    const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});
    const p=await ctx.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
    p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
    await PRE(p);
    await p.goto('file://'+arq(f),{waitUntil:'networkidle'});
    await p.waitForTimeout(350);
    /* a HOMEPAGE por fase — lida antes de entrar, porque é o que um
       visitante vê sem conta. A regra é a das vitrines: a página não
       vende o que a fase não faz. */
    const home=await p.evaluate(()=>{
      const vis=el=>!!el&&el.offsetParent!==null;
      return {
        hero:v('hh-t').textContent+' — '+v('hh-s').textContent,
        /* ⚠️ regra de 24/ago: FASE É INFORMAÇÃO INTERNA. A homepage não
           pode se anunciar como "versão N" nem mostrar o roadmap. */
        falaVersao:/[Vv]ersão \d|[Ff]ase \d|chega na V\d/.test(v('v-home').innerText),
        temEstrada:!!document.getElementById('h-estrada'),
        gar:vis(document.getElementById('h-gar')),
        garF1:vis(document.getElementById('hg-f1')),
        moeda:!document.getElementById('h-moeda').hidden,
        planosHome:[...document.querySelectorAll('#h-planos .plano')]
          .filter(x=>!x.hidden).map(x=>x.querySelector('h3').textContent.trim().split(' ')[0]),
        passo4:[...document.querySelectorAll('#h-como .passo')]
          .filter(vis).map(x=>x.querySelector('b').textContent),
        chips:document.querySelectorAll('.hj-chip').length,
        vendeDinheiro:v('v-home').innerText.split('\n')
          .filter(l=>/20%|sinal|garantia|taxa de \d/i.test(l)).length
      };
    });
    await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(250);
    await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(180);
    await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(700);
    const r=await p.evaluate(()=>{
      const vis=el=>el&&el.offsetParent!==null;
      abrirGaveta();
      /* desde 17/out · 10 a gaveta tem grupos recolhidos (Brechó, Ajuda,
         Ajustes): abre todos antes de ler — fechado não é "fora da fase",
         e ler só o que está aberto daria verde por motivo nenhum */
      document.querySelectorAll('#gaveta .mn-abre[aria-expanded="false"]').forEach(b=>b.click());
      const mapa=[...document.querySelectorAll('.gaveta .gitem')].filter(vis)
        .map(e=>e.textContent.trim().split('\n')[0]);
      fecharGaveta();
      const barra=[...document.querySelectorAll('.bottombar .bt')].filter(vis).map(e=>e.textContent.trim());
      /* o gate tem que sobreviver à troca de chapéu */
      MODO='contratante'; aplicarModo();
      const barraProd=[...document.querySelectorAll('.bottombar .bt')].filter(vis).map(e=>e.textContent.trim());
      MODO='freela'; aplicarModo();
      return {
        FASE, tela:S.tab, mapa, barra, barraProd,home:null,
        chip:!document.getElementById('fasechip').hidden,
        carteira:vis(document.getElementById('saldo-top')),
        garantia:comGarantia({exige:true,aceita:true}),
        contrato:blocoContratos(ESCALAS[0],true)!=='',
        dossie:(show('brecho'),painelBrecho('inv'),!!document.querySelector('[data-ivds]')),
        /* ⚠️ AS SUBABAS DE DENTRO DO BRECHÓ, e não o mapa da gaveta.
           Foi por aqui que passou o defeito: a gaveta perdia "Alugar
           equipamento" na Fase 1 e a suíte dava por resolvido, enquanto a
           barra de dentro da tela continuava com a aba "Alugar". */
        bpAbas:[...document.querySelectorAll('[data-bp]')]
          .filter(e=>e.offsetParent!==null).map(e=>e.dataset.bp),
        /* atalho direto: quase toda chamada de painelBrecho() vem de fora
           da barra (carteira do topo, gaveta, painel do job) */
        bpForcado:(painelBrecho('alugar'),BPANEL),
        /* o painel de vendas existe na fase? e ele promete dinheiro? */
        vdForcado:(painelBrecho('vender'),BPANEL),
        vdTexto:(painelBrecho('vender'),drawBrecho(),
          document.getElementById('bp-vender').innerText),
        vdAnunciar:vis(document.getElementById('ct-novo1'))||vis(document.getElementById('ct-novo')),
        vdCarteira:vis(document.getElementById('ct-fatos')),
        vdExtrato:vis(document.getElementById('vd-extrato')),
        /* a porta do anúncio: sem garantia tem que abrir CONVERSA */
        anPorta:(()=>{
          const a=ANUNCIOS.find(x=>x.estadoVenda==='disponivel'&&x.dono!==EU.id);
          abrirAnuncio(a.id);
          const b=document.getElementById('a-comprar'); const rot=b?b.textContent:'';
          b&&b.click();
          const ovl3=document.getElementById('ovl3'), dm=document.getElementById('ovl-dm');
          const r={rot, checkout:!!(ovl3&&!ovl3.hidden), conversa:!!(dm&&!dm.hidden), gar:anGar(a)};
          if(ovl3) ovl3.hidden=true; if(dm) dm.hidden=true;
          document.body.style.overflow='';
          /* ⚠️ DEVOLVE A TELA ONDE ACHOU — e isto não é boa educação, é
             correção. `abrirAnuncio` troca a seção visível, e a sonda
             seguinte (`invTexto`) lê `innerText` de `#bp-inv`, que a partir
             daí está dentro de uma subárvore NÃO RENDERIZADA.

             ⚠️ `innerText` DE SUBÁRVORE NÃO RENDERIZADA DEGENERA PARA
             `textContent` E IGNORA `hidden`. Medido: com o brechó na tela
             o texto tem 2849 caracteres e ZERO linha de aluguel; com o
             anúncio na tela tem 2853 e DUAS — "Ver o catálogo de aluguel"
             e "Simular um pedido de aluguel chegando", os dois com
             `data-fase="2"` e `hidden` seguindo true o tempo todo.

             Custou uma investigação inteira em 12/set, porque a suíte
             acusava "o aluguel vazou para a Fase 1" e o produto estava
             certo — quem tinha mudado era a sonda. Regra geral: sonda que
             navega, navega de volta. E toda asserção que lê `innerText`
             depende da tela estar VISÍVEL; se não estiver, ela está lendo
             markup, não tela. */
          show('brecho'); painelBrecho('inv');
          return r;
        })(),
        /* e o que sobrou DENTRO do inventário, que é tela da Fase 1 */
        invTexto:(painelBrecho('inv'),drawInventario(),
          document.getElementById('bp-inv').innerText),
        invPerfil:(show('meu'),pintarInvPerfil(),!!document.getElementById('pf-inv').innerHTML.trim()),
        planosFre:(show('planos'),pnLado='freela',drawPlanos(),
          [...document.querySelectorAll('#pn-grade .plano:not(.pfuturo) h3')].map(x=>x.textContent.trim().split(' ')[0])),
        /* os planos de fase futura agora APARECEM, apagados e datados —
           pedido do Victor (24/ago): explicar em vez de sumir */
        planosFutFre:[...document.querySelectorAll('#pn-grade .pfuturo h3')].map(x=>x.textContent.trim()),
        quandoFut:[...document.querySelectorAll('#pn-grade .pfquando')].map(x=>x.textContent),
        proxAssina:!!document.getElementById('pn-subir'),
        proxTxt:(v('pn-prox')?v('pn-prox').innerText:''),
        planosCon:(pnLado='contratante',drawPlanos(),
          [...document.querySelectorAll('#pn-grade .plano:not(.pfuturo) h3')].map(x=>x.textContent.trim().split(' ')[0])),
        agPrem:(show('agenda'),[...document.querySelectorAll('.prem')]
          .filter(e=>e.offsetParent!==null).map(e=>e.textContent.slice(0,40).trim()).join(' | ')),
        /* a AJUDA também é vitrine (24/ago): artigo de dinheiro abre com a
           data, e a pergunta do FAQ sobre recurso futuro leva selo */
        ajMoeda:(abrirAjuda('moeda'),/ainda não está nesta versão/.test(v('aj-corpo').innerText.slice(0,340))),
        ajFaqSelos:(abrirAjuda('faq'),v('aj-corpo').querySelectorAll('.pfquando').length),
        ajComo:(abrirAjuda('como'),/Feche com sinal e contrato\s*em breve/
          .test(v('aj-corpo').innerText.replace(/\n/g,' '))),
        achboxFeed:(show('feed'),(el=>!!el&&el.offsetParent!==null)(document.querySelector('#v-feed .achbox'))),
        via:(()=>{const e=document.getElementById('pn-via');return e?!e.hidden:null})(),
        rodando:(show('feed'),(()=>{const e=document.querySelector('.rdcab');
          return !!e&&e.offsetParent!==null})())
      };
    });
    await ctx.close();
    return {...r,home,errs};
  };

  const F={};
  for(const f of [0,1,2,3,4,5,6]) F[f]=await ler(f);

  /* ============ 1. o build padrão não muda ============ */
  t(F[0].FASE===0,'o build padrão nasce com FASE=0');
  t(!F[0].chip,'e não mostra o chip de versão');
  t(F[0].garantia===true,'nele a garantia continua existindo — nada foi desligado por engano');
  t(F[0].tela==='feed','e o login continua caindo no feed, como sempre foi');

  /* ============ 2. cada fase mostra o que entrega ============ */
  const temNoMapa=(f,re)=>F[f].mapa.some(x=>re.test(x));
  t(!temNoMapa(1,/Cofre/)&&temNoMapa(2,/Cofre/),'Cofre: fora na 1, dentro na 2');
  t(!temNoMapa(2,/Orçamento/)&&temNoMapa(3,/Orçamento/),'Orçamento: fora na 2, dentro na 3');
  /* ⚠️ o Feed é FASE 1 por decisão do Victor (23/ago) — num dia sem job é
     preciso ter motivo para abrir o app. O RODANDO fica na 4 mesmo assim:
     é o anúncio mais barato do calendário e não se gasta no lançamento. */
  t(temNoMapa(1,/Feed/),'Feed está na Fase 1 — é o motivo de abrir o app num dia sem job');
  t(F[1].rodando===false&&F[4].rodando===true,
    'e o Rodando continua na 4: campanha pronta não se gasta no lançamento');
  t(!temNoMapa(3,/Guilda/)&&temNoMapa(4,/Guilda/),'Guilda: fora na 3, dentro na 4');
  /* ⚠️ decisões do Victor (23/ago), nesta ordem: o brechó completo entra na
     Fase 2 — e depois o INVENTÁRIO desceu para a 1, porque ele é declaração
     e declaração não cobra nada. É ele que faz o anúncio nascer com ficha. */
  t(temNoMapa(1,/invent/i),'Inventário está na Fase 1 — é declaração, não cobra nada');
  t(!temNoMapa(1,/Alugar/)&&temNoMapa(2,/Alugar/),'Aluguel: fora na 1, dentro na 2 — ele cobra 5% do período');
  t(F[1].invPerfil,'e o inventário tem porta no Meu perfil, já na Fase 1');

  /* ============ o aluguel não vaza para dentro da Fase 1 ============
     Victor, olhando o protótipo: "na fase 1 não era pra estar alugar
     equipamento". Estava — em três lugares que a versão anterior desta
     suíte não olhava. Esconder do mapa não é esconder do produto. */
  /* ⚠️ ESTA ASSERÇÃO MUDOU DE LADO (12/set), e não foi afrouxada — o
     PRODUTO mudou de propósito. Ela exigia que a Fase 1 NÃO tivesse
     "Minhas vendas", junto com "Alugar". Victor: *"comprar e vender é
     algo meio óbvio que tem que ter, pq se a pessoa vai comprar, alguém
     tem que colocar pra vender."*

     O PRD v3.0 sempre disse isso — a seção 08 lista "brechó, só venda"
     dentro da Fase 1 e dois critérios de pronto dependem de anunciar. O
     que estava errado era o código, e esta suíte guardava o erro. Quem
     continua fora é o ALUGUEL, que cobra 5% do período.

     No lugar entram três asserções mais duras que a que saiu: o painel
     EXISTE, ele não promete dinheiro nenhum, e a porta de comprar leva à
     conversa em vez do checkout. */
  t(!F[1].bpAbas.includes('alugar'),
    '⟶⟶ Fase 1: a barra de dentro do brechó não tem "Alugar": '+F[1].bpAbas.join(' · '));
  t(F[1].bpAbas.includes('vender'),
    '⟶⟶ mas TEM "Minhas vendas" — sem ela a vitrine não tem quem abasteça');
  t(F[2].bpAbas.includes('alugar')&&F[2].bpAbas.includes('vender'),
    'e na Fase 2 as duas voltam: '+F[2].bpAbas.join(' · '));

  /* ============ o dinheiro NÃO vaza para dentro da Fase 1 ============
     O painel de vendas é a CARTEIRA: take, pedágio, saque, extrato, taxa
     de 5% e custódia de três dias. Ligá-lo sem este gate publicaria
     promessa de pagamento que a fase não tem — o último critério de
     pronto da seção 08 proíbe isso com todas as letras. */
  t(F[1].vdForcado==='vender','⟶⟶ e o atalho painelBrecho("vender") abre mesmo o painel na Fase 1');
  t(F[1].vdAnunciar,'⟶⟶ Fase 1: "Anunciar equipamento" está à vista no painel de vendas');
  t(!F[1].vdCarteira&&!F[1].vdExtrato,
    '⟶⟶ e a carteira e o extrato NÃO aparecem — dinheiro na plataforma é Fase 2');
  t(F[2].vdCarteira&&F[2].vdExtrato,'na Fase 2 os dois voltam');
  t(F[0].vdCarteira&&F[0].vdExtrato,'e o build padrão nunca perdeu nenhum dos dois');
  const promete=f=>/taxa de 5%|caem na sua carteira|entram na carteira|retidos na plataforma|Impulsionar|em custódia/i
    .test(F[f].vdTexto);
  t(!promete(1),'⟶⟶ NENHUMA linha do painel de vendas da Fase 1 cita taxa, carteira, custódia ou impulsionado');
  t(promete(2),'e na Fase 2 elas voltam — é a fase que cobra');

  /* ============ "Falar com o vendedor" leva à conversa ============
     ⚠️ DEFEITO DO PRODUTO COMPLETO, achado nesta leva e consertado junto:
     num anúncio sem garantia o botão dizia "Falar com o vendedor" e abria
     um modal intitulado "Comprar com garantia", com Pix e cartão. A Fase 1
     inteira anda por esse caminho, porque lá `anGar` é falso sempre. */
  t(F[1].anPorta.gar===false,'⟶⟶ Fase 1: nenhum anúncio tem compra garantida — a fase é acerto direto');
  t(/Falar com o vendedor/.test(F[1].anPorta.rot),'⟶⟶ e o botão do anúncio diz "Falar com o vendedor"');
  t(F[1].anPorta.conversa&&!F[1].anPorta.checkout,
    '⟶⟶ e ele ABRE A CONVERSA, nunca o checkout — o botão faz o que diz');
  t(F[2].anPorta.gar===true&&F[2].anPorta.checkout&&!F[2].anPorta.conversa,
    'na Fase 2 o mesmo anúncio volta a ter garantia e o botão abre o checkout');
  t(F[1].bpForcado==='comprar',
    '⟶⟶ e nem por atalho: painelBrecho("alugar") na Fase 1 cai no catálogo, não abre o painel');
  t(F[2].bpForcado==='alugar','na Fase 2 o mesmo atalho abre o que pediu');
  const linhas=(f,re)=>F[f].invTexto.split('\n').filter(l=>re.test(l)).length;
  t(linhas(1,/alug|empresta|fora de casa/i)===0,
    '⟶⟶ Fase 1: dentro do inventário não sobra "pôr para alugar", "fora de casa" nem catálogo de aluguel');
  t(linhas(2,/alug/i)>0,'e na Fase 2 o inventário volta a oferecer o aluguel');
  /* o dossiê é da Fase 5 e aparecia em CADA peça como "Dossiê 40%" — uma
     conta de prontidão para uma seguradora que a fase não tem */
  t(linhas(1,/doss/i)===0&&linhas(4,/doss/i)===0,
    'a prontidão de dossiê não aparece por peça antes da Fase 5');
  t(linhas(5,/doss/i)>0,'e na Fase 5 ela aparece — é a fase do seguro');
  t(linhas(0,/alug/i)>0&&linhas(0,/doss/i)>0,
    'o build padrão continua com os dois — nada foi desligado por engano');
  t(F[1].dossie===false&&F[4].dossie===false&&F[5].dossie===true,
    'Dossiê e ocorrência só na Fase 5 — seguro depende de corretora, não de pagamento');
  t(temNoMapa(1,/Brechó/),'Brechó está na Fase 1 — é metade do que ela entrega');
  t(temNoMapa(1,/Agenda/)||F[1].barra.some(x=>/Agenda/.test(x)),'e a Agenda também — é a outra metade');

  /* ============ 3. cumulativo, nunca menos que a anterior ============ */
  let cresce=true, detalhe='';
  for(const f of [2,3,4,5,6]){
    if(F[f].mapa.length<F[f-1].mapa.length){ cresce=false; detalhe=' — a '+f+' tem menos que a '+(f-1) }
  }
  t(cresce,'as fases são cumulativas: nenhuma tira o que a anterior tinha'+detalhe);
  t(F[6].mapa.length===F[0].mapa.length,'a Fase 6 chega ao produto inteiro: '+F[6].mapa.length+' telas');

  /* ============ 4. a Fase 1 não promete dinheiro ============ */
  t(F[1].carteira===false,'Fase 1: a carteira não aparece no topo');
  t(F[1].garantia===false,'Fase 1: comGarantia é falso — fechar escala é acerto direto, que é o que a fase é');
  t(F[1].contrato===false,'Fase 1: o bloco de contrato assinado não é desenhado nem numa escala cheia');
  t(F[2].carteira===true&&F[2].garantia===true&&F[2].contrato===true,
    'Fase 2: os três voltam juntos — é a fase do dinheiro');
  /* ⚠️ VIROU DO AVESSO com o painel (12/set) — ver o bloco do brechó
     acima. A porta para "Minhas vendas" tem que existir na Fase 1: é por
     ela que a pessoa anuncia, e sem isso a vitrine não tem quem abasteça.
     O que a fase não pode ter é a CARTEIRA dentro do painel, e disso
     cuidam as asserções `vdCarteira`/`vdExtrato`/`promete`. */
  t(F[1].mapa.some(x=>/Minhas vendas/.test(x)),'Fase 1: o painel de vendas TEM porta no mapa — é por ela que se anuncia');
  t(F[2].mapa.some(x=>/Minhas vendas/.test(x)),'e na Fase 2 ela continua, agora com a carteira dentro');

  /* ============ 5. a porta de entrada existe na fase ============ */
  t(F[1].tela==='feed','Fase 1 já cai no feed — ele passou a existir nela');
  t(F[4].tela==='feed','e a Fase 4 também, claro');
  t(F[1].barra.some(x=>/Feed/.test(x)),'e o Feed tem porta na barra de baixo da Fase 1');

  /* ============ 6. o gate sobrevive à troca de chapéu ============ */
  t(!F[1].barraProd.some(x=>/Guilda/.test(x)),
    'de chapéu de contratante a Fase 1 continua sem Guilda — o gate mora dentro do aplicarModo');
  t(F[4].barraProd.some(x=>/Feed/.test(x)),'e na Fase 4 ele continua lá dos dois lados');

  /* ============ 7. plano não vende o que a fase não faz ============
     É a régua da vitrine aplicada ao catálogo: a Frota vende taxa reduzida
     e cláusulas (Fase 2), o Premium vende o relatório do ano (Fase 2) e a
     Estrada vende o orçamento (Fase 3). Na Fase 1 sobram exatamente os dois
     que ela entrega — o grátis e o Volante, que É "ver quem está livre". */
  t(F[1].planosCon.join()==='Carona,Volante','Fase 1 vende Carona e Volante, e só: '+F[1].planosCon.join(' · '));
  t(F[1].planosFre.join()==='Freela','Fase 1 não vende nada do lado do freela — a base precisa encher antes');
  t(F[2].planosCon.includes('Frota'),'Fase 2 traz a Frota — a taxa reduzida passa a existir');
  t(F[2].planosFre.includes('Premium')&&!F[2].planosFre.includes('Estrada'),
    'Fase 2 traz o Premium (relatório do ano) e ainda não a Estrada');
  t(F[3].planosFre.includes('Estrada'),'Fase 3 traz a Estrada — é a fase do orçamento');
  t(F[0].planosCon.length===3&&F[0].planosFre.length===3,'o build padrão continua com os cinco degraus');
  t(F[1].via===false&&F[3].via===true,
    'a estrada dos planos some enquanto a escada está incompleta e volta quando ela fecha');

  /* ============ 7b. a HOMEPAGE adapta à fase (24/ago) ============
     Pedido do Victor: homepage nova "com uma adaptação pra cada fase".
     O que se jura aqui é honestidade de vitrine pública — é a página que
     um desconhecido vê. */
  /* 17/out: a manchete passou a dizer o que o produto faz ("Escale sua
     equipe sem adivinhar" só fazia sentido para quem já conhecia a casa) */
  t(/livre na sua data/.test(F[0].home.hero),'o build padrão abre com a manchete de sempre: '+F[0].home.hero.slice(0,48)+'…');
  t([0,1,2,6].every(f=>!F[f].home.falaVersao),
    '⟶⟶ NENHUMA homepage fala em versão ou fase — roadmap é informação interna (Victor, 24/ago)');
  t([0,1,6].every(f=>!F[f].home.temEstrada),
    '⟶⟶ e a seção da estrada saiu da homepage de todos os builds');
  t(!/sinal|contrato|garantia/i.test(F[1].home.hero),
    '⟶⟶ a manchete da Fase 1 não vende dinheiro: '+F[1].home.hero.slice(0,60)+'…');
  t(/sinal|garantia/i.test(F[2].home.hero),'e a da Fase 2 vende — é a fase disso');
  t(!F[1].home.gar&&F[1].home.garF1,
    '⟶⟶ Fase 1: a seção de garantia sai e entra a faixa honesta do acerto direto');
  t(F[2].home.gar&&!F[2].home.garF1,'Fase 2: a garantia volta e a faixa sai');
  t(F[0].home.gar&&!F[0].home.garF1,'no completo a faixa da V1 nunca aparece');
  t(!F[1].home.moeda&&F[2].home.moeda,'a moeda take só se anuncia da Fase 2 em diante');
  t(F[1].home.planosHome.join()==='Freela,Carona,Volante',
    '⟶⟶ a vitrine de planos da homepage encolhe com a fase: '+F[1].home.planosHome.join(' · '));
  t(F[0].home.planosHome.length===6,'e no completo os seis cards estão lá');
  t(F[1].home.passo4.some(x=>/direto/i.test(x))&&!F[1].home.passo4.some(x=>/sinal/i.test(x)),
    'o passo 4 da Fase 1 é "feche direto" — não promete sinal');
  t(F[2].home.passo4.some(x=>/sinal/i.test(x))&&!F[2].home.passo4.some(x=>/direto, como sempre/i.test(x)),
    'e o da Fase 2 volta a ser o sinal com contrato');
  t([0,1].every(f=>F[f].home.chips===6),'o jogo de montar equipe existe em todas — é a prova sem conta');

  /* ============ 7c. plano que falta é EXPLICADO, não sumido ============
     Victor (24/ago): "tem lugar que fala do plano, mas na versão que se
     encontra não tem o plano". O conserto tem dois lados: quem fala de
     plano futuro diz QUANDO ele chega, e nada vende o que não existe. */
  t(F[1].planosFutFre.join()==='Premium,Estrada',
    '⟶⟶ Fase 1: Premium e Estrada aparecem como cartões futuros, não somem: '+F[1].planosFutFre.join(' · '));
  t(F[1].quandoFut.every(x=>/próxima atualização/.test(x))&&!/V\d/.test(F[1].quandoFut.join()),
    'e cada um diz que vem — sem numerar fase: '+(F[1].quandoFut[0]||''));
  t(F[2].planosFutFre.join()==='Estrada','na Fase 2 só a Estrada continua futura');
  t(F[3].planosFutFre.length===0,'e na 3 a escada do freela está completa');
  t(F[0].planosFutFre.length===0,'no build padrão não existe cartão futuro — está tudo à venda');
  t(!F[1].proxAssina&&/próxima atualização/.test(F[1].proxTxt),
    '⟶⟶ o "próximo degrau" da Fase 1 explica o Premium sem botão de assinar e sem número de fase');
  t(F[2].proxAssina,'e na Fase 2 o botão de subir volta — o degrau passou a existir');
  t(/O que vem por aí/.test(F[1].agPrem)&&!/Testar 30 dias/.test(F[1].agPrem),
    'a agenda da Fase 1 não vende teste de Premium — explica o que vem, sem roadmap');
  t(/R\$ 19/.test(F[2].agPrem),'e a da Fase 2 volta a vender o Premium de verdade');

  /* ============ 7d. as duas telas novas ============ */
  t([1,2,3,6].every(f=>temNoMapa(f,/Achar alguém/)),
    'Achar alguém existe desde a Fase 1 — achar a pessoa é de graça, dos dois lados');
  t(!temNoMapa(2,/Porta-malas/)&&temNoMapa(3,/Porta-malas/),
    'Porta-malas: fora na 2, dentro na 3 — depende de servidor nosso, e a fase 3 é a dos documentos');
  t([1,4].every(f=>F[f].achboxFeed),'a caixa de procurar gente está no topo do feed em toda fase');

  /* ============ 7e. a AJUDA datada (24/ago) ============ */
  t(F[1].ajMoeda,'⟶⟶ Fase 1: o artigo do take abre dizendo que aquilo ainda não está nesta versão');
  t(!F[2].ajMoeda,'e na Fase 2 o aviso sai — o take passou a existir');
  t(F[1].ajFaqSelos>=6,'as perguntas de dinheiro do FAQ levam o selo "em breve": '+F[1].ajFaqSelos);
  t(F[0].ajFaqSelos===0,'no build padrão nenhum selo aparece — está tudo no ar');
  t(F[1].ajComo,'e o passo 4 do "Como usar" da Fase 1 é selado, não escondido');
  /* ============ 7f. o sinal de 20% NÃO existe na Fase 1 ============
     Victor: "a taxa de 20% de sinal não entra na fase 1 né?" — não entra,
     e agora é jurado: a homepage da V1 não contém 20%, sinal nem taxa. */
  t(!/20%|sinal|garantia|taxa de/i.test(F[1].home.hero),
    '⟶⟶ a manchete da V1 não fala em 20%, sinal, garantia nem taxa');
  t(F[1].home.vendeDinheiro===0&&F[0].home.vendeDinheiro>0,
    '⟶⟶ e a homepage INTEIRA da V1 não vende dinheiro — nem o li do Carona, nem a nota da Frota');

  /* ============ 8. o chip diz em que versão a pessoa está ============ */
  for(const f of [1,3,6]) t(F[f].chip,'Fase '+f+': o chip de versão aparece');

  const errs=[].concat(...[0,1,2,3,4,5,6].map(f=>F[f].errs));
  t(errs.length===0,'zero erro de console em qualquer uma das versões'+(errs.length?' — '+errs[0]:''));

  console.log('VERSOES');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();
