import './index.css';
import { createIcons, icons } from 'lucide';

type Language = 'de' | 'en';
type Theme = 'light' | 'dark' | 'system';

type Settings = {
  language: Language;
  preferredMicDeviceId: string | null;
  hasReplicateToken?: boolean;
  theme?: Theme;
};

// DOM Elements
const recordButton = document.querySelector<HTMLButtonElement>('#record-button');
const statusLine = document.querySelector<HTMLParagraphElement>('#status-line');
const transcriptArea = document.querySelector<HTMLTextAreaElement>('#transcript');
const copyButton = document.querySelector<HTMLButtonElement>('#copy-button');
const languageSelect = document.querySelector<HTMLSelectElement>('#language');
const micSelect = document.querySelector<HTMLSelectElement>('#microphone');
const apiTokenInput = document.querySelector<HTMLInputElement>('#api-token');
const saveTokenButton = document.querySelector<HTMLButtonElement>('#save-token');
const clearTokenButton = document.querySelector<HTMLButtonElement>('#clear-token');
const tokenStatus = document.querySelector<HTMLSpanElement>('#token-status');
const themeToggle = document.querySelector<HTMLButtonElement>('#theme-toggle');
const getThemeIcon = () => document.querySelector<HTMLElement>('#theme-icon');
const settingsButton = document.querySelector<HTMLButtonElement>('#settings-button');
const showResultButton = document.querySelector<HTMLButtonElement>('#show-result-button');
const recordAgainButton = document.querySelector<HTMLButtonElement>('#record-again-button');

// Modal Elements
const settingsModal = document.querySelector<HTMLDivElement>('#settings-modal');
const resultModal = document.querySelector<HTMLDivElement>('#result-modal');

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
  !getThemeIcon() ||
  !settingsButton ||
  !settingsModal ||
  !resultModal ||
  !showResultButton ||
  !recordAgainButton
) {
  throw new Error('UI Elemente fehlen im DOM.');
}

let currentStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let isRecording = false;
let isTranscribing = false;
let settings: Settings = { language: 'de', preferredMicDeviceId: null, theme: 'system' };

// Modal Management
const openModal = (modal: HTMLDivElement) => {
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

const closeModal = (modal: HTMLDivElement) => {
  modal.classList.remove('active');
  document.body.style.overflow = '';
};

// Setup modal close handlers
const setupModalCloseHandlers = (modal: HTMLDivElement) => {
  const overlay = modal.querySelector('.modal-overlay');
  const closeButton = modal.querySelector('.modal-close');

  if (overlay) {
    overlay.addEventListener('click', () => closeModal(modal));
  }

  if (closeButton) {
    closeButton.addEventListener('click', () => closeModal(modal));
  }

  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal(modal);
    }
  });
};

setupModalCloseHandlers(settingsModal);
setupModalCloseHandlers(resultModal);

// Settings Button
settingsButton.addEventListener('click', () => {
  openModal(settingsModal);
});

showResultButton.addEventListener('click', () => {
  openModal(resultModal);
});

recordAgainButton.addEventListener('click', () => {
  closeModal(resultModal);
  // Start recording immediately
  startRecording();
});

// Theme Management
const getSystemTheme = (): 'light' | 'dark' => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getEffectiveTheme = (theme: Theme): 'light' | 'dark' => {
  return theme === 'system' ? getSystemTheme() : theme;
};

const applyTheme = (theme: 'light' | 'dark') => {
  document.documentElement.setAttribute('data-theme', theme);
  const themeIcon = getThemeIcon();
  if (themeIcon) {
    themeIcon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
  }
  // Re-create the icon
  createIcons({ icons });
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

themeToggle.addEventListener('click', () => {
  cycleTheme();
});

// Token Status
const updateTokenStatus = (hasToken: boolean) => {
  tokenStatus.textContent = hasToken ? 'Gespeichert' : 'Nicht gesetzt';
  tokenStatus.classList.toggle('success', hasToken);
};

// Microphone Access
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

// Status
const setStatus = (text: string, isError = false) => {
  statusLine.textContent = text;
  statusLine.dataset.state = isError ? 'error' : 'normal';
};

// Record Button
const updateRecordButton = () => {
  const icon = recordButton.querySelector('.record-icon');
  const text = recordButton.querySelector('.record-text');

  if (icon && text) {
    if (isRecording) {
      text.textContent = 'Stop';
    } else if (isTranscribing) {
      text.textContent = 'Verarbeitung';
    } else {
      text.textContent = 'Aufnehmen';
    }
  }

  recordButton.disabled = isTranscribing;
  recordButton.dataset.recording = isRecording ? 'true' : 'false';
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

// Device Management
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

// Recording
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
        setStatus('Wird transkribiert...');

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
        setStatus('Bereit zum Aufnehmen');

        // Open result modal
        openModal(resultModal);
        // Show the result button for later access
        showResultButton.style.display = 'flex';
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
    setStatus('Aufnahme läuft...');
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

// Event Listeners
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
  copyButton.dataset.copied = 'true';

  // Close modal after short delay
  setTimeout(() => {
    copyButton.dataset.copied = 'false';
    closeModal(resultModal);
    // Show the result button so user can reopen if needed
    showResultButton.style.display = 'flex';
  }, 500);
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

// Initialization
const init = async () => {
  try {
    settings = await window.micscribe.getSettings();
    languageSelect.value = settings.language;
    updateTokenStatus(Boolean(settings.hasReplicateToken));
    updateRecordButton();
    setStatus('Bereit zum Aufnehmen');

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

// Initialize Lucide icons
createIcons({ icons });

init();
