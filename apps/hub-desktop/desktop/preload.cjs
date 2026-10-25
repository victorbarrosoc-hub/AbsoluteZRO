// Ponte mínima para a página do HUB e para a tela "Sem conexão": diz que é o app de desktop (o HUB pode esconder o
// banner "baixe o app", por exemplo) e oferece "Tentar de novo". Nada do Node chega à página.

const { contextBridge, ipcRenderer } = require('electron')

const plataforma = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux'

contextBridge.exposeInMainWorld('zroDesktop', {
  isDesktop: true,
  plataforma,
  /** Volta para o HUB (tela "Sem conexão"). */
  tentarDeNovo: () => ipcRenderer.invoke('zro:tentar-de-novo'),
  /** Abre o endereço que falhou no navegador padrão (tela "Sem conexão"). */
  abrirNoNavegador: () => ipcRenderer.invoke('zro:abrir-no-navegador'),
})

addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('zro-desktop', `zro-desktop--${plataforma}`)
})
