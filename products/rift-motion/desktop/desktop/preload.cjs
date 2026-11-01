// Ponte mínima para a página do Rift Motion e para a tela "Sem conexão": diz que é o app de computador e oferece
// "Tentar de novo" e "Abrir no navegador". Nada do Node chega à página.

const { contextBridge, ipcRenderer } = require('electron')

const plataforma = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux'

contextBridge.exposeInMainWorld('riftDesktop', {
  isDesktop: true,
  plataforma,
  /** Volta para o Rift Motion (tela "Sem conexão"). */
  tentarDeNovo: () => ipcRenderer.invoke('rift:tentar-de-novo'),
  /** Abre o endereço que falhou no navegador padrão (tela "Sem conexão"). */
  abrirNoNavegador: () => ipcRenderer.invoke('rift:abrir-no-navegador'),
})

addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('rift-motion-desktop', `rift-motion-desktop--${plataforma}`)
})
