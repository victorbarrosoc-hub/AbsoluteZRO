/* Guarda estreita contra o bug que já apareceu três vezes aqui: usar como
   modificador (.et.ok, .fl.ok, .vitem.fim2) um nome que também existe como
   classe raiz com estilo próprio. O modificador herda layout que ninguém
   pediu — centraliza texto, vira grid — e o estrago é sutil.
   Também confere id duplicado. */
const { chromium } = require('playwright');
const path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:900}});
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto('file://'+path.resolve(__dirname,'..','public','index.html'),{waitUntil:'networkidle'});
  if(process.env.AUTOTESTE) await p.evaluate(()=>{         /* semeia o defeito conhecido, para provar que a guarda pega */
    const d=document.createElement("div"); d.className="fl ok leitura";
    d.innerHTML="<i>x</i><span>y</span>"; document.body.appendChild(d);
    /* e o defeito de CONTEXTO: um componente qualquer com a classe `ok`
       caindo dentro de um .mdl, que é onde `.mdl .ok` centraliza tudo */
    const m=document.createElement("div"); m.className="mdl";
    m.innerHTML='<div class="dsi ok"><b>z</b></div>'; document.body.appendChild(m);
  });
  const r=await p.evaluate(()=>{
    const sels=[];
    /* CSSStyleRule passou a ter .cssRules (lista vazia, mas truthy) quando o
       Chrome ganhou CSS aninhado — o "if(r.cssRules) return" de antes fazia
       esta varredura devolver zero seletor, e a guarda inteira virou no-op. */
    const varrer=rs=>[...rs].forEach(r=>{
      if(r.selectorText) r.selectorText.split(",").forEach(s=>sels.push(s.trim()));
      if(r.cssRules && r.cssRules.length) varrer(r.cssRules);
    });
    [...document.styleSheets].forEach(ss=>{try{varrer(ss.cssRules)}catch(e){}});

    const limpo=s=>s.replace(/:{1,2}[a-z-]+(\([^)]*\))?/g,"").replace(/\[[^\]]*\]/g,"").trim();
    /* classes que existem sozinhas, com estilo próprio */
    const raiz=new Set(sels.map(limpo).filter(s=>/^\.[\w-]+$/.test(s)).map(s=>s.slice(1)));
    /* classes usadas como modificador: .algo.mod (último segmento sem espaço) */
    const conflitos=[];
    sels.forEach(s=>{
      const c=limpo(s); if(!c) return;
      const ultimo=c.split(/\s+/).pop();
      if(!ultimo.startsWith(".")) return;   /* textarea.fld é elemento+classe, não modificador */
      const partes=ultimo.split(".").filter(Boolean);
      if(partes.length<2) return;
      partes.slice(1).forEach(mod=>{
        if(raiz.has(mod)) conflitos.push(s+"  ⟵  .“"+mod+"” também é classe raiz");
      });
    });
    /* Segunda guarda, do lado do DOM. A primeira só olha o CSS, e por isso
       deixou passar class="fl ok leitura": o seletor .leitura.ok é legítimo
       sozinho — o defeito foi um elemento de OUTRO componente juntar por
       acidente as duas classes e herdar fundo e borda que ninguém pediu.
       Heurística: o elemento casa com uma regra composta .X.Y cuja base X
       não é a classe principal (a primeira) dele. */
    const compostos=[];
    const regrasComp=sels.map(s=>({s,c:limpo(s)}))
      .filter(o=>o.c && !/\s/.test(o.c) && (o.c.match(/\./g)||[]).length>1 && /^\./.test(o.c));
    document.querySelectorAll("[class]").forEach(el=>{
      const cls=[...el.classList]; if(cls.length<2) return;
      regrasComp.forEach(({s,c})=>{
        const partes=c.split(".").filter(Boolean);
        if(!partes.every(x=>el.classList.contains(x))) return;
        /* Ordem de escrita é o que separa composição de acidente. Quem
           escreve "wrap cols sotranca" põe o componente antes do seu
           modificador. O defeito tem a forma inversa: em "fl ok leitura",
           o "ok" foi escrito como modificador de .fl e o .leitura caiu
           depois, por acaso — o modificador aparece ANTES da base. */
        const iBase=cls.indexOf(partes[0]);
        const iMod=Math.min(...partes.slice(1).map(x=>cls.indexOf(x)));
        if(iMod>iBase) return;
        compostos.push('class="'+cls.join(" ")+'"  casa com  '+s);
      });
    });

    /* Terceira guarda, e ela nasceu de um defeito real: `.dsi.ok` dentro do
       dossiê saiu com o texto centralizado porque existe `.mdl .ok{
       place-items:center;text-align:center}` — o painel de sucesso dos
       modais. As duas guardas acima passaram batido: `.ok` NUNCA é classe
       raiz aqui, ela só existe como DESCENDENTE de `.mdl`. Então qualquer
       elemento com a classe `ok` que caia dentro de um `.mdl` herda o
       centro, venha de que componente vier.

       Heurística: para cada regra `.X .Y` (descendente), se algum elemento
       da página tem a classe Y, está dentro de um `.X`, e Y NÃO é a
       primeira classe dele (ou seja, Y ali é modificador de outra coisa),
       a regra do ancestral vai pegar ele sem ninguém ter pedido. */
    const contextuais=[];
    const regrasDesc=sels.map(s=>({s,c:limpo(s)}))
      .map(o=>{const t=o.c.split(/\s+/).filter(Boolean);
        return {s:o.s,anc:t[0],alvo:t[t.length-1],n:t.length};})
      .filter(o=>o.n===2&&/^\.[\w-]+$/.test(o.anc)&&/^\.[\w-]+$/.test(o.alvo));
    regrasDesc.forEach(({s,anc,alvo})=>{
      const a=anc.slice(1), y=alvo.slice(1);
      document.querySelectorAll("."+CSS.escape(y)).forEach(el=>{
        const cls=[...el.classList];
        if(cls[0]===y) return;                 /* é o componente dele mesmo */
        if(!el.closest("."+CSS.escape(a))) return;
        contextuais.push('class="'+cls.join(" ")+'" dentro de .'+a+'  casa com  '+s);
      });
    });

    const ids={},dup=[];
    document.querySelectorAll("[id]").forEach(e=>{ids[e.id]=(ids[e.id]||0)+1});
    Object.entries(ids).forEach(([k,n])=>{if(n>1)dup.push(k+" ×"+n)});
    return {conflitos:[...new Set(conflitos)],compostos:[...new Set(compostos)],
            contextuais:[...new Set(contextuais)],idsDuplicados:dup};
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
  /* ⚠️ A GUARDA PRECISA DERRUBAR A SUÍTE, e não só imprimir.
     Ela achou pf-lista duplicado (o modal do plano de freela escrevendo
     por cima de "Trabalhos publicados") e mesmo assim a bateria fechou
     36 de 36 verde: o processo saía com 0. Guarda que não reprova não é
     guarda, é registro. O AUTOTESTE semeia colisão de classe, então nele
     a reprovação é o resultado esperado. */
  /* Oito conflitos são heurística batendo em coisa que funciona: o nome
     do modificador coincide com uma classe raiz, mas as regras não se
     atropelam de fato. Ficam listados aqui para que QUALQUER novo caia
     na reprovação — a lista é a memória, não uma anistia geral. */
  const CONHECIDOS=[".gcard.eu",".ivsel.an",".pres.s-livre",".pres.s-segura",
    ".pres.s-ocupado",".disp.s-livre",".disp.s-segura",".disp.s-ocupado"];
  const novos=r.conflitos.filter(x=>!CONHECIDOS.some(k=>x.startsWith(k+"  ")));
  /* A guarda de contexto não consegue distinguir composição DE PROPÓSITO de
     herança por acidente — `.cmp .cplano` estilizando `.ccab.cplano` é
     desenho, `.mdl .ok` centralizando `.dsi.ok` é acidente, e as duas têm a
     mesma forma. Então a lista é por REGRA, não por marcação: estas cinco
     foram olhadas e são intencionais. Regra nova cai na reprovação e alguém
     olha — que é o trabalho que a guarda existe para forçar. */
  const CTX_CONHECIDOS=[".revelar .rv",".cmp .cplano",".cmp .cdest",".cx .lgpe",".cx .lgnota"];
  const ctxNovos=r.contextuais.filter(x=>!CTX_CONHECIDOS.some(k=>x.endsWith(k)));
  const falhas=novos.length+r.compostos.length+ctxNovos.length+r.idsDuplicados.length;
  if(process.env.AUTOTESTE){
    console.log(falhas?"\nAUTOTESTE ok — a guarda acusou o defeito semeado":"\nAUTOTESTE FALHOU — a guarda não viu o defeito");
    process.exit(falhas?0:1);
  }
  if(falhas){
    console.log("\n"+falhas+" colisão(ões) NOVA(S) — id duplicado ou classe que se atropela.");
    if(novos.length) console.log("  classe: "+novos.join("\n  classe: "));
    if(ctxNovos.length) console.log("  contexto: "+ctxNovos.join("\n  contexto: "));
    if(r.idsDuplicados.length) console.log("  id: "+r.idsDuplicados.join("\n  id: "));
    process.exit(1);
  }
})();
