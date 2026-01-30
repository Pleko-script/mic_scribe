export {};

type Language = 'de' | 'en';
type Theme = 'light' | 'dark' | 'system';

type Settings = {
  language: Language;
  preferredMicDeviceId: string | null;
  theme?: Theme;
};

declare global {
  interface Window {
    micscribe: {
      getSettings: () => Promise<Settings & { hasReplicateToken: boolean }>;
      setSettings: (
        updates: Partial<Settings>,
      ) => Promise<Settings & { hasReplicateToken: boolean }>;
      transcribeAudio: (payload: {
        audioBuffer: ArrayBuffer;
        mimeType?: string;
        language: Language;
      }) => Promise<string>;
      copyText: (text: string) => Promise<void>;
      setReplicateToken: (token: string) => Promise<{ hasReplicateToken: boolean }>;
      clearReplicateToken: () => Promise<{ hasReplicateToken: boolean }>;
    };
  }
}
