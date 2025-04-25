import json
from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel

CONFIG_DIR_NAME = "audio-summarizer"
CONFIG_PATH = Path.home() / ".config" / CONFIG_DIR_NAME


class Language(StrEnum):
    """Enum for supported languages."""

    ENGLISH = "en"
    RUSSIAN = "ru"


class Summarization(BaseModel):
    openai_api_key: str = ""
    is_enabled: bool = False
    language: Language = Language.RUSSIAN
    output_dir: str = (
        (Path.home() / "Downloads" / "summaries").expanduser().resolve().as_posix()
    )


class Transcription(BaseModel):
    output_dir: str = (
        (Path.home() / "Downloads" / "transcriptions").expanduser().resolve().as_posix()
    )


class Server(BaseModel):
    port: int = 8995
    host: str = "localhost"
    use_reloader: bool = False


class Config(BaseModel):
    summarization: Summarization = Summarization()
    transcription: Transcription = Transcription()
    server: Server = Server()
    start_server_on_launch: bool = False


class Settings:
    def __init__(self):
        self.config = self.load_settings()

    @property
    def settings_path(self) -> Path:
        """Get the path to the settings file."""
        config_dir = CONFIG_PATH
        config_dir.mkdir(parents=True, exist_ok=True)
        return config_dir / "settings.json"

    def load_settings(self) -> Config:
        """Load settings from JSON."""
        if self.settings_path.exists():
            with self.settings_path.open("r") as f:
                settings = json.load(f)
                return Config.model_validate(settings)
        return Config()

    def reload_settings(self) -> None:
        """Reload settings from JSON."""
        self.config = self.load_settings()

    def save_settings(self) -> None:
        """Save settings to JSON."""
        settings = self.config.model_dump_json(indent=2)
        with self.settings_path.open("w") as f:
            f.write(settings)


settings = Settings()
