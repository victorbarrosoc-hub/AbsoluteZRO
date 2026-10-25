/**
 * NENHUM NOME REAL FORA DO crew.local.json
 *
 * ⚠️ ESTA SUÍTE JÁ PROVOU O VALOR DELA, e da pior maneira: em 23/ago um
 * reset de container devolveu `src/crew.json` com os 109 NOMES REAIS por
 * cima da lista fictícia, e reverteu junto o CLAUDE.md e um guia que
 * citavam uma pessoa de verdade como exemplo. Nada disso chegou a sair
 * daqui — mas a suíte que existe para pegar isso tinha sido apagada pelo
 * mesmo reset, e por alguns minutos o build local teve nome real dentro.
 *
 * ⚠️ TROCAR O crew.json NÃO ALCANÇA O RESTO, e a limpeza de 21/ago falhou
 * pela metade por isso. Três arquivos continuavam com gente de verdade e
 * só apareceram por acidente ao empacotar o projeto: um nome usado como
 * EXEMPLO no CLAUDE.md, um passo a passo que mandava conferir um nome na
 * tela, e — o pior — o campo "com quem" de um contrato de locação numa
 * fixture de teste, atribuindo a uma pessoa real um empréstimo que nunca
 * existiu.
 *
 * Ela varre o repositório inteiro, e procura tanto o nome completo quanto
 * a FORMA REDUZIDA ("Ana S."), que é como o build anônimo publica — foi
 * a reduzida que escapou na segunda rodada.
 *
 * ⚠️ ELA PASSOU A VALER SEM A LISTA REAL (13/set), e a razão é que a lista
 * real deixou de existir. O `crew.local.json` vivia só dentro do container,
 * por decisão de desenho; o container foi reciclado levando o diretório
 * inteiro, e com ele o arquivo. A regra funcionou como projetada — o dado
 * real nunca chegou ao repositório, e eu confirmei isso varrendo os 63
 * commits desta árvore: o `crew.json` tem UM ÚNICO conteúdo em toda a
 * história, sempre o fictício. O custo da regra é este, e sempre foram as
 * duas faces da mesma moeda.
 *
 * Victor, ao decidir: *"não quero a lista original com os nomes da
 * planilha, era só pra eu visualizar a plataforma com nomes reais. Pode
 * deixar os fictícios e quando for lançar não vai ter nenhum nome inscrito,
 * pq as pessoas vão começar a se cadastrar do zero."* O PRD já dizia o
 * mesmo: os 109 são lista de CONVOCAÇÃO, não contas pré-criadas.
 *
 * ⚠️ O FURO DO ARRANJO ANTIGO, dito com todas as letras: a trava exigia,
 * para autorizar a publicação, justamente o único dado do projeto que não
 * tinha cópia em lugar nenhum. Enquanto o arquivo existia isso parecia
 * rigor; no dia em que ele sumiu, virou uma publicação travada para sempre.
 *
 * O que substituiu: um SELO. `src/crew.selo.json` guarda o sha256 da lista
 * fictícia aprovada, e ele pega o mesmo cenário de 23/ago — um reset
 * trocando o seed — sem precisar do dado real dentro do container. O selo
 * pode ser versionado porque não expõe ninguém: é a impressão digital do
 * arquivo que JÁ é público.
 *
 * Hoje ela roda em três camadas, e as duas primeiras valem SEMPRE:
 *   1. o selo bate, e o seed não tem telefone dentro;
 *   2. nenhum arquivo do projeto tem jeito de telefone;
 *   3. se o cofre local existir um dia, a varredura completa volta.
 */
const fs=require('fs'), path=require('path');
const RAIZ=path.resolve(__dirname,'..');
const LOCAL=path.join(RAIZ,'src','crew.local.json');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);

const sair=()=>{
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, 0 erros');
  process.exit(bad.length?1:0);
};

const crypto=require('crypto');

/* ============ 1. O SELO — vale sempre, com ou sem cofre ============ */
const CREW=path.join(RAIZ,'src','crew.json');
const bytesCrew=fs.readFileSync(CREW);
const ficticia=JSON.parse(bytesCrew);
const sha=crypto.createHash('sha256').update(bytesCrew).digest('hex');

const SELO=path.join(RAIZ,'src','crew.selo.json');
t(fs.existsSync(SELO),'src/crew.selo.json existe — sem ele não há contra o que conferir');
if(fs.existsSync(SELO)){
  const selo=JSON.parse(fs.readFileSync(SELO,'utf8'));
  /* ⚠️ A MENSAGEM DE FALHA TEM DE DIZER O QUE FAZER, e o que NÃO fazer.
     Quem vê "o selo não bate" às pressas tende a reselar para destravar —
     que é precisamente o movimento errado se a causa foi um reset. */
  t(selo.sha256===sha,
    'o crew.json bate com o selo da lista fictícia'
    +(selo.sha256===sha?' ('+ficticia.length+' cadastros)'
      :'\n      ✗ SELADO: '+selo.sha256.slice(0,16)+'…  ('+selo.registros+' registros, começa em "'+selo.primeiro+'")'
       +'\n      ✗ AGORA:  '+sha.slice(0,16)+'…  ('+ficticia.length+' registros, começa em "'+(ficticia[0]||{}).nome+'")'
       +'\n      → alguma coisa trocou src/crew.json. Se foi reset de container,'
       +'\n        recupere o arquivo do repositório — NÃO rode selar-crew.js.'));
  t(selo.registros===ficticia.length,
    'e tem os '+selo.registros+' cadastros que o selo registra'
    +(selo.registros===ficticia.length?'':' — achei '+ficticia.length));
}

