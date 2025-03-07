#!/usr/bin/env python3
import json
import logging
import os
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from summary import is_enabled as is_openai_enabled
from summary import summarize
from transcription import CallMetadata, TranscriptionResult, transcribe

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

HOME_DIR = Path.home()
if os.environ.get("TRANSCRIPTIONS_OUTPUT_DIR"):
    TRANSCRIPTIONS_OUTPUT_DIR = (
        Path(os.environ["TRANSCRIPTIONS_OUTPUT_DIR"]).expanduser().resolve()
    )
else:
    TRANSCRIPTIONS_OUTPUT_DIR = HOME_DIR / "Downloads" / "transcriptions"
if os.environ.get("SUMMARIES_OUTPUT_DIR"):
    SUMMARIES_OUTPUT_DIR = (
        Path(os.environ["SUMMARIES_OUTPUT_DIR"]).expanduser().resolve()
    )
else:
    SUMMARIES_OUTPUT_DIR = HOME_DIR / "Downloads" / "summaries"

app = Flask(__name__)
app.json.ensure_ascii = False


def filename_from_metadata(metadata: CallMetadata) -> str:
    title = secure_filename(metadata.title)
    return f"{metadata.datetime_str}-{title}.md"


def save_transciption_to_file(
    transcription_result: TranscriptionResult,
    call_metadata: CallMetadata,
    target_dir: Path,
) -> None:
    file_name = filename_from_metadata(call_metadata)

    header = call_metadata.as_header()
    body = "\n".join(transcription_result.split_transcription_by_sentence())

    path = target_dir / file_name
    logger.info("Saving transcription to %s", path)
    with open(path, "w") as out_file:
        out_file.write(header)
        out_file.write(body)


def save_summary_to_file(
    summary: str,
    call_metadata: CallMetadata,
    target_dir: Path,
) -> None:
    file_name = filename_from_metadata(call_metadata)
    header = call_metadata.as_header()
    path = target_dir / file_name
    logger.info("Saving summary to %s", path)
    with open(path, "w") as out_file:
        out_file.write(header)
        out_file.write(summary)


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
    if is_openai_enabled():
        summary = summarize(
            transcription=call_metadata.as_header() + transcription_result.transcription,
            language="ru",
        )
        save_summary_to_file(
            summary=summary,
            call_metadata=call_metadata,
            target_dir=SUMMARIES_OUTPUT_DIR,
        )
    else:
        summary = ""

    return jsonify(
        {
            "status": "OK",
            "transcription": transcription_result.transcription,
            "summary": summary,
        }
    )


@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"status": "OK"})


if __name__ == "__main__":
    # Create the output directory if it doesn't exist
    TRANSCRIPTIONS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARIES_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if is_openai_enabled():
        logger.info("OpenAI API key is present, enabling summarization")
    else:
        logger.info("OpenAI API key is not present, summarization is disabled")

    app.run(host="127.0.0.1", port=8995, debug=True)
