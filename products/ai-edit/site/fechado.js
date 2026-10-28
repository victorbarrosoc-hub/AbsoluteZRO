// "Em desenvolvimento" (em-desenvolvimento.html): a marca do AEON sai do mesmo código do app e do site (src/marca.js),
// na cor do texto, nos dois temas. Nada mais roda nesta página.
import { simbolo, wordmark } from '../src/marca.js'

for (const n of document.querySelectorAll('[data-marca="simbolo"]')) n.innerHTML = simbolo({ titulo: false })
for (const n of document.querySelectorAll('[data-marca="nome"]')) n.innerHTML = wordmark()
