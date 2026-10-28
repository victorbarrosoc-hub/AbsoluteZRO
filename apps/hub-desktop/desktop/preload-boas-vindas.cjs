// Ponte da tela de boas-vindas (desktop/paginas/boas-vindas.html): os apps disponíveis, instalar os escolhidos e
// fechar. Só ids e um sim/não passam; o que baixar vem do catálogo, no processo principal.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('zroBoasVindas', {
  /** { apps: [{ id, nome, versao, tamanho, instalado }], abrirComSistema: boolean|null } */
  dados: () => ipcRenderer.invoke('boas:dados'),
  instalar: (ids, abrirComSistema) => ipcRenderer.invoke('boas:instalar', Array.isArray(ids) ? ids.map(String).slice(0, 20) : [], !!abrirComSistema),
  fechar: (abrirComSistema) => ipcRenderer.invoke('boas:fechar', !!abrirComSistema),
  aoProgresso: (fn) => {
    const ouvinte = (_e, ev) => fn(ev)
    ipcRenderer.on('boas:progresso', ouvinte)
    return () => ipcRenderer.removeListener('boas:progresso', ouvinte)
  },
})
