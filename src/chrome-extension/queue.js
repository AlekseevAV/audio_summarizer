export const processingQueue = new Map();

export class Chunk {
  constructor(audioFile) {
    this.audioFile = audioFile;
    this.transcription = null;
    this.transcriptionSegments = [];
  }
}

export class QueueItem {
  constructor(id, blobChunks, filename, displayName, callMetadata) {
    this.id = id;
    this.blobChunks = blobChunks;
    this.filename = filename;
    this.displayName = displayName;
    this.callMetadata = callMetadata;
    this.status = "pending"; // default status
  }

  /**
   * Returns the full transcription by joining all chunk transcriptions.
   * @returns {string} - The full transcription.
   * @memberof QueueItem
   */
  fullTranscription() {
    return this.blobChunks.map((chunk) => chunk.transcription).join(" ");
  }

  /**
   * Adds a new audio chunk to the blobChunks array.
   * @param {File} audioFile - The audio file to add.
   * @memberof QueueItem
   * @returns {Chunk} - The created Chunk object.
   */
  addAduioChunk(audioFile) {
    let chunk = new Chunk(audioFile);
    this.blobChunks.push(chunk);
    return chunk;
  }

  /**
   * Sets the status of the QueueItem.
   * @param {string} status - The new status to set.
   * @memberof QueueItem
   * @returns {void}
   */
  setStatus(status) {
    this.status = status;
    chrome.runtime.sendMessage({
      target: "queueEvent",
      action: "status-update",
      item: this,
    });
  }

  setSummary(summary) {
    this.summary = summary;
    chrome.runtime.sendMessage({
      target: "queueEvent",
      action: "summary-update",
      item: this,
    });
  }
}

/**
 * Creates and add a new QueueItem to the processing queue.
 * @param {string} fileId - The unique ID for the file.
 * @param {Array} chunks - The array of Chunk objects.
 * @param {string} filename - The original filename.
 * @param {string} displayName - The display name for the item.
 * @param {Object} callMetadata - Metadata related to the call.
 * @return {QueueItem} - The created QueueItem.
 */
export function addToQueue(
  fileId,
  chunks,
  filename,
  displayName,
  callMetadata,
) {
  let item = new QueueItem(fileId, chunks, filename, displayName, callMetadata);
  processingQueue.set(fileId, item);
  chrome.runtime.sendMessage({
    target: "queueEvent",
    action: "add",
    item,
  });
  return item;
}

/**
 * Retrieves an item from the processing queue.
 * @param {string} fileId - The unique ID of the file.
 * @return {QueueItem|null} - The QueueItem if found, otherwise null.
 */
export function getFromQueue(fileId) {
  return processingQueue.get(fileId);
}

/**
 * Removes an item from the processing queue.
 * @param {string} fileId - The unique ID of the file.
 * @return {boolean} - True if the item was removed, otherwise false.
 */
export function removeFromQueue(fileId) {
  let result = processingQueue.delete(fileId);
  if (result) {
    chrome.runtime.sendMessage({
      target: "queueEvent",
      action: "remove",
      fileId,
    });
  }
  return result;
}

/**
 * Retrieves all items in the processing queue as an array.
 * @return {Array} - An array of QueueItem objects.
 */
export function getQueueAsArray() {
  return Array.from(processingQueue.entries()).map(([id, data]) => ({
    id,
    ...data,
  }));
}

/**
 * Clears the processing queue.
 * @return {void}
 */
export function clearQueue() {
  processingQueue.clear();
  chrome.runtime.sendMessage({
    target: "queueEvent",
    action: "clear",
  });
}
