import {
  addToQueue,
  getFromQueue,
  removeFromQueue,
  getQueueAsArray,
  clearQueue,
} from "./queue.js";
import { transcribe, summarizeText } from "./openai.js";

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.target !== "fileProcessor") return;

  switch (message.action) {
    case "process-file":
      await processFile(message.fileId);
      break;
    case "retry":
      await processFile(message.fileId);
      break;
    case "delete":
      removeFromQueue(message.fileId);
      break;
    case "open":
      showTranscription(message.fileId);
      break;
    case "all":
      sendResponse(getQueueAsArray());
      return true; // Keep the message channel open for sendResponse
    case "clear":
      clearQueue();
      break;
  }
});

let isRecording = false;
let tabId = null;

// Watch for tab removal
chrome.tabs.onRemoved.addListener((deletedTabId, removeInfo) => {
  if (deletedTabId === tabId && isRecording) {
    console.log("Tab closed. Stopping recording...");
    stopRecording();
  }
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.target === "background") {
    console.log("[background] Received message:", message);
    switch (message.action) {
      case "toggle-recording":
        if (isRecording) {
          stopRecording();
        } else {
          startRecording(message.tabId);
        }
        break;
      case "stop-recording":
        stopRecording();
        break;
      case "process-recording-chunk":
        let chunk = await addRawFileChunkToQueue(
          message.recordId,
          message.url,
          message.filename,
          message.callMetadata,
        );
        await processFileChunk(chunk);
        break;
      case "process-recording-stop":
        await processFile(message.recordId);
        break;
    }
  }
});

// Start/stop recording on icon click
async function createOffscreenDocument() {
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
  }
}

async function startRecording(tabId) {
  console.log("Starting recording...");
  // Create an offscreen document if it doesn't exist.
  await createOffscreenDocument();
  // Get a MediaStream for the active tab.
  let streamId = null;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId,
    });
  } catch (error) {
    console.error("Error getting stream ID:", error);
    stopRecording();
    return;
  }

  // Send the stream ID to the offscreen document to start recording.
  chrome.runtime.sendMessage({
    target: "offscreen",
    action: "start-recording",
    streamId,
  });

  chrome.action.setIcon({ path: "icons/recording.png" });
  console.log("Recording started");
  isRecording = true;
}

async function stopRecording() {
  chrome.runtime.sendMessage({
    target: "offscreen",
    action: "stop-recording",
  });

  chrome.action.setIcon({ path: "icons/not-recording.png" });
  console.log("Recording stopped");
  isRecording = false;
}

function displayFileName(callMetadata) {
  let isoDate;
  if (callMetadata && callMetadata.timeStart) {
    isoDate = callMetadata.timeStart.substr(0, 19);
  } else {
    isoDate = new Date().toISOString().substr(0, 19);
  }
  const safeIsoDate = isoDate.replace(/:/g, "-");

  let title = callMetadata.title || "meeting";
  const cleanTitle = title.trim().replace(/\s+/g, "_");

  return `${safeIsoDate}-${cleanTitle}`;
}

async function addRawFileChunkToQueue(fileId, url, filename, callMetadata) {
  const audioFile = await fetch(url).then((r) => r.blob());
  const displayName = displayFileName(callMetadata);

  let item = getFromQueue(fileId);
  if (!item) {
    item = addToQueue(fileId, [], filename, displayName, callMetadata);
  }

  let chunk = item.addAduioChunk(audioFile);
  return chunk;
}

async function processFileChunk(chunk) {
  const settings = await chrome.storage.sync.get(["openai_token"]);

  const { transcriptionSegments, transcription } = await transcribe(
    chunk.audioFile,
    settings.openai_token,
  );
  chunk.transcription = transcription;
  chunk.transcriptionSegments = transcriptionSegments;
}

async function processFile(fileId) {
  const item = getFromQueue(fileId);
  if (!item) {
    console.error("Item not found in queue:", fileId);
    return;
  }

  try {
    // Ensure all chunks are transcribed
    item.setStatus("transcribing");
    for (let i = 0; i < item.blobChunks.length; i++) {
      const chunk = item.blobChunks[i];
      if (!("transcription" in chunk)) {
        await processFileChunk(chunk);
      }
    }

    await showTranscription(item.id);
    // Summarize the transcription
    const settings = await chrome.storage.sync.get([
      "openai_token",
      "summary_prompt",
    ]);
    let transcription = item.fullTranscription();
    console.debug("Transcription:", transcription);

    item.setStatus("summarizing");
    const summary = await summarizeText(
      transcription,
      settings.summary_prompt,
      settings.openai_token,
    );
    item.summary = summary;

    item.setStatus("success");
    chrome.runtime.sendMessage({
      target: "result",
      action: "updateSummary",
      item,
    });
  } catch (e) {
    console.error("Processing failed:", e);
    item.setStatus("error");
  }
}

async function showTranscription(fileId) {
  const item = getFromQueue(fileId);
  if (!item) {
    console.error("Item not found in queue:", fileId);
    return;
  }
  chrome.windows.create({
    url: chrome.runtime.getURL("result.html"),
    type: "popup",
    width: 900,
    height: 800,
  });
  setTimeout(() => {
    chrome.runtime.sendMessage({
      target: "result",
      action: "setResult",
      item,
    });
  }, 500);
}
