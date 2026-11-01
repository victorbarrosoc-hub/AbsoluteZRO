// Ponte mínima para a página do Rift Motion e para a tela "Sem conexão": diz que é o app de computador, oferece
// "Tentar de novo" e "Abrir no navegador", a barra de progresso no Dock e o aviso de geração pronta. Os menus mandam
// comandos para a página pelo evento rift:comando (main.cjs). Nada do Node chega à página.

const { contextBridge, ipcRenderer } = require('electron')

const plataforma = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux'

contextBridge.exposeInMainWorld('riftDesktop', {
  isDesktop: true,
  plataforma,
  /** Volta para o Rift Motion (tela "Sem conexão"). */
  tentarDeNovo: () => ipcRenderer.invoke('rift:tentar-de-novo'),
  /** Abre o endereço que falhou no navegador padrão (tela "Sem conexão"). */
  abrirNoNavegador: () => ipcRenderer.invoke('rift:abrir-no-navegador'),
  /** Barra de progresso no Dock/barra de tarefas enquanto a IA gera: 0 a 1, 2 = sem medida, -1 tira. */
  progresso: (p) => ipcRenderer.send('rift:progresso', Number(p)),
  /** Notificação do sistema (só aparece com a janela atrás ou minimizada; clicar traz o Rift para a frente). */
  avisar: (titulo, texto) => ipcRenderer.send('rift:avisar', String(titulo || ''), String(texto || '')),
})

addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('rift-motion-desktop', `rift-motion-desktop--${plataforma}`)
})
