/* O CÓDIGO QUE O NAVEGADOR RECEBE, por inteiro (26/out).
 * Desde 26/out o script e o CSS saem do HTML para m/ (arquivos com hash), e
 * as partes do app que só carregam quando a tela abre também moram lá. Suíte
 * que lê "o fonte do build" (som chamado pelo nome, chave no HTML…) lê isto:
 * o HTML mais todo .js/.css de m/ citado por ele, e o que esses citam. */
const fs = require('fs'), path = require('path');
module.exports = function fonteDoBuild(arqHtml) {
  const pasta = path.dirname(arqHtml), vistos = new Set(), partes = [];
  const ler = txt => {
    partes.push(txt);
    for (const m of txt.matchAll(/m\/[\w@.-]+\.(?:js|css)\b/g)) {
      if (vistos.has(m[0])) continue; vistos.add(m[0]);
      const f = path.join(pasta, m[0]);
      if (fs.existsSync(f)) ler(fs.readFileSync(f, 'utf8'));
    }
  };
  ler(fs.readFileSync(arqHtml, 'utf8'));
  return partes.join('\n');
};
