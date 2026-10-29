// Ponte mínima para a página do Maestro e para a tela "Sem conexão": diz que é o app de computador e oferece
// "Tentar de novo" e "Abrir no navegador". Nada do Node chega à página.

const { contextBridge, ipcRenderer } = require('electron')

const plataforma = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux'

contextBridge.exposeInMainWorld('maestroDesktop', {
  isDesktop: true,
  plataforma,
  /** Volta para o Maestro (tela "Sem conexão"). */
  tentarDeNovo: () => ipcRenderer.invoke('maestro:tentar-de-novo'),
  /** Abre o endereço que falhou no navegador padrão (tela "Sem conexão"). */
  abrirNoNavegador: () => ipcRenderer.invoke('maestro:abrir-no-navegador'),
})

addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('maestro-desktop', `maestro-desktop--${plataforma}`)
})
