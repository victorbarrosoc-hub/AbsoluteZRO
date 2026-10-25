const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'nossomDesktop',
  Object.freeze({
    getUpdateState: () => ipcRenderer.invoke('nossom:update:state'),
    update: (action) =>
      ['check', 'download', 'install'].includes(action)
        ? ipcRenderer.invoke('nossom:update:command', action)
        : Promise.reject(new Error('Invalid update action')),
    onUpdate: (listener) => {
      const handler = (_event, state) => listener(state);
      ipcRenderer.on('nossom:update:state', handler);
      return () => ipcRenderer.removeListener('nossom:update:state', handler);
    },
  }),
);
