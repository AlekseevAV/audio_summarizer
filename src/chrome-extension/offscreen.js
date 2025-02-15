let callMetadata = null;

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target === "offscreen") {
    switch (message.action) {
      case "start-recording":
        startRecording(message.data);
        break;
      case "stop-recording":
        stopRecording();
        break;
      case "mic-mute-change":
        micMuteChange(message.data);
        break;
      case "call-metadata":
        callMetadata = message.data;
        break;
      default:
        throw new Error("Unrecognized message:", message.action);
    }
  }
});

let recorder;
let recordedChunks = [];
let micStream = null;
let tabStream = null;

async function micMuteChange(isMuted) {
  if (!micStream) {
    console.log("Microphone stream not captured yet");
    return;
  }
  if (isMuted) {
    micStream.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
  } else {
    micStream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
  }
}

async function startRecording(streamId) {
  if (recorder?.state === "recording") {
    throw new Error("Called startRecording while recording is in progress.");
  }

  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  micStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });
  console.log("Microphone stream captured:", micStream);

  // Continue to play the captured audio to the user.
  const output = new AudioContext();
  const source = output.createMediaStreamSource(tabStream);
  source.connect(output.destination);

  // Combine the tab and mic streams.
  const audioContext = new AudioContext();
  const tabSource = audioContext.createMediaStreamSource(tabStream);
  const micSource = audioContext.createMediaStreamSource(micStream);
  const destination = audioContext.createMediaStreamDestination();

  // Connect the streams.
  tabSource.connect(destination);
  micSource.connect(destination);

  // Start recording.
  recorder = new MediaRecorder(destination.stream, { mimeType: "video/webm" });
  recorder.ondataavailable = onChunkReceived;
  recorder.onstop = saveRecording;
  recorder.start();

  window.location.hash = "recording";

  console.log("Recording started");
}

async function stopRecording() {
  recorder.stop();

  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
  }

  if (tabStream) {
    tabStream.getTracks().forEach((t) => t.stop());
  }

  recorder.stream.getTracks().forEach((t) => t.stop());

  window.location.hash = "";
  console.log("Recording stopped");
}

function saveRecording() {
  console.log("Saving recording");
  const blob = new Blob(recordedChunks, { type: "audio/webm" });
  const url = URL.createObjectURL(blob);

  // Download the audio file
  chrome.runtime.sendMessage({
    target: "background",
    action: "save-recording",
    url: url,
    filename: `google-meet-recording-${Date.now()}.webm`,
    callMetadata: Object.assign({}, callMetadata),
  });

  // Reset the recording state
  recordedChunks = [];
  micStream = null;
  tabStream = null;
  callMetadata = null;

  console.log("Recording saved");
}

async function onChunkReceived(event) {
  console.log("Audio chunk received");
  const chunk = event.data;
  recordedChunks.push(chunk);
}
