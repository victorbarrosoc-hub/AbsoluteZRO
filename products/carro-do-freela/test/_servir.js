/* SERVE public/index.html NUM ORIGIN HTTP.
 *
 * ⚠️ POR QUE ISTO EXISTE: o Chromium descarta o localStorage de origem
 * `file://` de vez em quando — aqui deu 1 em 14 recarregamentos. O sintoma
 * é uma suíte de persistência falhando em lugar diferente a cada rodada,
 * como se alguma função estivesse limpando o depósito sozinha.
 *
 * Como se prova que não é o produto: escreva uma chave que NÃO está em
 * `USO_APAGAVEIS` antes do reload. Se ela morrer também, o culpado é o
 * ambiente e nenhuma linha do arquivo está envolvida. Foi o que aconteceu.
 *
 * ⚠️ RESPONDA 204 NO QUE NÃO FOR A PÁGINA, NUNCA `route.abort()`. Em origem
 * http o Chromium pede `/favicon.ico` sozinho, e `abort()` vira
 * `net::ERR_FAILED` no console — que quase toda suíte trata como reprovação.
 *
 * ⚠️ O `_` no começo do nome mantém este ajudante FORA da lista de suítes
 * (`run.js` filtra `!f.startsWith('_')`). Sem isso ele entraria na conta e
 * "passaria" sem uma asserção sequer.
 */
const fs=require('fs'), path=require('path');
const ARQ=path.resolve(__dirname,'..','public','index.html');
const URL='http://cdf.test/';
/* (18/out · 2) a mídia mora em public/m/, ao lado da página: sem servir a
   pasta, toda suíte em http veria imagem quebrada e vídeo mudo */
const TIPOS={'.webp':'image/webp','.mp4':'video/mp4','.png':'image/png','.jpg':'image/jpeg'};
const servir=pg=>pg.route('**/*',r=>{
  const u=r.request().url();
  if(u===URL||u.startsWith(URL+'?'))
    return r.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync(ARQ,'utf8')});
  if(u.startsWith(URL+'m/')){
    const f=path.join(path.dirname(ARQ),'m',path.basename(decodeURIComponent(u.slice((URL+'m/').length).split('?')[0])));
    if(fs.existsSync(f)) return r.fulfill({contentType:TIPOS[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});
  }
  return r.fulfill({status:204,body:''});
});
module.exports={servir,URL,ARQ};
