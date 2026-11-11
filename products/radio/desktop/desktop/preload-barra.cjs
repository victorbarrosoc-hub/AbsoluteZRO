// Ponte da barra de título do Mac (desktop/paginas/barra.html): voltar, avançar, recarregar e o estado da página.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('zroBarra', {
  acao: (nome) => ipcRenderer.invoke('barra:acao', String(nome)),
  onEstado(cb) {
    const f = (_e, estado) => cb(estado)
    ipcRenderer.on('barra:estado', f)
    return () => ipcRenderer.removeListener('barra:estado', f)
  },
})
