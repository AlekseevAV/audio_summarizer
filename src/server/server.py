#!/usr/bin/env python3
import json
import logging
import os
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from transcription import CallMetadata, TranscriptionResult, transcribe

logger = logging.getLogger(__name__)

HOME_DIR = Path.home()
TRANSCRIPTIONS_OUTPUT_DIR = HOME_DIR / "Downloads" / "transcriptions"


app = Flask(__name__)
app.json.ensure_ascii = False


def save_transciption_to_file(
    transcription_result: TranscriptionResult,
    call_metadata: CallMetadata,
    target_dir: Path,
) -> None:
    file_name = f"{call_metadata.datetime_str}-{call_metadata.title}.md"

    header = call_metadata.as_header()
    body = "\n".join(transcription_result.split_transcription_by_sentence())

    path = target_dir / secure_filename(file_name)
    logger.info("Saving transcription to %s", path)
    with open(path, "w") as out_file:
        out_file.write(header)
        out_file.write(body)


@app.route("/transcribe", methods=["POST"])
def transcribe_handler():
    if "audioFile" not in request.files:
        return jsonify({"status": "error", "message": "No audio file provided"}), 400

    audio_file: FileStorage = request.files["audioFile"]

    raw_metadata = request.form.get("callMetadata")
    if raw_metadata:
        raw_metadata = json.loads(raw_metadata)
    else:
        raw_metadata = {}
    app.logger.info("Received audio file: %s", raw_metadata)

    call_metadata = CallMetadata.from_dict(raw_metadata)
    transcription_result = transcribe(audio_file=audio_file.read())

    save_transciption_to_file(
        transcription_result=transcription_result,
        call_metadata=call_metadata,
        target_dir=TRANSCRIPTIONS_OUTPUT_DIR,
    )

    return jsonify(
        {
            "status": "OK",
            "transcription": transcription_result.transcription,
        }
    )


@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"status": "OK"})


if __name__ == "__main__":
    # Create the output directory if it doesn't exist
    if not os.path.exists(TRANSCRIPTIONS_OUTPUT_DIR):
        os.makedirs(TRANSCRIPTIONS_OUTPUT_DIR)

    app.run(host="127.0.0.1", port=8995, debug=True)
