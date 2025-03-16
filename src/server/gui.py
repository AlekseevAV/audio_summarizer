import os
import sys
import threading

from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QDialog,
    QFileDialog,
    QGroupBox,
    QLabel,
    QLineEdit,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from settings import Language, settings
from summary import summarize
from transcription import transcribe


class SettingsWindow(QDialog):
    """Settings window for the application."""

    def __init__(self):
        super().__init__()

        self.setWindowTitle("Settings")
        self.setGeometry(200, 200, 300, 200)

        layout = QVBoxLayout()

        # Summary settings group
        self.summary_group = QGroupBox("Summary Settings")
        layout.addWidget(self.summary_group)
        summary_layout = QVBoxLayout()
        self.summary_group.setLayout(summary_layout)

        # Summary status checkbox
        self.summary_enabled = settings.config.summarization.is_enabled
        self.summary_checkbox = QCheckBox("Enable Summary")
        self.summary_checkbox.setChecked(self.summary_enabled)
        self.summary_checkbox.stateChanged.connect(self.toggle_summary)
        summary_layout.addWidget(self.summary_checkbox)

        # OpenAI API key input
        self.openai_key_input = QLineEdit()
        self.openai_key_input.setPlaceholderText("Enter OpenAI API Key")
        self.openai_key_input.setText(settings.config.summarization.openai_api_key)
        summary_layout.addWidget(self.openai_key_input)

        # Language selection dropdown
        self.language_label = QLabel("Select Language:")
        summary_layout.addWidget(self.language_label)
        self.language_dropdown = QComboBox()
        self.language_dropdown.addItems([lang.value for lang in Language])
        self.language_dropdown.setCurrentText(
            settings.config.summarization.language.value
        )
        summary_layout.addWidget(self.language_dropdown)

        # Close button
        self.close_button = QPushButton("Close")
        self.close_button.clicked.connect(self.close)
        layout.addWidget(self.close_button)

        # Save button
        self.save_button = QPushButton("Save")
        self.save_button.clicked.connect(self.save_settings)
        layout.addWidget(self.save_button)

        self.setLayout(layout)

    def toggle_summary(self, state):
        """Toggle the summary checkbox."""
        self.summary_enabled = state == Qt.CheckState.Checked.value

    def save_settings(self):
        """Save the settings to the config file."""
        summary_settings = settings.config.summarization
        summary_settings.openai_api_key = self.openai_key_input.text()
        summary_settings.is_enabled = self.summary_enabled
        summary_settings.language = Language(self.language_dropdown.currentText())
        settings.save_settings()
        self.close()


class TranscriptionWorker(QThread):
    """Worker thread for transcribing & summarizing files."""

    # Signal for sending the transcription back
    transcription_update = Signal(str)

    def __init__(self, file_path, summary_enabled, language):
        super().__init__()
        self.file_path = file_path
        self.summary_enabled = summary_enabled
        self.language = language

    def run(self):
        """Transcribe or summarize the audio file."""
        try:
            self.transcription_update.emit("Reading file...")
            file_bytes = open(self.file_path, "rb").read()
        except Exception as e:
            self.transcription_update.emit(str(e))
            return
        threading.Thread(target=self.transcribe, args=(file_bytes,)).start()

    def transcribe(self, file_bytes):
        """Transcribes the audio file."""
        try:
            self.transcription_update.emit("Transcribing...")
            transcription_result = transcribe(audio_file=file_bytes)
            result_text = transcription_result.transcription
            if self.summary_enabled:
                self.transcription_update.emit("Summarizing...")
                result_text = summarize(result_text, language=self.language)
            self.transcription_update.emit(result_text)
        except Exception as e:
            self.transcription_update.emit(str(e))


class TranscriptionApp(QWidget):
    def __init__(self):
        super().__init__()

        self.last_file_path = None

        self.setWindowTitle("Transcription Tool")
        self.setGeometry(100, 100, 600, 400)

        layout = QVBoxLayout()

        # Settings button
        self.settings_button = QPushButton("Settings")
        self.settings_button.clicked.connect(self.open_settings)
        layout.addWidget(self.settings_button)

        # Drag & Drop
        self.label = QLabel("Drag & Drop a file or select manually:")
        layout.addWidget(self.label)
        self.setAcceptDrops(True)
        self.label_drag = QLabel("Drag & Drop File Here")
        self.label_drag.setStyleSheet(
            "border: 2px dashed #bbb; border-radius: 10px; background-color: #000d1a; padding: 20px;"
        )
        layout.addWidget(self.label_drag)
        self.label_drag.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.label_drag.setMinimumHeight(100)
        self.label_drag.setMinimumWidth(200)
        self.label_drag.setAcceptDrops(True)
        self.label_drag.dragEnterEvent = self.dragEnterEvent
        self.label_drag.dropEvent = self.dropEvent

        # Select file button
        self.select_button = QPushButton("Select File")
        self.select_button.clicked.connect(self.open_file_dialog)
        layout.addWidget(self.select_button)

        # Text area for transcription & summary
        self.text_area = QTextEdit()
        self.text_area.setReadOnly(False)
        self.text_area.setPlaceholderText("Transcription or Summary will appear here")
        layout.addWidget(self.text_area)

        # Save to file button
        self.save_button = QPushButton("Save to File")
        self.save_button.clicked.connect(self.save_transcription)
        layout.addWidget(self.save_button)

        self.setLayout(layout)

    def open_settings(self):
        """Открывает окно настроек."""
        self.settings_window = SettingsWindow()
        self.settings_window.show()

    def dragEnterEvent(self, event):
        """Accept drag enter events."""
        if event.mimeData().hasUrls():
            event.acceptProposedAction()

    def dropEvent(self, event):
        """Handle file drops."""
        for url in event.mimeData().urls():
            file_path = url.toLocalFile()
            self.process_file(file_path)

    def open_file_dialog(self):
        """Opens a file dialog to select an audio file."""
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Select File", "", "Audio & Video Files (*.wav *.mp3 *.mp4)"
        )
        if file_path:
            self.process_file(file_path)

    def process_file(self, file_path):
        """Starts the transcription process for the selected file."""
        self.text_area.setText("Processing...")
        self.last_file_path = file_path
        self.worker = TranscriptionWorker(
            file_path=file_path,
            summary_enabled=settings.config.summarization.is_enabled,
            language=settings.config.summarization.language,
        )
        self.worker.transcription_update.connect(self.display_transcription)
        self.worker.start()

    def display_transcription(self, text):
        """Displays the transcription in the text area."""
        self.text_area.setText(text)

    def save_transcription(self):
        """Saves the transcription to a text file."""
        if not self.last_file_path:
            return
        last_file_dir, last_file_name = os.path.split(self.last_file_path)
        default_file_name = os.path.splitext(last_file_name)[0] + ".md"
        default_path = os.path.join(last_file_dir, default_file_name)
        file_path, _ = QFileDialog.getSaveFileName(
            self,
            caption="Save Transcription",
            dir=default_path,
            filter="Text Files (*.md)",
        )
        if file_path:
            with open(file_path, "w") as f:
                f.write(self.text_area.toPlainText())


def run_transcription_app():
    """Runs the transcription app."""
    app = QApplication.instance()
    if not app:
        app = QApplication(sys.argv)
    window = TranscriptionApp()
    window.show()
    app.exec()


def run_settings_app():
    """Runs the settings app."""
    app = QApplication.instance()
    if not app:
        app = QApplication(sys.argv)
    window = SettingsWindow()
    window.show()
    app.exec()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "settings":
        run_settings_app()
    else:
        run_transcription_app()
