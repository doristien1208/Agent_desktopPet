const { contextBridge, ipcRenderer } = require('electron');

// A fixed API: the renderer cannot choose arbitrary IPC channels or use Node.
const subscribe = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('desktopPet', {
  bootstrap: () => ipcRenderer.invoke('pet:bootstrap'),
  sendMessage: text => ipcRenderer.invoke('pet:message', text),
  cancel: () => ipcRenderer.invoke('pet:cancel'),
  chatNow: () => ipcRenderer.invoke('pet:autonomy-now'),
  clearHistory: () => ipcRenderer.invoke('pet:clear'),
  settings: value => ipcRenderer.invoke('pet:settings', value),
  confirm: (requestId, approved) => ipcRenderer.invoke('pet:confirm', { requestId, approved }),
  setInteractive: value => ipcRenderer.send('pet:interactive', value),
  drag: phase => ipcRenderer.send('pet:drag', phase),
  onHistory: callback => subscribe('history-updated', callback),
  onResponse: callback => subscribe('agent-response', callback),
  onStatus: callback => subscribe('agent-status', callback),
  onTask: callback => subscribe('task-state', callback),
  onAutonomy: callback => subscribe('autonomy-state', callback),
  onConfirmation: callback => subscribe('request-confirmation', callback)
});
