# MicScribe

Windows-only Electron app for recording a short audio clip and transcribing it
via Replicate (model: `openai/gpt-4o-transcribe`). No live transcription.

## Installation

```bash
npm install
```

## Environment variable

Set your Replicate token before running the app.

PowerShell (current session):

```powershell
$env:REPLICATE_API_TOKEN="your-token"
```

PowerShell (persist for your user):

```powershell
setx REPLICATE_API_TOKEN "your-token"
```

## Run

```bash
npm start
```

## Build / Installer

```bash
npm run make
```

This creates Windows Squirrel artifacts under `out/make/squirrel.windows/`.

## Usage

- Choose `Sprache` (German `de` or English `en`).
- Select a microphone.
- Click **Aufnehmen**, speak, then **Stop**.
- Wait for **Transcribing…** to finish and copy the result.

## Known limitations

- No live transcription (only after recording stops).
- Audio is recorded as WebM (Opus) when supported.
- Requires a working Replicate token and network access.
