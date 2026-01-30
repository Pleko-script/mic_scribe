import { contextBridge, ipcRenderer } from 'electron';

type Language = 'de' | 'en';
type Theme = 'light' | 'dark' | 'system';

type Settings = {
  language: Language;
  preferredMicDeviceId: string | null;
  theme?: Theme;
};

contextBridge.exposeInMainWorld('micscribe', {
  getSettings: (): Promise<Settings & { hasReplicateToken: boolean }> =>
    ipcRenderer.invoke('settings:get'),
  setSettings: (
    updates: Partial<Settings>,
  ): Promise<Settings & { hasReplicateToken: boolean }> =>
    ipcRenderer.invoke('settings:set', updates),
  transcribeAudio: (payload: {
    audioBuffer: ArrayBuffer;
    mimeType?: string;
    language: Language;
  }): Promise<string> => ipcRenderer.invoke('transcribe-audio', payload),
  copyText: (text: string): Promise<void> =>
    ipcRenderer.invoke('clipboard:write', text ?? ''),
  setReplicateToken: (
    token: string,
  ): Promise<{ hasReplicateToken: boolean }> =>
    ipcRenderer.invoke('replicate:set-token', token),
  clearReplicateToken: (): Promise<{ hasReplicateToken: boolean }> =>
    ipcRenderer.invoke('replicate:clear-token'),
});
