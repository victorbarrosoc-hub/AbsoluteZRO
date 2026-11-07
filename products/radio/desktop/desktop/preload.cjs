// Ponte entre a página do RADION e o app de computador. A página conta o estado do rádio (diária, canal, falando,
// silenciado, mãos levantadas, ligado) e pede notificações; o app manda comandos (falar pelo atalho, modo compacto).
// Na tela "Sem conexão", "Tentar de novo" e "Abrir no navegador". Nada do Node chega à página.

const { contextBridge, ipcRenderer } = require('electron')

const plataforma = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux'

contextBridge.exposeInMainWorld('radionDesktop', {
  isDesktop: true,
  plataforma,
  /** Volta para o RADION (tela "Sem conexão"). */
  tentarDeNovo: () => ipcRenderer.invoke('radion:tentar-de-novo'),
  /** Abre o endereço que falhou no navegador padrão (tela "Sem conexão"). */
  abrirNoNavegador: () => ipcRenderer.invoke('radion:abrir-no-navegador'),
  /** O estado do rádio, para a barra de menus, o selo do ícone e o "não dormir" (o app confere cada campo). */
  estado: (e) => ipcRenderer.send('radion:estado', e && typeof e === 'object' ? e : {}),
  /** Notificação do sistema (aviso de set, pedido da palavra), só quando a janela não está na frente. */
  notificar: (titulo, corpo) => ipcRenderer.send('radion:notificar', String(titulo || ''), String(corpo || '')),
  /** Entra ou sai do modo compacto (a janelinha por cima das outras). */
  compacto: (ligar) => ipcRenderer.send('radion:compacto', !!ligar),
  /** Comandos do app: 'alternar-fala' (atalho ou barra de menus) e { compacto: boolean }. Devolve o cancelamento. */
  onComando(cb) {
    const f = (_e, comando) => cb(comando)
    ipcRenderer.on('radion:comando', f)
    return () => ipcRenderer.removeListener('radion:comando', f)
  },
  /** O atalho de falar registrado no sistema (ex.: "⌘⇧Espaço"), ou null se nenhum ficou livre. */
  atalho: () => ipcRenderer.invoke('radion:atalho'),
})

addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('radion-desktop', `radion-desktop--${plataforma}`)
})
