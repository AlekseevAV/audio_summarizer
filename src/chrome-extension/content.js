// Inject iframe into the current page
const iframe = document.createElement("iframe");
iframe.setAttribute("hidden", "hidden");
iframe.setAttribute("id", "permissionsIFrame");
iframe.setAttribute("allow", "microphone");
iframe.src = chrome.runtime.getURL("requestPermission.html");

// Append iframe to the document body
document.body.appendChild(iframe);

async function updateCallMetadata() {
  let callMetadata = await gatherCallMetadata();
  console.log("Call metadata gathered from page:", callMetadata);
  // Send the call metadata to the background script
  try {
    chrome.runtime.sendMessage({
      target: "offscreen",
      action: "call-metadata",
      data: callMetadata,
    });
  } catch (error) {
    console.log("Error sending call metadata:", error);
  }
}

// Wait for the call fully loaded and trigger the details and people tabs
// to load the data
const checkExist = setInterval(async () => {
  const detailsButton = document.querySelector(
    'button[aria-label="Meeting details"]',
  );
  const peopleButton = document.querySelector('button[aria-label="People"]');
  if (detailsButton && peopleButton) {
    clearInterval(checkExist);
    // Open and close the details and people tabs to load the data
    detailsButton.click();
    detailsButton.click();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    peopleButton.click();
    peopleButton.click();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    updateCallMetadata();

    // Periodically update the call metadata
    setInterval(() => {
      updateCallMetadata();
    }, 10 * 1000);
  }
}, 1000); // check every 1s

// Get the meeting details from the DOM
async function meetingDetailsFromDOM() {
  let title, description, time, location;
  const scheduleNode = Array.from(document.querySelectorAll("i")).find(
    (el) => el.textContent == "schedule",
  );
  if (scheduleNode) {
    let titleNode, descriptionNode, timeNode, locationNode;
    const detailsNode = scheduleNode.parentNode.parentNode;
    detailsNode.querySelectorAll(":scope > div").forEach((el) => {
      if (el.role == "heading") {
        titleNode = el.querySelector("div[role='tooltip']");
      } else if (el.textContent.includes("schedule")) {
        timeNode = el.querySelector("div");
      } else if (el.textContent.includes("room")) {
        locationNode = el.querySelector("div");
      } else {
        descriptionNode = el;
      }
    });
    title = titleNode?.textContent;
    description = descriptionNode?.textContent;
    time = timeNode?.textContent;
    location = locationNode?.textContent;
  } else {
    console.debug("Schedule node not found.");
  }
  return { title, description, time, location };
}

// Get meeting participants from the DOM
async function meetingParticipantsFromDOM() {
  const participants = [];

  // Get the call participants (in meeting)
  document
    .querySelectorAll('div[aria-label="Participants"] div[role="listitem"]')
    .forEach((el) => {
      participants.push({ name: el.ariaLabel });
    });

  // Get the call participants (not joined yet)
  document
    .querySelectorAll('div[aria-label="Guests"] div[role="listitem"]')
    .forEach((el) => {
      participants.push({ name: el.ariaLabel });
    });

  return participants;
}

// Parse time string
// "Sat, Apr 12, 2025 9:45 PM - 10:30 PM":
//   * timeStart = Date("2025-04-12T21:45:00")
//   * timeEnd = Date("2025-04-12T22:30:00")
function parseTimeRange(timeString) {
  // Check if the time string is in the expected format
  const timeRegex =
    /^(?:\w{3}, )?\w{3} \d{1,2}, \d{4} \d{1,2}:\d{2}\s?[AP]M - \d{1,2}:\d{2}\s?[AP]M$/;
  if (!timeRegex.test(timeString)) {
    console.debug("Invalid time format:", timeString);
    return { startDate: new Date(), endDate: new Date() };
  }

  // split by date and time range
  const [datePart, timeRangePart] = timeString.split(/(?<=\d{4})\s/);
  const [startTime, endTime] = timeRangePart.split(" - ");

  const startDate = new Date(`${datePart} ${startTime}`);
  const endDate = new Date(`${datePart} ${endTime}`);

  return { startDate, endDate };
}

async function gatherCallMetadata() {
  const callMetadata = {
    title: null,
    description: null,
    time: null,
    location: null,
    participants: [],
  };

  // Meeting details
  const meetingDetails = await meetingDetailsFromDOM();
  callMetadata.title = meetingDetails.title;
  callMetadata.description = meetingDetails.description;
  callMetadata.time = meetingDetails.time;
  callMetadata.location = meetingDetails.location;

  // Parse the time range
  const { startDate, endDate } = parseTimeRange(callMetadata.time);
  callMetadata.timeStart = startDate;
  callMetadata.timeEnd = endDate;

  // Get the call participants
  const callParticipants = await meetingParticipantsFromDOM();
  callMetadata.participants = callParticipants;

  return callMetadata;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message.action;
  switch (action) {
    case "request-mic":
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          const [track] = stream.getAudioTracks();
          const micStreamId = track.getSettings().deviceId;
          console.log("Microphone access granted:", micStreamId);
          sendResponse({ success: true, micStreamId });
        })
        .catch((error) => {
          console.error("Microphone access denied:", error);
          sendResponse({ success: false, error: error.message });
        });

      return true;
    default:
      console.error("Unrecognized message:", message);
  }
});

function waitForMuteButton() {
  return new Promise((resolve) => {
    const checkExist = setInterval(() => {
      const muteButton = document.querySelector("[data-is-muted]");
      if (muteButton) {
        clearInterval(checkExist);
        resolve(muteButton);
      }
    }, 1000);
  });
}

async function initMuteObserver() {
  const muteButton = await waitForMuteButton();
  if (!muteButton) {
    console.error("Mute button not found!");
    return;
  }

  let isMuted = muteButton.getAttribute("data-is-muted") === "true";

  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "data-is-muted"
      ) {
        isMuted = muteButton.getAttribute("data-is-muted") === "true";
        console.log(
          "Microphone mute state changed:",
          isMuted ? "Muted" : "Unmuted",
        );

        chrome.runtime.sendMessage({
          target: "offscreen",
          action: "mic-mute-change",
          data: isMuted,
        });
      }
    }
  });

  observer.observe(muteButton, {
    attributes: true,
    attributeFilter: ["data-is-muted"],
  });

  console.log("Mute observer initialized.");
}

initMuteObserver();

function waitForLeaveCallButton() {
  return new Promise((resolve) => {
    const checkExist = setInterval(() => {
      const leaveCallButton = document.querySelector(
        'button[aria-label="Leave call"]',
      );
      if (leaveCallButton) {
        clearInterval(checkExist);
        resolve(leaveCallButton);
      }
    }, 1000);
  });
}

async function initLeaveCallObserver() {
  const leaveCallButton = await waitForLeaveCallButton();
  if (!leaveCallButton) {
    console.error("Leave call button not found!");
    return;
  }

  leaveCallButton.addEventListener("click", async () => {
    console.log("Leaving the call...");
    chrome.runtime.sendMessage({
      target: "background",
      action: "stop-recording",
    });
  });

  console.log("Leave call observer initialized.");
}

initLeaveCallObserver();
