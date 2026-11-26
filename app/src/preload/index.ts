// The shell's bridge. Nothing here is reachable from a page: pages get src/preload/tab.ts.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { CH, type Command, type Event, type WeftApi } from '../shared/ipc';

const api: WeftApi = {
  getState: () => ipcRenderer.invoke(CH.state),
  send: (cmd: Command) => ipcRenderer.send(CH.command, cmd),
  on: (cb: (e: Event) => void) => {
    const h = (_e: IpcRendererEvent, e: Event): void => cb(e);
    ipcRenderer.on(CH.event, h);
    return () => { ipcRenderer.removeListener(CH.event, h); };
  }
};

contextBridge.exposeInMainWorld('weft', api);
