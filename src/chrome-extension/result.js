// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "result") {
    switch (message.action) {
      case "setResult":
        fillFormWithData(message.item);
        break;
      case "updateSummary":
        document.getElementById("summary").value = message.item.summary || "";
        break;
      default: {
        console.error("Unrecognized message:", message.action);
      }
    }
  } else if (message.target === "queueEvent") {
    switch (message.action) {
      case "status-update":
        updateStatus(message.item.status);
        break;
      case "summary-update":
        document.getElementById("summary").value = message.item.summary || "";
        break;
    }
  }
});

function updateStatus(status) {
  statusBadge = document.getElementById("status");
  statusBadge.textContent = status;
  let statusClass = "status-" + status;
  statusBadge.classList.add(statusClass);
}

// Function to fill form with received data
function fillFormWithData(item) {
  let metadata = item.callMetadata;
  let now = new Date().toLocaleString();
  let participatns;
  if (metadata.participants && metadata.participants.length > 0) {
    participatns = metadata.participants.map((p) => p.name).join(", ");
  } else {
    participatns = "";
  }

  const transcription = segmentsToTimelineText(item.blobChunks);

  updateStatus(item.status);
  document.getElementById("displayName").value = item.displayName || "";
  document.getElementById("header-title").textContent = metadata.title || "Meeting";
  document.getElementById("title").value = metadata.title || "Meeting";
  document.getElementById("time").value = metadata.time || now;
  document.getElementById("location").value = metadata.location || "";
  document.getElementById("participants").value = participatns;
  document.getElementById("description").value = metadata.description || "";
  document.getElementById("transcription").value = transcription || "";
  document.getElementById("summary").value = item.summary || "";
}

function formatTimestamp(seconds) {
  const date = new Date(seconds * 1000);
  return date.toISOString().substr(11, 8); // HH:mm:ss
}

function segmentsToTimelineText(chunks) {
  let fullTimeline = [];
  let totalOffset = 0;

  for (const chunk of chunks) {
    if (!chunk.transcriptionSegments) continue;

    for (const segment of chunk.transcriptionSegments) {
      const adjustedStart = segment.start + totalOffset;
      const adjustedEnd = segment.end + totalOffset;
      fullTimeline.push({
        start: adjustedStart,
        end: adjustedEnd,
        text: segment.text,
      });
    }

    // Найти последний сегмент в чанке, чтобы вычислить оффсет для следующего чанка
    const lastSegment = chunk.transcriptionSegments.at(-1);
    if (lastSegment) {
      totalOffset += lastSegment.end;
    }
  }

  return fullTimeline
    .map(
      (s) =>
        `[${formatTimestamp(s.start)} - ${formatTimestamp(s.end)}] ${s.text}`,
    )
    .join("\n");
}

// Function to gather data from the form and format it for output
function gatherFormattedText() {
  const title = document.getElementById("title").value.trim();
  const time = document.getElementById("time").value.trim();
  const location = document.getElementById("location").value.trim();
  const participantsRaw = document.getElementById("participants").value.trim();
  const description = document.getElementById("description").value.trim();
  const transcription = document.getElementById("transcription").value.trim();
  const summary = document.getElementById("summary").value.trim();

  // Time formatting
  let timeISO = convertToISO(time);

  const participants = participantsRaw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => `  - "[[${name}]]"`)
    .join("\n");

  return `---
title: "${title}"
date: ${timeISO}
participants:
${participants}
topics:
location: "${location}"
description: "${description}"
tags:
  - meeting
---

## Summary

${summary}

---

## Transcription

${transcription}
`;
}

// "Mon, Apr 14, 2025 9:45 PM - 10:45 PM" => "2025-04-14T21:45:00"
function convertToISO(dateStr) {
  if (dateStr.includes(" - ")) {
    dateStr = dateStr.split(" - ")[0];
  }
  const date = new Date(dateStr);
  if (isNaN(date)) {
    console.error("Invalid date format:", dateStr);
    return "";
  }

  // Convert to ISO format without timezone
  return date.toISOString().slice(0, 19); // remove timezone info
}

// Copy text to clipboard
document.getElementById("copy-btn").addEventListener("click", () => {
  const formattedText = gatherFormattedText();
  navigator.clipboard.writeText(formattedText).then(() => {
    alert("Copied to clipboard!");
  });
});


// Save text as file
document.getElementById("save-btn").addEventListener("click", async () => {
  const formattedText = gatherFormattedText();

  let isoDate = convertToISO(document.getElementById("time").value.trim());
  const safeIsoDate = isoDate.replace(/:/g, "-");

  let title = document.getElementById("title").value;
  const cleanTitle = title.trim().replace(/\s+/g, "_");

  const filename = `${safeIsoDate}-${cleanTitle}.md`;

  await saveFile(formattedText, filename);
});

async function saveFile(content, fileName) {
  const options = {
    suggestedName: fileName,
    types: [
      {
        description: "Markdown File",
        accept: { "text/markdown": [".md"] },
      },
    ],
  };

  const handle = await window.showSaveFilePicker(options);
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}
