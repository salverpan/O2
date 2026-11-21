const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('o2Browser', {
  isElectron: true,
  getState: () => ipcRenderer.invoke('o2-browser:get-state'),
  setViewport: (rect) => ipcRenderer.invoke('o2-browser:set-viewport', rect),
  setViewportFast: (rect) => ipcRenderer.send('o2-browser:viewport-fast', rect),
  newTab: (url) => ipcRenderer.invoke('o2-browser:new-tab', url),
  switchTab: (tabId) => ipcRenderer.invoke('o2-browser:switch-tab', tabId),
  closeTab: (tabId) => ipcRenderer.invoke('o2-browser:close-tab', tabId),
  navigate: (url, tabId) => ipcRenderer.invoke('o2-browser:navigate', { url, tabId }),
  goBack: () => ipcRenderer.invoke('o2-browser:back'),
  goForward: () => ipcRenderer.invoke('o2-browser:forward'),
  reload: () => ipcRenderer.invoke('o2-browser:reload'),
  stop: () => ipcRenderer.invoke('o2-browser:stop'),
  toggleDevTools: () => ipcRenderer.invoke('o2-browser:devtools'),
  capturePreview: () => ipcRenderer.invoke('o2-browser:capture-preview'),
  setCoPanel: (patch) => ipcRenderer.invoke('o2-browser:set-co-panel', patch),
  onState: (cb) => {
    if (typeof cb !== 'function') return () => {}
    const listener = (_event, state) => cb(state)
    ipcRenderer.on('o2-browser:state', listener)
    return () => ipcRenderer.removeListener('o2-browser:state', listener)
  },
})
