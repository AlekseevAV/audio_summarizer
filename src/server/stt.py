import sys

from whisper_turbo import transcribe

if __name__ == "__main__":
    # get first argument as file path
    file_path = sys.argv[1]
    t = transcribe(file_path, any_lang=True)

    with open(f"{file_path}.txt", "w") as f:
        f.write(t)
