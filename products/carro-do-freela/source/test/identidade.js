/* IDENTIDADE POR ÁREA — "onde eu estou?" respondido sem ler.
 *
 * Victor: "às vezes tenho a impressão que as telas são muito parecidas e
 * acaba confundindo onde a pessoa está." A causa era boa demais: acento
 * único + mono só em número deixaram pouca coisa DIFERENCIANDO as telas, e
 * o rotulinho do topo ainda repetia ("Sua área" em quatro, "Sua conta" em
 * duas). O que esta suíte jura:
 * 1. NENHUM título de tela se repete — desde 17/out · 14 é ELE que diz
 *    onde você está. O rotulinho em caixa alta que ficava em cima ("Sua
 *    caixa", "Sua semana"…) saiu a pedido do Victor ("isso é muito cara de
 *    IA e tem isso em tudo"), e esta suíte passou a jurar o contrário do que
 *    jurava: nenhum rótulo pequeno aparece colado num título.
 * 2. (até 17/out · 13) o glifo do rótulo era o ícone do MENU. Com o rótulo
 *    fora de vista o glifo foi junto — conferir traço de um desenho que
 *    ninguém vê seria testar o mapa, não o produto.
 * 3. O véu pinta nos DOIS temas (token só num tema é o bug clássico do
 *    artifact ilegível) e com a cor da área certa.
 * 4. COR DE ÁREA NUNCA VIRA BOTÃO. Elas são a paleta de DADO reusada; se
 *    virarem ação, a regra do acento único cai.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const PRE=pg=>pg.addInitScript(()=>{ try{
  localStorage.setItem('cdf-pv','1');
  localStorage.setItem('cdf-entrou','1');
  localStorage.setItem('cdf-guia','1');
  localStorage.removeItem('cdf-uso');
}catch(e){} });

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await PRE(p);
  await p.goto(URL,{waitUntil:'networkidle'});

  /* ============ as quatro áreas existem e cobrem o produto ============ */
  let m=await p.evaluate(()=>{
    const secs=[...document.querySelectorAll('section[data-area]')];
    const areas={};
    secs.forEach(s=>{ areas[s.dataset.area]=(areas[s.dataset.area]||0)+1 });
    return {n:secs.length,areas,ids:secs.map(s=>s.id)};
  });
  t(m.n>=18,'as telas do produto carregam área: '+m.n);
  t(Object.keys(m.areas).sort().join(',')==='dinheiro,equip,trabalho,turma',
    'são quatro áreas, e só quatro: '+Object.keys(m.areas).sort().join(', '));
  t(m.ids.includes('v-cofre')&&m.areas.dinheiro>=2,'Cofre e Planos são a área do dinheiro');
  t(m.ids.includes('v-brecho'),'Brechó é a área de equipamento');

  /* ============ 1. NENHUM título de tela se repete ============ */
  m=await p.evaluate(()=>{
    const out={};
    document.querySelectorAll('section[data-area]').forEach(s=>{
      const h=s.querySelector('.pghero h1, .wrap > h1, .bhead h1');
      if(h&&h.textContent.trim()) out[s.id]=h.textContent.trim().toLowerCase();
    });
    const vals=Object.values(out), dup={};
    vals.forEach(v=>{ dup[v]=(dup[v]||0)+1 });
    return {out,n:vals.length,repetidos:Object.entries(dup).filter(([,n])=>n>1).map(([v,n])=>v+' ×'+n)};
  });
  t(m.n>=15,'as telas de área têm título: '+m.n);
  t(m.repetidos.length===0,
    'nenhum título de tela se repete — é ele que diz onde você está'+(m.repetidos.length?' — REPETE: '+m.repetidos.join('; '):''));

  /* ============ 1b. nenhum rótulo pequeno colado num título ============
     ⚠️ Medido na TELA, uma por uma: o nó continua no DOM (jb-rot, mp-rot e
     oc-lab ainda são escritos por JS), então contar elemento não diz nada —
     o que vale é ele não ser desenhado. */
  m=await p.evaluate(()=>{
    const vistos=[];
    const telas=[...document.querySelectorAll('section[data-area]')].map(s=>s.id.replace(/^v-/,''));
    telas.concat(['cadastro']).forEach(t=>{
      try{ show(t) }catch(e){ return }
      const sec=document.getElementById('v-'+t); if(!sec||sec.hidden) return;
      sec.querySelectorAll('h1,h2,h3').forEach(h=>{
        const a=h.previousElementSibling;
        if(a&&a.getClientRects().length&&(a.matches('.lab,.arcab')||getComputedStyle(a).textTransform==='uppercase'))
          vistos.push(t+': "'+a.textContent.trim().slice(0,30)+'"');
      });
    });
    return vistos;
  });
  t(m.length===0,'⟶⟶ nenhum rótulo em caixa alta aparece em cima de título'+(m.length?' — AINDA: '+m.join('; '):''));

  /* ============ 3. o véu pinta, com a cor certa, nos DOIS temas ============ */
  async function veu(rot){
    return await p.evaluate(()=>{
      const r={};
      ['propostas','cofre','brecho','guildas'].forEach(t=>{
        show(t);
        const sec=document.getElementById('v-'+t);
        /* desde 17/out · 4 a cor da área mora no CARTÃO DO TOPO (.pghero),
           não mais no véu da .wrap — e ele tem de existir nas quatro.
           Desde 17/out · 7 o cartão virou o cabeçalho de painel dos Ajustes
           e a cor foi para a PASTILHA do ícone (.pg-ico), dentro dele: a
           mesma exigência — existe nas quatro, pinta nos dois temas. */
        const w=sec.querySelector(':scope > .wrap > .pghero > .pg-ico');
        if(!w){ r[t]={ar:'',pinta:false,bg:'sem pastilha'}; return }
        const ar=getComputedStyle(sec).getPropertyValue('--ar').trim();
        /* desde 17/out · 14 o cabeçalho é o cartão de cinema: com objeto 3D a
           cor da área é o brilho da pastilha; com a FOTO de ofício ela vai no
           véu por cima da foto (o ::after da pastilha) — a foto cobriria o
           fundo. Mesma exigência, nos dois lugares onde ela pode morar. */
        const bg=getComputedStyle(w).backgroundImage+' '+getComputedStyle(w,'::after').backgroundImage;
        r[t]={ar,pinta:/linear-gradient/.test(bg),bg};
      });
      return r;
    });
  }
  /* desde 17/out · 3 o claro é o padrão: a medida do ESCURO tira a classe
     antes, explicitamente, em vez de presumir o tema de abertura */
  await p.evaluate(()=>document.documentElement.classList.remove('app-light'));
  await p.waitForTimeout(200);
  let esc=await veu();
  t(Object.values(esc).every(x=>x.pinta),'escuro: o cartão do topo pinta em todas as áreas');
  t(new Set(Object.values(esc).map(x=>x.ar)).size===4,
    'escuro: cada área tem a SUA cor — quatro cores distintas');
  t(esc.cofre.ar!==esc.propostas.ar,'escuro: dinheiro e trabalho não se confundem');

  await p.evaluate(()=>document.documentElement.classList.add('app-light'));
  await p.waitForTimeout(200);
  let claro=await veu();
  t(Object.values(claro).every(x=>x.pinta),'claro: o cartão pinta também — token nos dois temas');
  t(new Set(Object.values(claro).map(x=>x.ar)).size===4,'claro: as quatro cores continuam distintas');
  t(claro.cofre.ar!==esc.cofre.ar,'claro tem valores PRÓPRIOS, não os do escuro: '+claro.cofre.ar+' × '+esc.cofre.ar);
  await p.evaluate(()=>document.documentElement.classList.remove('app-light'));

  /* ============ 4. cor de área NUNCA vira botão ============ */
  m=await p.evaluate(()=>{
    const ruins=[];
    for(const folha of document.styleSheets){
      let regras; try{ regras=folha.cssRules }catch(e){ continue }
      for(const r of regras||[]){
        if(!r.selectorText||!r.cssText.includes('var(--ar')) continue;
        if(/\.btn|button(?![\w-])/.test(r.selectorText)) ruins.push(r.selectorText);
      }
    }
    return ruins;
  });
  t(m.length===0,'nenhuma regra pinta botão com cor de área'+(m.length?' — '+m.join('; '):''));

  /* e a prova em tempo de tela: varre os botões visíveis de várias áreas e
     confere que nenhum fundo/texto é uma cor de área */
  m=await p.evaluate(()=>{
    const hex=k=>getComputedStyle(document.documentElement).getPropertyValue(k).trim().toUpperCase();
    const alvo=['--ar-trab','--ar-din','--ar-eq','--ar-com'].map(hex);
    const rgb=h=>{const n=parseInt(h.slice(1),16);return 'rgb('+[(n>>16)&255,(n>>8)&255,n&255].join(', ')+')'};
    const proibidos=new Set(alvo.map(rgb));
    let vistos=0; const ruins=[];
    ['cofre','brecho','guildas','propostas'].forEach(t=>{
      show(t);
      if(t==='cofre'){ cofAba='metas'; drawCofre() }
      document.querySelectorAll('#v-'+t+' .btn').forEach(bt=>{
        const cs=getComputedStyle(bt); vistos++;
        if(proibidos.has(cs.backgroundColor)||proibidos.has(cs.color)) ruins.push(t+': '+bt.textContent.trim().slice(0,20));
      });
    });
    return {vistos,ruins};
  });
  t(m.vistos>=4,'há botões suficientes para a varredura: '+m.vistos);
  t(m.ruins.length===0,'nenhum botão renderizado usa cor de área'+(m.ruins.length?' — '+m.ruins.join('; '):''));

  /* ============ o cabeçalho não roubou rótulo de campo ============ */
  m=await p.evaluate(()=>{
    show('orcar');
    const dentro=[...document.querySelectorAll('.arcab .lab')].length;
    const cabs=document.querySelectorAll('.arcab').length;
    return {dentro,cabs};
  });
  t(m.dentro===m.cabs,'cada cabeçalho embrulhou UM rótulo só — os rótulos de campo ficaram de fora');

  /* ============ e trocar de chapéu não traz o rótulo de volta ============
     o rótulo de Meus jobs ainda é reescrito por JS a cada chapéu — e tem
     de continuar fora de vista depois disso */
  m=await p.evaluate(()=>{
    const r=[];
    ['contratante','freela'].forEach(md=>{
      MODO=md; aplicarModo(); show('jobs'); drawJobs();
      r.push(v('jb-rot').getClientRects().length);
    });
    return r;
  });
  t(m.every(n=>n===0),'trocar de chapéu repinta o rótulo de Meus jobs sem trazê-lo de volta à tela');

  t(errs.length===0,'zero erro de console/página'+(errs.length?' — '+errs[0]:''));

  console.log('IDENTIDADE');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();
