chrome.runtime.onMessage.addListener((message) => {
  if (message.target === "queueEvent") {
    switch (message.action) {
      case "add":
        queueRenderItem(message.item);
        break;
      case "remove":
        queueItemRemove(message.fileId);
        break;
      case "status-update":
        queueItemUpdateStatus(message.item.id, message.item.status);
        break;
      case "clear":
        queueClear();
        break;
      default:
        console.error("Unrecognized message:", message.action);
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  loadQueue();

  document
    .getElementById("toggleRecording")
    .addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      console.debug("Toggling recording for tab:", tab);
      chrome.runtime.sendMessage({
        target: "background",
        action: "toggle-recording",
        tabId: tab.id,
      });
    });

  document.getElementById("openSettings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
});

async function loadQueue() {
  chrome.runtime.sendMessage(
    {
      target: "fileProcessor",
      action: "all",
    },
    (response) => {
      queueRenderList(response);
    },
  );
}

const statusIcons = {
  pending: "⏳",
  queued: "🕒",
  processing: "⏳",
  transcribing: "📝",
  summarizing: "📝",
  success: "✅",
  error: "⚠️",
};

function queueRenderList(queue) {
  console.debug("Rendering queue:", queue);
  const list = document.getElementById("queue-list");
  list.innerHTML = "";
  queue.forEach((item) => queueRenderItem(item));
}

function queueRenderItem(item) {
  const list = document.getElementById("queue-list");

  let li = document.getElementById(`queue-item-${item.id}`);
  const statusEmoji = statusIcons[item.status] || "❓";

  if (!li) {
    li = document.createElement("li");
    li.id = `queue-item-${item.id}`;
    li.classList.add("queue-item");
    list.appendChild(li);
  }

  li.innerHTML = `
    <div style="flex: 1;">
      <strong>${item.displayName}</strong> —
      <em>${item.status}</em> ${statusEmoji}
    </div>
    <div class="actions" style="display: flex; gap: 4px;">
      <button data-action="retry" data-id="${item.id}" title="Retry">🔁</button>
      <button data-action="open" data-id="${item.id}" title="Open">📂</button>
      <button data-action="delete" data-id="${item.id}" title="Delete">❌</button>
    </div>
  `;

  li.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const fileId = btn.dataset.id;

      chrome.runtime.sendMessage({
        target: "fileProcessor",
        action: `${action}`,
        fileId,
      });
    });
  });
}

function queueItemRemove(fileId) {
  console.debug("Removing item from queue:", fileId);
  const li = document.getElementById(`queue-item-${fileId}`);
  if (li) {
    li.remove();
  }
}

function queueItemUpdateStatus(fileId, status) {
  console.debug("Updating item status:", fileId, status);
  const li = document.getElementById(`queue-item-${fileId}`);
  if (li) {
    const statusEmoji = statusIcons[status] || "❓";
    li.querySelector("em").textContent = status;
    li.querySelector("em").nextSibling.textContent = statusEmoji;
  }
}

function queueClear() {
  const list = document.getElementById("queue-list");
  list.innerHTML = "";
}
