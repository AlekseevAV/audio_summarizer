import os

from openai import OpenAI


MODEL = "gpt-4o"
MAX_TOKENS = 8192
TEMPERATURE = 0.2
TOP_P = 1


def is_enabled() -> bool:
    return os.environ.get("OPENAI_API_KEY") is not None


def get_system_prompt(language: str) -> str:
    with open(f"prompts/summary_init_{language}.txt") as f:
        return f.read()


def summarize(transcription: str, language: str) -> str:
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
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
