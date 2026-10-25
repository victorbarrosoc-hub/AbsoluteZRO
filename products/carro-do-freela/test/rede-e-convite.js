/**
 * REDE E CONVITE — as duas coisas que fazem a plataforma servir para o job
 * que ela NÃO intermediou.
 *
 * Pedido do Victor, em duas partes:
 *
 *   1. "O plano carona, como o contratante consegue chamar quem ele já
 *      conhece se ele n tem acesso ao perfil das pessoas?"
 *      -> era um buraco de verdade: o Carona PROMETE "chamar quem você já
 *      conhece pelo nome", mas a estrela guardava a pessoa no Meu time e o
 *      Meu time inteiro estava atrás de podeVerAgenda(). No Carona você
 *      seguia alguém e a pessoa SUMIA.
 *
 *   2. "Crie uma espécie de rede social da plataforma, onde a gente pode
 *      seguir as pessoas e mandar mensagem. Assim consigo adicionar as
 *      pessoas, mas ver a agenda só no plano volante."
 *      -> a linha do pago passa a ser uma só: SEGUIR e FALAR de graça,
 *      SABER QUEM ESTÁ LIVRE no Volante.
 *
 * E o convite, que nasce do caso real: Victor foi chamado por um amigo, no
 * particular. Quem convida é o FREELA — pedir a um amigo que crie conta e
 * adiante 20% é pedir favor com risco social. Por isso:
 *
 *   ⚠️ O SINAL NASCE DESLIGADO. É a asserção que sustenta a decisão
 *   inteira, e é a que deve gritar se alguém "otimizar" isso um dia.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1300},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>{ if(m.type()!=='error') return;
    if(/web3forms/.test((m.location()&&m.location().url)||'')) return; errs.push(m.text()); });
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(220);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(600);

  /* ============ 1. O CARONA DEIXOU DE SER UM BECO ============ */
  const car=await p.evaluate(()=>{
    MODO="contratante"; ASSINANTE=false; PREMIUM_PROD=false; aplicarModo();
    show("equipe"); drawEquipe();
    const sg=document.getElementById("e-seguindo");
    return {plano:planoAtual(), agenda:podeVerAgenda(),
      linhas:sg.querySelectorAll(".sgl").length, seguidos:FAV.size,
      selos:sg.querySelectorAll(".selo").length,
      msg:sg.querySelectorAll("[data-dm]").length,
      chamar:sg.querySelectorAll("[data-chamar]").length,
      escalaTrancada:[...document.querySelectorAll("#v-equipe .escalar")].every(x=>x.hidden)};
  });
  t(car.plano==='carona'&&!car.agenda,'contratante no Carona, sem agenda');
  t(car.linhas>0,'e MESMO ASSIM vê quem segue: '+car.linhas+' na lista');
  t(car.linhas===car.seguidos,
    '⟶ UMA LINHA POR PESSOA ('+car.linhas+' para '+car.seguidos+' seguidos) — '+
    'lista de contato que repete nome cinco vezes não é lista de contato');
  t(car.selos===0,
    '⟶ e NENHUM selo de agenda vaza: livre/ocupado é o que se paga');
  t(car.msg===car.linhas&&car.chamar===car.linhas,
    'falar e chamar em cada linha, de graça — é o que ele já faz no zap');
  t(car.escalaTrancada,'a escala continua trancada: o que o Volante vende segue vendido');

  /* a promessa do plano agora tem onde morar */
  const promessa=await p.evaluate(()=>PLANO_DET.carona.join(' | '));
  t(/[Ss]eguir/.test(promessa)&&/mensagem/i.test(promessa),
    'e o plano promete o que entrega: "'+promessa.split(' | ')[1]+'"');

  /* ============ 2. NINGUÉM É MEDIDO POR SEGUIDOR ============ */
  const social=await p.evaluate(()=>{
    const txt=document.getElementById("e-seguindo").textContent;
    return {contador:/seguidor/i.test(txt)};
  });
  t(!social.contador,
    '⟶ não existe contador de SEGUIDORES — são 109 pessoas reais, e número '+
    'inventado sobre gente de verdade é a regra #3 da casa');

  /* ============ 3. A MENSAGEM DIRETA ============ */
  const dm=await p.evaluate(()=>{
    document.querySelector("#e-seguindo [data-dm]").click();
    const ov=document.getElementById("ovl-dm");
    return {aberto:!ov.hidden, campo:!!ov.querySelector(".chatbar input"),
            titulo:document.getElementById("dm-t").textContent,
            nota:document.getElementById("dm-nota").textContent};
  });
  t(dm.aberto&&dm.campo,'a conversa direta abre e dá para escrever: "'+dm.titulo+'"');
  t(/de graça em qualquer plano/.test(dm.nota),'e diz que é de graça, sem letra miúda');

  /* ============ 4. O VOLANTE CONTINUA VALENDO ============ */
  const vol=await p.evaluate(()=>{
    document.getElementById("ovl-dm").hidden=true;
    ASSINANTE=true; aplicarModo(); show("equipe"); drawEquipe();
    return {plano:planoAtual(),
      livreSumiu:document.getElementById("e-seguindo").innerHTML==="",
      agendaNoTime:document.getElementById("e-time").querySelectorAll(".selo").length>0,
      escala:[...document.querySelectorAll("#v-equipe .escalar")].some(x=>!x.hidden)};
  });
  t(vol.plano==='volante'&&vol.livreSumiu,'no Volante a lista de graça sai de cena — não há duas listas');
  t(vol.agendaNoTime,'e o Meu time volta COM os selos de agenda: é isso que se pagou');
  t(vol.escala,'com a escala liberada');

  /* ============ 5. O CONVITE — QUEM CONVIDA É O FREELA ============ */
  const ent=await p.evaluate(()=>{
    MODO="contratante"; aplicarModo(); show("jobs"); drawJobs();
    const noProd=!document.getElementById("jb-fora").hidden;
    MODO="freela"; ASSINANTE=false; aplicarModo(); show("jobs"); drawJobs();
    return {noProd, noFreela:!document.getElementById("jb-fora").hidden, antes:ESCALAS.length};
  });
  t(ent.noFreela&&!ent.noProd,
    '"Fui chamado por fora" só existe no lado freela — quem contrata monta a escala por dentro');

  const conv=await p.evaluate(()=>{
    document.getElementById("jb-fora-bt").click();
    document.getElementById("cv-quem").value="Rafael";
    document.getElementById("cv-nome").value="Episódio do podcast";
    document.getElementById("cv-valor").value="1200";
    document.getElementById("cv-local").value="Natal — Ponta Negra";
    document.getElementById("cv-ver").click();
    const ov=document.getElementById("ovl-cv2");
    return {aberto:!ov.hidden, formFechou:document.getElementById("ovl-cv").hidden,
      titulo:document.getElementById("cv2-t").textContent,
      identidade:document.getElementById("cv2-cab").textContent.trim(),
      temFoto:!!document.querySelector("#cv2-cab .av"),
      demo:/É isto que abre no celular de quem te chamou/.test(ov.textContent)&&!/Demonstra/.test(ov.textContent),
      sinalLigado:document.getElementById("cv2-sn").checked,
      textoSinal:document.getElementById("cv2-sinal").textContent,
      nota:document.getElementById("cv2-nota").textContent,
      linhas:ov.querySelectorAll(".cvl").length};
  });
  t(conv.aberto&&conv.formFechou,'o freela vê exatamente o que o contratante recebe');
  t(conv.temFoto&&/Victor/.test(conv.identidade),
    '⟶ abre com a IDENTIDADE VISUAL de quem mandou ("'+conv.identidade.split("Op.")[0].trim()+'"), '+
    'não com a marca da plataforma — é o que separa isso de spam');
  t(/Rafael/.test(conv.titulo),'e chama o contratante pelo nome: "'+conv.titulo+'"');
  t(conv.linhas===6,'com o combinado inteiro em '+conv.linhas+' linhas conferíveis');
  t(conv.demo,'dizendo que é o que o outro lado abre — sem o rótulo "Demonstração" (17/out · 5)');

  t(conv.sinalLigado===false,
    '⟶⟶ O SINAL NASCE DESLIGADO. Pedir a um amigo que adiante 20% é pedir '+
    'favor com risco social — ligar por padrão mata o convite no primeiro envio');
  t(/[Oo]pcional/.test(conv.textoSinal)&&/não conhece/.test(conv.textoSinal),
    '⟶ e a caixa explica PARA QUE serve em vez de só cobrar: o sinal é para o desconhecido');
  t(/não precisa criar conta/.test(conv.nota),
    '⟶ e quem recebe NÃO PRECISA DE CONTA — tela de cadastro antes do combinado mata o convite');

  const fez=await p.evaluate(()=>{
    const antes=ESCALAS.length;
    document.getElementById("cv2-ok").click();
    const n=ESCALAS[ESCALAS.length-1];
    return {criou:ESCALAS.length===antes+1, nome:n.nome, cliente:n.cliente,
      deFora:!!n.deFora, sinalPago:!!n.sinalPago,
      euNaEquipe:n.equipe.some(x=>x.quem===EU.id), valor:n.equipe[0].valor,
      naTela:document.getElementById("jb-lista").textContent.includes("Episódio do podcast"),
      fechou:document.getElementById("ovl-cv2").hidden};
  });
  t(fez.criou&&fez.euNaEquipe&&fez.valor===1200,
    'confirmando, o job entra na agenda do freela com o combinado ('+fez.valor+')');
  t(fez.cliente==='Rafael'&&fez.deFora,'marcado como vindo de fora — a plataforma não finge que intermediou');
  t(fez.sinalPago===false,'e sem sinal, porque ninguém ligou a caixa');
  t(fez.naTela&&fez.fechou,'e aparece na lista de jobs na hora');

  /* com o sinal LIGADO o caminho também funciona — o padrão é escolha, não limitação */
  const comSinal=await p.evaluate(()=>{
    document.getElementById("jb-fora-bt").click();
    document.getElementById("cv-quem").value="Produtora Nova";
    document.getElementById("cv-nome").value="Job com sinal";
    document.getElementById("cv-ver").click();
    document.getElementById("cv2-sn").checked=true;
    document.getElementById("cv2-ok").click();
    return ESCALAS[ESCALAS.length-1].sinalPago;
  });
  t(comSinal===true,'quem QUISER ligar o sinal, liga — o padrão é escolha de produto, não limitação');

  /* ============ celular ============ */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  await p.evaluate(()=>{ document.querySelectorAll('.ovl').forEach(o=>o.hidden=true);
    document.body.style.overflow=""; MODO="contratante"; ASSINANTE=false; aplicarModo();
    show('equipe'); drawEquipe(); });
  await p.waitForTimeout(400);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no celular: '+ov);

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();
