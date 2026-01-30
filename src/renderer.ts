import './index.css';

type Language = 'de' | 'en';

type Settings = {
  language: Language;
  preferredMicDeviceId: string | null;
};

const recordButton = document.querySelector<HTMLButtonElement>('#record-button');
const statusLine = document.querySelector<HTMLParagraphElement>('#status-line');
const transcriptArea = document.querySelector<HTMLTextAreaElement>('#transcript');
const copyButton = document.querySelector<HTMLButtonElement>('#copy-button');
const languageSelect = document.querySelector<HTMLSelectElement>('#language');
const micSelect = document.querySelector<HTMLSelectElement>('#microphone');

if (
  !recordButton ||
  !statusLine ||
  !transcriptArea ||
  !copyButton ||
  !languageSelect ||
  !micSelect
) {
  throw new Error('UI Elemente fehlen im DOM.');
}

let currentStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let isRecording = false;
let isTranscribing = false;
let settings: Settings = { language: 'de', preferredMicDeviceId: null };

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
  window.micscribe.copyText(text);
  const original = copyButton.textContent;
  copyButton.textContent = 'Copied';
  setTimeout(() => {
    copyButton.textContent = original || 'Copy';
  }, 1200);
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

const init = async () => {
  try {
    settings = await window.micscribe.getSettings();
    languageSelect.value = settings.language;
    updateRecordButton();
    setStatus('Idle');
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
