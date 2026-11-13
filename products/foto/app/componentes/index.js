// Os componentes do sistema visual, num import só:
//   import { Controle, Segmentado, Pilulas, Chave, Menu, Folha, FolhaAtalhos, avisar, Vazio, Esqueleto, Progresso,
//            ProgressoAnel, Numero, Tecla, Estrelas, Marca, Ponto, Marcar } from '../../componentes/index.js'
// A Dica é só CSS: data-dica="texto" (e data-tecla="P") em qualquer botão. Estilos em app/foto.css.

export { Controle, Segmentado, Pilulas, Chave, Menu, Vazio, Esqueleto, Progresso, ProgressoAnel, Numero, Tecla, usarMarca, formatarValor } from './base.js'
export { Folha, FolhaAtalhos } from './folha.js'
export { avisar, fecharAviso, Avisos } from './aviso.js'
export { Estrelas, Marca, Ponto, Marcar } from './marcas.js'
export { Icone, NOMES_DE_ICONE } from '../icones.js'
