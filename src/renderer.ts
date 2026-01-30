import './index.css';

type Language = 'de' | 'en';
type Theme = 'light' | 'dark' | 'system';

type Settings = {
  language: Language;
  preferredMicDeviceId: string | null;
  hasReplicateToken?: boolean;
  theme?: Theme;
};

const recordButton = document.querySelector<HTMLButtonElement>('#record-button');
const statusLine = document.querySelector<HTMLParagraphElement>('#status-line');
const transcriptArea = document.querySelector<HTMLTextAreaElement>('#transcript');
const copyButton = document.querySelector<HTMLButtonElement>('#copy-button');
const languageSelect = document.querySelector<HTMLSelectElement>('#language');
const micSelect = document.querySelector<HTMLSelectElement>('#microphone');
const apiTokenInput = document.querySelector<HTMLInputElement>('#api-token');
const saveTokenButton = document.querySelector<HTMLButtonElement>('#save-token');
const clearTokenButton =
  document.querySelector<HTMLButtonElement>('#clear-token');
const tokenStatus = document.querySelector<HTMLSpanElement>('#token-status');
const themeToggle = document.querySelector<HTMLButtonElement>('#theme-toggle');
const themeIcon = document.querySelector<HTMLSpanElement>('#theme-icon');

if (
  !recordButton ||
  !statusLine ||
  !transcriptArea ||
  !copyButton ||
  !languageSelect ||
  !micSelect ||
  !apiTokenInput ||
  !saveTokenButton ||
  !clearTokenButton ||
  !tokenStatus ||
  !themeToggle ||
  !themeIcon
) {
  throw new Error('UI Elemente fehlen im DOM.');
}

let currentStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let isRecording = false;
let isTranscribing = false;
let settings: Settings = { language: 'de', preferredMicDeviceId: null, theme: 'system' };

const updateTokenStatus = (hasToken: boolean) => {
  tokenStatus.textContent = hasToken ? 'Gespeichert' : 'Nicht gesetzt';
  tokenStatus.classList.toggle('success', hasToken);
};

// Theme management
const getSystemTheme = (): 'light' | 'dark' => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getEffectiveTheme = (theme: Theme): 'light' | 'dark' => {
  return theme === 'system' ? getSystemTheme() : theme;
};

const applyTheme = (theme: 'light' | 'dark') => {
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
};

const updateTheme = async (theme: Theme) => {
  const effectiveTheme = getEffectiveTheme(theme);
  applyTheme(effectiveTheme);
  settings = await window.micscribe.setSettings({ theme });
};

const cycleTheme = async () => {
  const currentTheme = settings.theme || 'light';
  const nextTheme: Theme =
    currentTheme === 'light' ? 'dark' :
    currentTheme === 'dark' ? 'system' :
    'light';
  await updateTheme(nextTheme);
};

// System theme change listener
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (settings.theme === 'system') {
    applyTheme(e.matches ? 'dark' : 'light');
  }
});

const primeMicrophoneAccess = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch (error) {
    handleError(
      error instanceof Error
        ? error
        : new Error('Mikrofonberechtigung fehlgeschlagen.'),
    );
  }
};

const setStatus = (text: string, isError = false) => {
  statusLine.textContent = text;
  statusLine.dataset.state = isError ? 'error' : 'normal';
};

const updateRecordButton = () => {
  recordButton.textContent = isRecording ? 'Stop' : 'Aufnehmen';
  recordButton.disabled = isTranscribing;
};

const getPreferredMimeType = (): string | undefined => {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
};

const stopActiveStream = () => {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }
};

const handleError = (error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unbekannter Fehler.';
  setStatus(`Error: ${message}`, true);
  isRecording = false;
  isTranscribing = false;
  updateRecordButton();
};

