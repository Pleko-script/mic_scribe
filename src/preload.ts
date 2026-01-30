import { contextBridge, ipcRenderer, clipboard } from 'electron';

type Language = 'de' | 'en';

type Settings = {
  language: Language;
  preferredMicDeviceId: string | null;
};

contextBridge.exposeInMainWorld('micscribe', {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (updates: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:set', updates),
  transcribeAudio: (payload: {
    audioBuffer: ArrayBuffer;
    mimeType?: string;
    language: Language;
  }): Promise<string> => ipcRenderer.invoke('transcribe-audio', payload),
  copyText: (text: string): void => clipboard.writeText(text ?? ''),
});
