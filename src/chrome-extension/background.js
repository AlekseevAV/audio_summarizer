let isRecording = false;
let tabId = null;

// Watch for tab updates
chrome.tabs.onUpdated.addListener((changedTabId, changeInfo, tab) => {
  if (
    changedTabId === tabId &&
    changeInfo.status === "complete" &&
    isRecording
  ) {
    console.log("Tab updated. Stopping recording...");
    console.log("tab:", tab);
    stopRecording();
  }
});

// Watch for tab removal
chrome.tabs.onRemoved.addListener((deletedTabId, removeInfo) => {
  if (deletedTabId === tabId && isRecording) {
    console.log("Tab closed. Stopping recording...");
    stopRecording();
  }
});

// Start/stop recording on icon click
chrome.action.onClicked.addListener(async (activeTab) => {
  tabId = activeTab.id;
  let recording = false;
  console.log("Clicked on icon. Tab ID:", tabId);

  const existingContexts = await chrome.runtime.getContexts({});
  const offscreenDocument = existingContexts.find(
    (c) => c.contextType === "OFFSCREEN_DOCUMENT",
  );

  // If an offscreen document is not already open, create one.
  if (!offscreenDocument) {
    // Create an offscreen document.
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: "Recording from chrome.tabCapture API",
    });
  } else {
    recording = offscreenDocument.documentUrl.endsWith("#recording");
  }
  console.log("Recording status:", recording);

  if (recording) {
    stopRecording();
  } else {
    startRecording(tabId);
  }
});

async function startRecording(tabId) {
  // Get a MediaStream for the active tab.
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tabId,
  });

  // Send the stream ID to the offscreen document to start recording.
  chrome.runtime.sendMessage({
    target: "offscreen",
    action: "start-recording",
    data: streamId,
  });

  chrome.action.setIcon({ path: "icons/recording.png" });
  isRecording = true;
}

function stopRecording() {
  chrome.runtime.sendMessage({
    target: "offscreen",
    action: "stop-recording",
  });
  chrome.action.setIcon({ path: "icons/not-recording.png" });

  console.log("Recording stopped");
  isRecording = false;
}

function stopStream(stream) {
  if (!stream) return;
  console.log("Stopping stream...");
  // Stop all tracks in the stream
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
}

async function saveRecording(message) {
  console.log("Saving recording");

  // chrome.downloads.download({
  //   url: message.url,
  //   filename: message.filename,
  //   saveAs: true,
  // });

  let audioFile = await fetch(message.url)
    .then((response) => response.blob())
    .then((blob) => {
      console.log("Audio blob:", blob);
      return blob;
    });

  console.log("Call metadata to send on server: ", message.callMetadata);

  let formData = new FormData();
  formData.append("audioFile", audioFile, "audio.webm");
  formData.append("callMetadata", JSON.stringify(message.callMetadata));

  fetch("http://127.0.0.1:8995/transcribe", {
    method: "POST",
    body: formData,
  })
    .then((response) => response.json())
    .then((data) => {
      console.log("Transcription:", data.transcription);
      chrome.windows.create({
        url: chrome.runtime.getURL("popup.html"),
        type: "popup",
        width: 500,
        height: 790,
      });
      setTimeout(() => {
        chrome.runtime.sendMessage({
          target: "popup",
          action: "updatePopup",
          data: {
            transcription: data.transcription,
            callMetadata: message.callMetadata,
          },
        });
      }, 1000);
    })
    .catch((error) => console.error("Error:", error));
}

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target === "background") {
    switch (message.action) {
      case "save-recording": {
        await saveRecording(message);
        break;
      }
      case "stop-recording": {
        stopRecording();
        break;
      }
    }
  }
});