const refreshDevices = async () => {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) {
      throw new Error('Geräteabfrage wird nicht unterstützt.');
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((device) => device.kind === 'audioinput');

    micSelect.innerHTML = '';

    if (inputs.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Kein Mikrofon gefunden';
      micSelect.append(option);
      micSelect.disabled = true;
      return;
    }

    inputs.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Mikrofon ${index + 1}`;
      micSelect.append(option);
    });

    micSelect.disabled = false;

    const preferred =
      settings.preferredMicDeviceId &&
      inputs.some((device) => device.deviceId === settings.preferredMicDeviceId)
        ? settings.preferredMicDeviceId
        : null;

    if (preferred) {
      micSelect.value = preferred;
    } else {
      micSelect.selectedIndex = 0;
      const fallbackId = micSelect.value;
      if (fallbackId) {
        settings = await window.micscribe.setSettings({
          preferredMicDeviceId: fallbackId,
        });
      }
    }
  } catch (error) {
    handleError(error);
  }
};

const startRecording = async () => {
  if (isRecording || isTranscribing) {
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    handleError(new Error('Audioaufnahme wird nicht unterstützt.'));
    return;
  }

  if (typeof MediaRecorder === 'undefined') {
    handleError(new Error('MediaRecorder wird nicht unterstützt.'));
    return;
  }

  const deviceId = micSelect.value;
  const constraints: MediaStreamConstraints = deviceId
    ? { audio: { deviceId: { exact: deviceId } } }
    : { audio: true };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;

    const mimeType = getPreferredMimeType();
    mediaRecorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );

    chunks = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      try {
        stopActiveStream();
        isRecording = false;
        isTranscribing = true;
        updateRecordButton();
        setStatus('Transcribing…');

        const blob = new Blob(chunks, {
          type: mediaRecorder?.mimeType || 'audio/webm',
        });
        const audioBuffer = await blob.arrayBuffer();
        const language = languageSelect.value as Language;

        const transcript = await window.micscribe.transcribeAudio({
          audioBuffer,
          mimeType: blob.type,
          language,
        });

        transcriptArea.value = transcript || '';
        setStatus('Idle');
      } catch (error) {
        handleError(error);
      } finally {
        isTranscribing = false;
        updateRecordButton();
      }
    };

    mediaRecorder.start();
    isRecording = true;
    updateRecordButton();
    setStatus('Recording…');
  } catch (error) {
    handleError(error);
    stopActiveStream();
  }
};

const stopRecording = () => {
  if (!isRecording || !mediaRecorder) {
    return;
  }
  mediaRecorder.stop();
};

recordButton.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

copyButton.addEventListener('click', () => {
  const text = transcriptArea.value;
  if (!text) {
    return;
  }
  void window.micscribe.copyText(text);
  const original = copyButton.textContent;
  copyButton.textContent = 'Copied';
  setTimeout(() => {
    copyButton.textContent = original || 'Copy';
  }, 1200);
});

saveTokenButton.addEventListener('click', async () => {
  const token = apiTokenInput.value.trim();
  if (!token) {
    setStatus('Error: Bitte API-Key eingeben.', true);
    return;
  }
  try {
    const result = await window.micscribe.setReplicateToken(token);
    apiTokenInput.value = '';
    updateTokenStatus(result.hasReplicateToken);
    setStatus('API-Key gespeichert.');
  } catch (error) {
    handleError(error);
  }
});

clearTokenButton.addEventListener('click', async () => {
  try {
    const result = await window.micscribe.clearReplicateToken();
    updateTokenStatus(result.hasReplicateToken);
    setStatus('API-Key entfernt.');
  } catch (error) {
    handleError(error);
  }
});

languageSelect.addEventListener('change', async () => {
  const value = languageSelect.value as Language;
  settings = await window.micscribe.setSettings({ language: value });
});

micSelect.addEventListener('change', async () => {
  const value = micSelect.value || null;
  settings = await window.micscribe.setSettings({
    preferredMicDeviceId: value,
  });
});

themeToggle.addEventListener('click', () => {
  cycleTheme();
});

const init = async () => {
  try {
    settings = await window.micscribe.getSettings();
    languageSelect.value = settings.language;
    updateTokenStatus(Boolean(settings.hasReplicateToken));
    updateRecordButton();
    setStatus('Idle');

    // Apply theme
    const theme = settings.theme || 'system';
    const effectiveTheme = getEffectiveTheme(theme);
    applyTheme(effectiveTheme);
    settings.theme = theme;

    await primeMicrophoneAccess();
    await refreshDevices();
  } catch (error) {
    handleError(error);
  }
};

if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    refreshDevices();
  });
}

init();
