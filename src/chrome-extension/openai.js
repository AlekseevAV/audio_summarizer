export async function transcribe(blob, token) {
  let allSegments = [];
  let text = "";

  const formData = new FormData();
  formData.append("file", blob, `chunk_0.webm`);
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  );

  const result = await response.json();

  if (response.ok && result.segments) {
    allSegments.push(...result.segments);
    text += result.text + " ";
  } else {
    console.error("Error transcribing chunk", result);
    throw new Error("Failed to transcribe audio");
  }

  return { transcriptionSegments: allSegments, transcription: text };
}

// export async function summarizeText(text, prompt, token) {
//   const apiUrl = "https://api.openai.com/v1/chat/completions";
//
//   const systemMessage = {
//     role: "system",
//     content: prompt || "Summarize the following text clearly and concisely.",
//   };
//
//   const userMessage = {
//     role: "user",
//     content: text,
//   };
//
//   const payload = {
//     model: "gpt-4",
//     messages: [systemMessage, userMessage],
//     temperature: 0.5,
//   };
//
//   const response = await fetch(apiUrl, {
//     method: "POST",
//     headers: {
//       Authorization: `Bearer ${token}`,
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify(payload),
//   });
//
//   const result = await response.json();
//
//   if (!response.ok || !result.choices?.[0]?.message?.content) {
//     console.error("OpenAI Error:", result);
//     throw new Error("Failed to generate summary");
//   }
//
//   return result.choices[0].message.content.trim();
// }

// Splitting text into chunks
function splitTextIntoChunks(text, size) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + size;

    // Find the next period or end of text
    while (end < text.length && text[end] !== "." && end - start < size + 500) {
      end++;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks;
}

const apiUrl = "https://api.openai.com/v1/chat/completions";
const maxTokens = 8000;
const approxCharsPerToken = 2;
const chunkSize = maxTokens * approxCharsPerToken;

export async function summarizeText(text, prompt, token) {
  const chunks = splitTextIntoChunks(text, chunkSize);
  let summaries = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const systemMessage = {
      role: "system",
      content: prompt || "Summarize the following text clearly and concisely.",
    };

    const userMessage = {
      role: "user",
      content: chunk,
    };

    const payload = {
      model: "gpt-4",
      messages: [systemMessage, userMessage],
      temperature: 0.5,
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || !result.choices?.[0]?.message?.content) {
      console.error("OpenAI Error in chunk", i, result);
      throw new Error("Failed to generate summary for chunk");
    }

    summaries.push(result.choices[0].message.content.trim());
  }

  // Final summary of all chunks
  let finalSummary = "";
  if (summaries.length === 1) {
    finalSummary = summaries[0];
  } else {
    finalSummary = await summarizeText(
      summaries.join("\n\n"),
      `Concatenate the following summaries created by this prompt (keep the language and style of the original summaries): ${prompt}`,
      token,
    );
  }

  return finalSummary;
}
