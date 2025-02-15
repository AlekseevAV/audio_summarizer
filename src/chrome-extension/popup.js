// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "popup") {
    switch (message.action) {
      case "updatePopup": {
        fillFormWithData(message.data);
        break;
      }
      default: {
        console.error("Unrecognized message:", message.action);
      }
    }
  }
});

// Function to fill form with received data
function fillFormWithData(data) {
  let metadata = data.callMetadata;
  let now = new Date().toLocaleString();
  let participatns;
  if (metadata.participants && metadata.participants.length > 0) {
    participatns = metadata.participants.map((p) => p.name).join(", ");
  } else {
    participatns = "";
  }

  document.getElementById("title").value = metadata.title || "Meeting";
  document.getElementById("time").value = metadata.time || now;
  document.getElementById("location").value = metadata.location || "";
  document.getElementById("participants").value = participatns;
  document.getElementById("description").value = metadata.description || "";
  document.getElementById("transcription").value = formatTranscription(
    data.transcription,
  );
}

// Function to split transcription into readable sentences
function formatTranscription(transcription) {
  const sentences = transcription.split(". ");
  let formattedChunks = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length < 120) {
      currentChunk += sentence + ". ";
    } else {
      formattedChunks.push(currentChunk.trim());
      currentChunk = sentence + ". ";
    }
  }

  if (currentChunk.trim()) {
    formattedChunks.push(currentChunk.trim());
  }

  return formattedChunks.join("\n");
}

// Function to gather data from the form and format it for output
function gatherFormattedText() {
  const title = document.getElementById("title").value;
  const time = document.getElementById("time").value;
  const location = document.getElementById("location").value;
  const participants = document.getElementById("participants").value;
  const description = document.getElementById("description").value;
  const transcription = document.getElementById("transcription").value;

  return `Title: ${title}\nTime: ${time}\nLocation: ${location}\nParticipants: ${participants}\nDescription: ${description}\n==============================\n\n${transcription}`;
}

// Copy text to clipboard
document.getElementById("copy-btn").addEventListener("click", () => {
  const formattedText = gatherFormattedText();
  navigator.clipboard.writeText(formattedText).then(() => {
    alert("Copied to clipboard!");
  });
});

// Save text as file
document.getElementById("save-btn").addEventListener("click", () => {
  const formattedText = gatherFormattedText();
  const blob = new Blob([formattedText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  let time = document.getElementById("time").value;
  time = time.replace(/ /g, "_");
  time = time.replace(/:/g, "-");

  let title = document.getElementById("title").value;
  title = title.replace(/ /g, "_");

  const filename = `${title}_${time}_transcription.txt`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});