/* ============ 2. TELEFONE — a restrição nº 1, e ela não precisa
   de lista nenhuma para ser conferida ============ */
const RE_FONE=/\b(?:\+?55[\s-]*)?\(?\d{2}\)?[\s-]*9?\d{4}[-\s]?\d{4}\b/;
t(!/"(fone|telefone|celular|whats\w*)"\s*:/i.test(bytesCrew.toString('utf8'))
  && !RE_FONE.test(bytesCrew.toString('utf8')),
  'o crew.json não tem telefone nem campo de telefone dentro');

if(!fs.existsSync(LOCAL)){
  console.log('\nO cofre src/crew.local.json não existe neste container.');
  console.log('A lista real foi aposentada em 13/set (decisão do Victor): no');
  console.log('lançamento ninguém nasce cadastrado. O selo e a varredura de');
  console.log('telefone acima valeram; a varredura contra a lista real, não —');
  console.log('ela volta sozinha se o cofre um dia voltar.');
  ok.push('sem cofre local: o selo e o telefone foram conferidos mesmo assim');
  sair();
}

/* ============ 3. A VARREDURA COMPLETA — só quando há cofre ============ */
const reais=JSON.parse(fs.readFileSync(LOCAL,'utf8'));

/* o que procurar: nome completo E a forma que o build anônimo publica */
const formas=new Set();
const nomesFicticios=new Set(ficticia.map(c=>String(c.nome).toLowerCase().trim()));
reais.forEach(c=>{
  const n=String(c.nome||'').trim();
  if(n.length<6) return;
  /* ⚠️ o próprio Victor é dado real E é o perfil de demonstração — ele
     aparece de propósito, e travar nele seria a suíte gritando para
     sempre. Todo o resto é gente que preencheu um cadastro. */
  if(/victor\s+barroso/i.test(n)) return;
  if(nomesFicticios.has(n.toLowerCase())) return;   /* coincidiu com o seed */
  formas.add(n.toLowerCase());
  const ps=n.split(/\s+/).filter(Boolean);
  if(ps.length>1) formas.add((ps[0]+' '+ps[ps.length-1][0]+'.').toLowerCase());
});
t(formas.size>50,'a lista local tem '+reais.length+' pessoas, '+formas.size+' formas para procurar');

/* onde procurar: tudo que é do projeto, menos o que não é texto nosso */
const PULA=new Set(['node_modules','.git','saida','.vercel']);
const EXT=/\.(html|js|cjs|mjs|json|md|txt|css|ts)$/i;
const arquivos=[];
(function varrer(d){
  for(const nome of fs.readdirSync(d)){
    if(PULA.has(nome)) continue;
    const p=path.join(d,nome), st=fs.statSync(p);
    if(st.isDirectory()){ varrer(p); continue }
    if(!EXT.test(nome)) continue;
    if(p===LOCAL) continue;                    /* o cofre pode ter os nomes */
    if(st.size>12*1024*1024) continue;         /* build gigante entra por outro caminho */
    arquivos.push(p);
  }
})(RAIZ);
t(arquivos.length>40,'varrendo '+arquivos.length+' arquivos do projeto');

const achados=[];
for(const p of arquivos){
  const txt=fs.readFileSync(p,'utf8').toLowerCase();
  for(const f of formas){
    if(txt.includes(f)) achados.push(path.relative(RAIZ,p)+'  →  "'+f+'"');
  }
}
t(achados.length===0,'nenhum nome real fora do crew.local.json'
  +(achados.length?':\n      '+achados.slice(0,12).join('\n      ')
    +(achados.length>12?'\n      … e mais '+(achados.length-12):''):''));

/* ⚠️ e o crew.json versionado precisa SER o fictício — não basta não ter
   nome real espalhado, o seed em si já foi trocado por engano uma vez */
const iguais=ficticia.filter((c,i)=>reais[i]&&c.nome===reais[i].nome&&!/victor/i.test(c.nome)).length;
t(iguais===0,'src/crew.json é a lista FICTÍCIA, não a real'
  +(iguais?' — '+iguais+' nomes batem com a local':''));
t(ficticia.length===reais.length,
  'e tem o mesmo tamanho da real ('+ficticia.length+'), para as telas não mudarem de forma');

sair();
