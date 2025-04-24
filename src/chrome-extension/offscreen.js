let callMetadata = null;
const CHUNK_DURATION_MS = 30 * 1000; // 30 seconds

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target === "offscreen") {
    console.log("[offscreen] Received message:", message);
    switch (message.action) {
      case "start-recording":
        startRecording(message.streamId);
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
let recordId = null;
let micStream = null;
let tabStream = null;
let combinedStream = null;

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

  recordId = streamId;

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

  combinedStream = destination.stream;

  // Start recording.
  startChunkRecordingLoop(streamId);

  console.log("Recording started");
}

function startChunkRecordingLoop(recordId) {
  function recordChunk() {
    if (!combinedStream) {
      console.log("Combined stream not available");
      return;
    }
    let newRecorder = new MediaRecorder(combinedStream, {
      mimeType: "audio/webm",
    });
    recorder = newRecorder;

    newRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        const url = URL.createObjectURL(e.data);
        chrome.runtime.sendMessage({
          target: "background",
          action: "process-recording-chunk",
          url,
          recordId,
          filename: `recording-${recordId}-${Date.now()}.webm`,
          callMetadata: { ...callMetadata },
        });
      }
    };

    newRecorder.onstop = () => {
      // Start the next chunk recording
      setTimeout(recordChunk, 100);
    };

    newRecorder.start();

    setTimeout(() => {
      newRecorder.stop();
    }, CHUNK_DURATION_MS);
  }

  // Start the first chunk recording
  recordChunk();
}

async function stopRecording() {
  if (recorder) {
    recorder.stop();
  }

  [micStream, tabStream, combinedStream].forEach((stream) => {
    stream?.getTracks().forEach((t) => t.stop());
  });

  // Wait for the recorder to finish processing
  const recordingId = recordId;
  setTimeout(() => {
    chrome.runtime.sendMessage({
      target: "background",
      action: "process-recording-stop",
      recordId: recordingId,
    });
  }, 1000);

  // Reset the recording state
  recorder = null;
  recordId = null;
  micStream = null;
  tabStream = null;
  combinedStream = null;
  callMetadata = null;

  console.log("Recording saved");
}
