// Ponte entre a interface (página web) e o Mac/Windows. Só expõe o mínimo, sem dar Node à página.
const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('sobedesce', {
  desktop: true,
  platform: process.platform,
  pickFolder: (opts = {}) => ipcRenderer.invoke('sobedesce:pick-folder', opts),
  pickPaths: (opts = {}) => ipcRenderer.invoke('sobedesce:pick-paths', opts),
  pathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  setProgress: (fraction, activeCount, proxies) => ipcRenderer.send('sobedesce:progress', { fraction, activeCount, proxies }),
  notify: (title, body) => ipcRenderer.send('sobedesce:notify', { title, body }),
  openExternal: url => ipcRenderer.invoke('sobedesce:open-external', url),
  // Versão nova: quem atualiza é a central Absolute ZRO (absolutezro://apps/sobedesce?acao=atualizar; sem ela, a página).
  abrirCentral: () => ipcRenderer.invoke('sobedesce:abrir-central'),
  reveal: path => ipcRenderer.invoke('sobedesce:reveal', path),
  // macOS: abre Ajustes do Sistema na Rede Local ou no Firewall (o Wi-Fi com o celular precisa dos dois liberados).
  abrirAjustesRede: qual => ipcRenderer.invoke('sobedesce:abrir-ajustes-rede', qual === 'firewall' ? 'firewall' : 'rede-local'),
  // Referências: abre o navegador de referências (janela própria; desktop/navegador.js).
  abrirNavegador: url => ipcRenderer.invoke('sobedesce:abrir-navegador', url || null),
  // "Preparar no Synquei" (cartão ou pasta baixada): o link synquei://organizar → { aberto, para: synquei|central|site }.
  abrirSynquei: link => ipcRenderer.invoke('sobedesce:abrir-synquei', String(link || '')),
  // Ajustes → "Minimizar para a bandeja": { disponivel, minimizar, padrao } (desktop/bandeja.js).
  bandeja: () => ipcRenderer.invoke('sobedesce:bandeja'),
  definirBandeja: ligado => ipcRenderer.invoke('sobedesce:bandeja-definir', !!ligado),
  // Links sobedesce:// (desktop/links.js), já conferidos: { tipo: 'relay', destinos } ou { tipo: 'looks' }. Devolve a função de desligar.
  aoLink: cb => {
    const f = (_event, link) => cb(link)
    ipcRenderer.on('sobedesce:link', f)
    return () => ipcRenderer.removeListener('sobedesce:link', f)
  },
})
