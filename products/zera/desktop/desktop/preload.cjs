// ZERA · a ponte da interface com o app (window.zera). Só funções com nome; nada do Node chega à página.
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

const chamar =
  (nome) =>
  (...args) =>
    ipcRenderer.invoke('zera:' + nome, ...args)

const ouvintes = new Set()
ipcRenderer.on('zera:evento', (_e, m) => {
  for (const f of ouvintes) f(m)
})

contextBridge.exposeInMainWorld('zera', {
  info: chamar('info'),
  tema: chamar('tema'),
  discos: chamar('discos'),
  escolherPasta: chamar('escolherPasta'),
  varrer: chamar('varrer'),
  carregar: chamar('carregar'),
  parar: chamar('parar'),
  abrir: chamar('abrir'),
  anel: chamar('anel'),
  achar: chamar('achar'),
  sugestoes: chamar('sugestoes'),
  duplicados: chamar('duplicados'),
  previa: chamar('previa'),
  moverParaLixo: chamar('moverParaLixo'),
  mostrar: chamar('mostrar'),
  abrirLixo: chamar('abrirLixo'),
  abrirPermissoes: chamar('abrirPermissoes'),
  pronto: chamar('pronto'),
  aoEvento(f) {
    if (typeof f !== 'function') return () => {}
    ouvintes.add(f)
    return () => ouvintes.delete(f)
  },
})
