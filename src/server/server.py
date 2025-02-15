#!/usr/bin/env python3
import json
import logging
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.utils import secure_filename

from whisper_turbo import transcribe

logger = logging.getLogger(__name__)

HOME_DIR = Path.home()
TRANSCRIPTIONS_OUTPUT_DIR = HOME_DIR / "Downloads" / "transcriptions"

app = Flask(__name__)
app.json.ensure_ascii = False


@dataclass
class Participant:
    name: str

    @classmethod
    def from_dict(cls, data: dict):
        return cls(name=data.get("name", "-"))


@dataclass
class CallMetadata:
    title: str
    time: str
    location: str
    participants: list[Participant]
    description: str

    @classmethod
    def from_dict(cls, data: dict) -> "CallMetadata":
        return cls(
            title=data.get("title", "meeting"),
            time=data.get("time", datetime.now().isoformat()),
            location=data.get("location", "-"),
            participants=[
                Participant.from_dict(p) for p in data.get("participants", [])
            ],
            description=data.get("description", "-"),
        )

    def as_header(self) -> str:
        return (
            f"Title: {self.title}\n"
            f"Time: {self.time}\n"
            f"Location: {self.location}\n"
            f"Participants: {', '.join([p.name for p in self.participants])}\n"
            f"Description: {self.description}\n"
            "==============================\n\n"
        )


@dataclass
class TranscriptionResult:
    metadata: CallMetadata
    transcription: str

    def split_transcription_by_sentence(self) -> list:
        """
        Split the transcription into chunks by sentence, but keep the sentences
        together to avoid splitting sentences in the middle.
        """
        chunks = self.transcription.split(". ")
        formatted_chunks = []
        current_chunk = ""
        for chunk in chunks:
            if len(current_chunk) + len(chunk) < 120:
                current_chunk += chunk + "."
            else:
                formatted_chunks.append(current_chunk)
                current_chunk = chunk + "."

        if current_chunk:
            formatted_chunks.append(current_chunk)
        return formatted_chunks

    def as_text(self) -> str:
        body = "\n".join(self.split_transcription_by_sentence())
        return self.metadata.as_header() + body

    def save_to_file(self, target_dir: Path) -> None:
        file_name = f"{self.metadata.time}-{self.metadata.title}.txt"
        path = target_dir / secure_filename(file_name)
        app.logger.info("Saving transcription to %s", path)
        with open(path, "w") as out_file:
            out_file.write(self.as_text())


@app.route("/transcribe", methods=["POST"])
def transcribe_handler():
    if "audioFile" not in request.files:
        return jsonify({"status": "error", "message": "No audio file provided"}), 400

    audio_file = request.files["audioFile"]

    call_metadata = request.form.get("callMetadata")
    if call_metadata:
        call_metadata = json.loads(call_metadata)
    else:
        call_metadata = {}
    app.logger.info("Received audio file: %s", call_metadata)

    call_metadata = CallMetadata.from_dict(call_metadata)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        audio_file.save(tmp)
        tmp_path = tmp.name
        app.logger.debug("Saved audio file to %s", tmp_path)
        transcription = transcribe(path_audio=tmp_path, any_lang=True)

    transcription_result = TranscriptionResult(
        metadata=call_metadata, transcription=transcription
    )
    transcription_result.save_to_file(target_dir=TRANSCRIPTIONS_OUTPUT_DIR)
    return jsonify({"status": "OK", "transcription": transcription})


@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"status": "OK"})


if __name__ == "__main__":
    # Create the output directory if it doesn't exist
    if not os.path.exists(TRANSCRIPTIONS_OUTPUT_DIR):
        os.makedirs(TRANSCRIPTIONS_OUTPUT_DIR)

    app.run(host="127.0.0.1", port=8995, debug=True)
