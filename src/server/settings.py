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


class Server(BaseModel):
    port: int = 8995
    host: str = "localhost"
    debug: bool = True
    use_reloader: bool = False


class Config(BaseModel):
    summarization: Summarization
    server: Server = Server()
    start_server_on_launch: bool = True


EMPTY_CONFIG = Config(summarization=Summarization(), server=Server())


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
                return Config.model_validate_json(settings)
        return EMPTY_CONFIG

    def save_settings(self) -> None:
        """Save settings to JSON."""
        with self.settings_path.open("w") as f:
            json.dump(self.config.model_dump_json(), f)


settings = Settings()
