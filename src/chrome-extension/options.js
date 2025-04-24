document.addEventListener("DOMContentLoaded", () => {
  loadSettings();

  document
    .getElementById("saveSettings")
    .addEventListener("click", saveSettings);
});

function loadSettings() {
  chrome.storage.sync.get(
    ["openai_token", "summary_prompt"],
    (data) => {
      document.getElementById("openaiToken").value = data.openai_token || "";
      document.getElementById("summaryPrompt").value =
        data.summary_prompt || "";
    },
  );
}

function saveSettings() {
  const openai_token = document.getElementById("openaiToken").value;
  const summary_prompt = document.getElementById("summaryPrompt").value;

  chrome.storage.sync.set({ openai_token, summary_prompt }, () => {
    alert("Settings saved!");
  });
}
