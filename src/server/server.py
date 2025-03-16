#!/usr/bin/env python3
import json
import logging
import os
import signal
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import requests
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

from settings import settings
from summary import summarize
from transcription import CallMetadata, TranscriptionResult, transcribe

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

HOME_DIR = Path.home()
TRANSCRIPTIONS_OUTPUT_DIR_DEFAULT = HOME_DIR / "Downloads" / "transcriptions"
SUMMARIES_OUTPUT_DIR_DEFAULT = HOME_DIR / "Downloads" / "summaries"

TRANSCRIPTIONS_OUTPUT_DIR = (
    Path(os.environ.get("TRANSCRIPTIONS_OUTPUT_DIR", TRANSCRIPTIONS_OUTPUT_DIR_DEFAULT))
    .expanduser()
    .resolve()
)
SUMMARIES_OUTPUT_DIR = (
    Path(os.environ.get("SUMMARIES_OUTPUT_DIR", SUMMARIES_OUTPUT_DIR_DEFAULT))
    .expanduser()
    .resolve()
)

app = FastAPI()
server_should_stop = threading.Event()


def filename_from_metadata(metadata: CallMetadata) -> str:
    title = metadata.title.replace(" ", "_").lower()
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


@app.post("/transcribe")
async def transcribe_handler(
    audio_file: UploadFile = File(..., alias="audioFile"),
    call_metadata: str = Form(None, alias="callMetadata"),
):
    raw_metadata = json.loads(call_metadata) if call_metadata else {}
    logger.info("Received audio file: %s", raw_metadata)

    call_metadata_instance = CallMetadata.from_dict(raw_metadata)
    transcription_result = transcribe(audio_file=await audio_file.read())

    save_transciption_to_file(
        transcription_result=transcription_result,
        call_metadata=call_metadata_instance,
        target_dir=TRANSCRIPTIONS_OUTPUT_DIR,
    )

    summary = ""
    if settings.config.summarization.is_enabled:
        summary = summarize(
            transcription=call_metadata_instance.as_header()
            + transcription_result.transcription,
            language="ru",
        )
        save_summary_to_file(
            summary=summary,
            call_metadata=call_metadata_instance,
            target_dir=SUMMARIES_OUTPUT_DIR,
        )

    return JSONResponse(
        content={
            "status": "OK",
            "transcription": transcription_result.transcription,
            "summary": summary,
        }
    )


@app.get("/ping")
def ping():
    return {"status": "OK"}


main_app_lifespan = app.router.lifespan_context


@asynccontextmanager
async def lifespan_wrapper(app):
    TRANSCRIPTIONS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARIES_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    async with main_app_lifespan(app) as maybe_state:
        yield maybe_state


app.router.lifespan_context = lifespan_wrapper


def get_server() -> uvicorn.Server:
    config = uvicorn.Config(
        app="server:app",
        host=settings.config.server.host,
        port=settings.config.server.port,
        log_level="info",
    )
    server = uvicorn.Server(config)
    signal.signal(signal.SIGINT, stop_server_signal)
    return server


def stop_server_signal(signum, frame):
    server_should_stop.set()


def stop_server(server: uvicorn.Server) -> None:
    server_should_stop.set()
    server.should_exit = True


def is_server_running(server: uvicorn.Server) -> bool:
    ping_url = f"http://{server.config.host}:{server.config.port}/ping"
    response = requests.get(ping_url)
    return response.status_code == 200


if __name__ == "__main__":
    server = get_server()

    # Run the server in a separate thread
    thread = threading.Thread(target=server.run)
    thread.start()

    # Wait for the server to start
    server_should_stop.wait()
    server.should_exit = True
    thread.join()
