// Ponte mínima para a página do Carro do Freela e para a tela "Sem conexão": diz que é o app de computador e oferece
// "Tentar de novo" e "Abrir no navegador". Nada do Node chega à página.

const { contextBridge, ipcRenderer } = require('electron')

const plataforma = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux'

contextBridge.exposeInMainWorld('carroDesktop', {
  isDesktop: true,
  plataforma,
  /** Volta para o Carro do Freela (tela "Sem conexão"). */
  tentarDeNovo: () => ipcRenderer.invoke('carro:tentar-de-novo'),
  /** Abre o endereço que falhou no navegador padrão (tela "Sem conexão"). */
  abrirNoNavegador: () => ipcRenderer.invoke('carro:abrir-no-navegador'),
})

addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('carro-desktop', `carro-desktop--${plataforma}`)
})
