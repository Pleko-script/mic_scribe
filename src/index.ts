import 'dotenv/config';
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import Store from 'electron-store';

// Webpack entry points injected by Electron Forge.
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

type Language = 'de' | 'en';

type Settings = {
  language: Language;
  preferredMicDeviceId: string | null;
};

type SettingsStore = {
  get: <Key extends keyof Settings>(key: Key) => Settings[Key];
  set: (value: Partial<Settings>) => void;
};

const store = new Store<Settings>({
  defaults: {
    language: 'de',
    preferredMicDeviceId: null,
  },
}) as unknown as SettingsStore;

const getSettings = (): Settings => ({
  language: store.get('language'),
  preferredMicDeviceId: store.get('preferredMicDeviceId'),
});

const updateSettings = (updates: Partial<Settings>): Settings => {
  const current = getSettings();
  const next: Settings = {
    language: current.language,
    preferredMicDeviceId: current.preferredMicDeviceId,
  };

  if (updates.language === 'de' || updates.language === 'en') {
    next.language = updates.language;
  }
  if (
    typeof updates.preferredMicDeviceId === 'string' ||
    updates.preferredMicDeviceId === null
  ) {
    next.preferredMicDeviceId = updates.preferredMicDeviceId;
  }

  store.set(next);
  return next;
};

type ReplicateClient = {
  files: {
    create: (args: { content: NodeJS.ReadableStream }) => Promise<unknown>;
  };
  run: (
    model: string,
    args: { input: { audio_file: unknown; language: Language } },
  ) => Promise<unknown>;
};

let replicateClient: ReplicateClient | null = null;

const ensureReplicateClient = async () => {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error(
      'REPLICATE_API_TOKEN ist nicht gesetzt. Bitte als Environment-Variable setzen.',
    );
  }

  if (!replicateClient) {
    const mod = await import('replicate');
    replicateClient = new mod.default({ auth: token }) as unknown as ReplicateClient;
  }
  return replicateClient;
};

const normalizeTranscript = (output: unknown): string => {
  if (Array.isArray(output)) {
    return output.join('');
  }
  if (typeof output === 'string') {
    return output;
  }
  if (output && typeof output === 'object' && 'text' in output) {
    const text = (output as { text?: unknown }).text;
    if (Array.isArray(text)) {
      return text.join('');
    }
    if (typeof text === 'string') {
      return text;
    }
  }
  return output ? JSON.stringify(output) : '';
};

const normalizeError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unbekannter Fehler bei der Transkription.';
};

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

app.setAppUserModelId('com.micscribe.app');

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    height: 700,
    width: 920,
    minHeight: 560,
    minWidth: 720,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
};

ipcMain.handle('settings:get', () => getSettings());

ipcMain.handle('settings:set', (_event, updates: Partial<Settings>) => {
  return updateSettings(updates);
});

ipcMain.handle(
  'transcribe-audio',
  async (
    _event,
    payload: { audioBuffer: ArrayBuffer; mimeType?: string; language: Language },
  ) => {
    const { audioBuffer, mimeType, language } = payload;
    if (!audioBuffer) {
      throw new Error('Keine Audiodaten empfangen.');
    }

    const extension = mimeType?.includes('wav')
      ? '.wav'
      : mimeType?.includes('ogg')
        ? '.ogg'
        : '.webm';

    const tempPath = path.join(
      app.getPath('temp'),
      `micscribe-${randomUUID()}${extension}`,
    );

    await fs.promises.writeFile(tempPath, Buffer.from(audioBuffer));

    try {
      const replicate = await ensureReplicateClient();
      const file = await replicate.files.create({
        content: fs.createReadStream(tempPath),
      });
      const output = await replicate.run('openai/gpt-4o-transcribe', {
        input: {
          audio_file: file,
          language,
        },
      });
      return normalizeTranscript(output);
    } catch (error) {
      console.error('Transcription failed:', error);
      throw new Error(normalizeError(error));
    } finally {
      fs.promises.unlink(tempPath).catch(() => undefined);
    }
  },
);

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
