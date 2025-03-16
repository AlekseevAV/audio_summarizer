import os
from pathlib import Path

from openai import OpenAI

from settings import settings


MODEL = "gpt-4o"
MAX_TOKENS = 8192
TEMPERATURE = 0.2
TOP_P = 1


def get_api_key() -> str | None:
    return settings.config.summarization.openai_api_key or os.environ.get("OPENAI_API_KEY")

def is_enabled() -> bool:
    return settings.config.summarization.is_enabled


def get_system_prompt(language: str) -> str:
    current_dir = Path(__file__).parent
    prompt_file = current_dir / "prompts" / f"summary_init_{language}.txt"
    with open(prompt_file) as f:
        return f.read()


def summarize(transcription: str, language: str = "ru") -> str:
    client = OpenAI(api_key=get_api_key())
    system_prompt = get_system_prompt(language)

    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": transcription,
            }
        ],
        model=MODEL,
        max_tokens=MAX_TOKENS,
        temperature=TEMPERATURE,
        top_p=TOP_P,
    )

    return chat_completion.choices[0].message.content


if __name__ == "__main__":
    import sys
    file_path = sys.argv[1]

    with open(file_path) as f:
        transcription = f.read()

    summary = summarize(transcription, language="ru")
    print(summary)
