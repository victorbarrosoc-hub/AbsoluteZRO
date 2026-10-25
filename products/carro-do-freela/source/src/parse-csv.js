const fs=require('fs');
const raw=fs.readFileSync('/root/.claude/uploads/b1715c8c-b81a-5ec0-8e40-ca8c8ac04eb3/339d5073-FREELAS_AUDIOVISUAL__BRASIL__Pa_gina1.csv','utf8');

/* RFC4180 */
function parseCSV(s){
  const rows=[];let row=[],f='',q=false;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(q){ if(c==='"'){ if(s[i+1]==='"'){f+='"';i++} else q=false } else f+=c }
    else if(c==='"') q=true;
    else if(c===','){ row.push(f);f='' }
    else if(c==='\r'){}
    else if(c==='\n'){ row.push(f);rows.push(row);row=[];f='' }
    else f+=c;
  }
  if(f||row.length){row.push(f);rows.push(row)}
  return rows;
}
const rows=parseCSV(raw);
const head=rows.shift();

const A=s=>(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase();
const clean=s=>(s||'').replace(/\s+/g,' ').trim();

/* ---- taxonomia de funções ---- */
const REGRAS=[
  [/DIR(ECAO|\.)? ?(DE )?FOTOGRAFIA|DIRETOR DE FOTOGRAFIA|\bDOP\b/,'Direção de fotografia'],
  [/\bFPV\b/,'Op. de FPV'],
  [/DRONE/,'Op. de drone'],
  [/GIMBAL/,'Op. de gimbal'],
  [/OP (DE )?LIVE|\bDTV\b|DIRETOR TECNICO/,'Op. de live'],
  [/COLORISTA/,'Colorista'],
  [/REAL ?TIME/,'Editor realtime'],
  [/MOTION|\bVFX\b|ANIMADOR/,'Motion / VFX'],
  [/GAFFER/,'Gaffer'],
  [/STORYMAKER|STORY ?-/,'Storymaker'],
  [/PRODUTOR/,'Produtor'],
  [/LIDER DE EQUIPE/,'Líder de equipe'],
  [/ASSISTENTE|ASS\.? ?DIRECAO|1[º°O] AC/,'Assistente'],
  [/\bDIT\b/,'DIT'],
  [/EDITOR|EDICAO|FINALIZADOR/,'Editor'],
  [/FOTOGRAF|FOTO ?-/,'Fotógrafo'],
  [/OP ?(ERADOR)? ?(DE )?CAM|CINEGRAFISTA|VIDEOMAKER|FILMMAKER|VIDEO ?MAKER|CAPTACAO/,'Op. de câmera'],
  [/DIRECAO|DIRETOR/,'Direção'],
  [/DESIGNER|WEBDESIGN/,'Designer'],
];
function funcsDe(...campos){
  const t=A(campos.join(' | '));
  const out=[];
  for(const [re,nome] of REGRAS){
    const m=t.match(re);
    if(m&&!out.some(x=>x.n===nome)) out.push({n:nome,i:t.indexOf(m[0])});
  }
  return out.sort((a,b)=>a.i-b.i).map(x=>x.n);
}

/* ---- cidades ---- */
const CIDADES=['Natal','Parnamirim','Mossoró','Caicó','João Câmara','Goianinha','João Pessoa','Patos','Sousa','Fortaleza','Recife','Goiânia','São Paulo','Caraúbas','Guamaré','São Gonçalo do Amarante','Jardim de Piranhas','Santa Cruz','Serra de São Bento','Boa Saúde','Caiçara do Norte','Seridó'];
const naoAchou=new Set();
function cidadeDe(rawC){
  const t=A(rawC);
  if(!clean(rawC)) return {cidade:'Não informado',uf:''};
  const achadas=CIDADES.map(c=>({c,i:t.indexOf(A(c))})).filter(x=>x.i>=0).sort((a,b)=>a.i-b.i).map(x=>x.c);
  if(t.includes('JOAO PESSO')&&!achadas.includes('João Pessoa')) achadas.push('João Pessoa');
  const uf=(t.match(/\b(RN|PB|PE|CE|GO|SP|PI|MG|BA|SE|AL|MA)\b/g)||[]);
  if(!achadas.length){
    if(uf.length){ naoAchou.add(clean(rawC)); return {cidade:uf.length>1?uf.join(' · '):uf[0],uf:uf[0]} }
    naoAchou.add(clean(rawC)); return {cidade:'Não informado',uf:''};
  }
  const principal=achadas[0];
  const ufP=uf[0]||'RN';
  return {cidade:principal+'/'+ufP, uf:ufP, extras:achadas.length-1};
}

/* ---- equipamento ---- */
const MARCAS=[[/\bSONY\b/gi,'Sony'],[/\bC[ÂA]NON\b/gi,'Canon'],[/\bNIKON\b/gi,'Nikon'],[/\bIPHONE\b/gi,'iPhone'],[/\bGOPRO\b/gi,'GoPro'],[/\bLUMIX\b/gi,'Lumix'],[/\bINSTA ?360\b/gi,'Insta360'],[/\bDJI\b/gi,'DJI'],[/\bBMPCC\b/gi,'BMPCC'],[/\bMECBOOK\b/gi,'MacBook']];
function marca(s){let o=clean(s);for(const[re,r]of MARCAS)o=o.replace(re,r);return o}
function camTags(s){
  const t=marca(s);
  if(!t) return [];
  return t.split(/\s*[\/|+]\s*|\s*,\s*/).map(x=>clean(x)).filter(Boolean).slice(0,3);
}

const crew=[];
rows.forEach((r,idx)=>{
  const nome=clean(r[0]);
  if(!nome) return;
  const cam=marca(r[2]), lentes=marca(r[3]);
  const gim=/^SIM/i.test(clean(r[4])), dro=/^SIM/i.test(clean(r[5]));
  let principal=funcsDe(r[6]).slice(0,3);
  let fs=funcsDe(r[6],r[7]);
  if(gim&&!fs.includes('Op. de gimbal')) fs.push('Op. de gimbal');
  if(dro&&!fs.includes('Op. de drone')) fs.push('Op. de drone');
  if(!fs.length) fs=['Não informado'];
  const {cidade,extras}=cidadeDe(r[12]);
  const nichoRaw=clean(r[9]);
  const nicho=/TODAS AS ALTERNATIVAS/i.test(nichoRaw)?['Todos os nichos']:(nichoRaw?nichoRaw.split(/\s*,\s*/).map(clean).filter(Boolean):[]);
  /* portfólio */
  let port=clean(r[10]),handle=null;
  const m=port.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if(m) handle='@'+m[1];
  else if(/^@/.test(port)) handle=port.split(/\s+/)[0];
  else if(/behance\.net\/([A-Za-z0-9._-]+)/i.test(port)) handle=port.match(/behance\.net\/([A-Za-z0-9._-]+)/i)[0];
  else if(/^https?:\/\/|^www\./i.test(port)) handle=port.replace(/^https?:\/\//,'').split(/[\/\s?]/)[0];
  else if(/@/.test(port)) handle=(port.match(/@[A-Za-z0-9._]+/)||[])[0]||null;
  const tags=[...camTags(r[2])];
  if(dro) tags.push('Drone');
  if(gim) tags.push('Gimbal');
  crew.push({
    id:idx+1, nome,
    func:fs, principal:principal.length?principal:['Perfil incompleto'], cidade, extras:extras||0,
    cam:cam||'Não informado', lentes:lentes||'—',
    gim,dro, transporte:clean(r[11])||'—',
    nicho, port:handle, obs:clean(r[13]||''),
    tags:tags.slice(0,5),
    me:/victor barroso/i.test(nome), incompleto:fs[0]==='Não informado'
  });
});

fs.writeFileSync('crew.json',JSON.stringify(crew,null,0));
const todas=[...new Set(crew.flatMap(c=>c.func))].sort();
console.log('total:',crew.length);
console.log('funções:',JSON.stringify(todas));
console.log('cidades:',JSON.stringify([...new Set(crew.map(c=>c.cidade))].sort()));
console.log('cidades não reconhecidas:',JSON.stringify([...naoAchou]));
console.log('sem função:',crew.filter(c=>c.func[0]==='Não informado').map(c=>c.nome));
console.log('eu:',crew.filter(c=>c.me).map(c=>c.nome));
