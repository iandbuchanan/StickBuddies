// The only doors between the buddies and your PC: see windows, hear music, know where the mouse is.
const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['windows', 'brain', 'music', 'save-now', 'focus'];

contextBridge.exposeInMainWorld('pc', {
  mouseOver: over => ipcRenderer.send('mouse-over', !!over),
  music: () => ipcRenderer.invoke('music-list'),
  loadMemory: () => ipcRenderer.sendSync('load-memory'),
  saveMemory: data => ipcRenderer.send('save-memory', data),
  saveLikes: text => ipcRenderer.send('save-likes', text),
  writeCode: (who, file, text) => ipcRenderer.invoke('write-code', who, file, text),
  on: (ch, fn) => { if (EVENTS.includes(ch)) ipcRenderer.on(ch, (_e, data) => fn(data)); },
});
