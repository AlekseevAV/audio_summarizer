import logging
import subprocess
import threading
from pathlib import Path

import rumps

from gui import run_settings_app
from settings import settings
from server import get_server, is_server_running, stop_server

APP_NAME = "AudioSummarizer"
LOG_EXPORT_PATH = Path.home() / "Downloads"


# --- LOGGING SETUP ---
# Standard logging for app & server
logger = logging.getLogger(APP_NAME)
logger.setLevel(logging.DEBUG)

console_handler = logging.StreamHandler()
console_handler.setFormatter(
    logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
)
logger.addHandler(console_handler)

# app.logger.addHandler(console_handler)  # Attach to Flask logs


def save_system_logs():
    """Fetches the last 10 minutes of system logs for the application and saves them to a file."""
    command = [
        "log",
        "show",
        "--predicate",
        f'process == "{APP_NAME}"',
        "--last",
        "10m",
    ]
    log_file = LOG_EXPORT_PATH / f"{APP_NAME}_logs.txt"
    with open(log_file, "w") as f:
        subprocess.run(command, stdout=f, stderr=subprocess.DEVNULL, check=True)


class App(rumps.App):
    def __init__(self, *args, **kwargs):
        super(App, self).__init__(*args, **kwargs)
        super(App, self).__init__(
            *args,
            **kwargs,
            menu=[
                "Start Server",
                "Stop Server",
                None,
                "Transciption App",
                None,
                "Settings",
                "Export Logs",
                None,
            ],
        )
        self.server_running = False
        if settings.config.start_server_on_launch:
            self.start_server(None)

        # Dynamic status item (disabled)
        self.server_status = rumps.MenuItem("Server Status: OFF", callback=None)
        self.server_status.state = False  # Disabled
        self.menu.insert_before("Start Server", self.server_status)

        # Start a timer to update status dynamically
        self.timer = rumps.Timer(self.update_status, 5)
        self.timer.start()

    @rumps.clicked("Settings")
    def open_settings(self, _):
        run_settings_app()

    @rumps.clicked("Export Logs")
    def export_logs(self, _):
        try:
            save_system_logs()
        except Exception as e:
            logger.error(f"Error saving logs: {e}")
            rumps.alert("Error", "Error saving logs")
        else:
            rumps.notification(
                title="Logs exported",
                subtitle="Logs saved successfully",
                message=f"Logs saved to {LOG_EXPORT_PATH}",
            )

    @rumps.clicked("Start Server")
    def start_server(self, _):
        self.server = get_server()
        if self.server_running:
            rumps.alert("Error", "Server is already running")
            return

        threading.Thread(target=self.server.run).start()
        self.server_running = True

    @rumps.clicked("Stop Server")
    def stop_server_app(self, _):
        if self.server_running and self.server:
            stop_server(self.server)
            self.server_running = self.server = None
            self.update_status()
        else:
            rumps.alert("Error", "Server is not running")

    @rumps.clicked("Quit")
    def exit_app(self, _):
        """Stops the server and exits the application."""
        print("Quitting application...")
        if self.server_running and self.server:
            stop_server(self.server)
            self.server_running = self.server = None
        rumps.quit_application()

    def update_status(self, _=None):
        """Updates the server status menu item."""
        self.server_running = (
            is_server_running(self.server) if self.server_running else False
        )
        if self.server_running:
            self.server_status.title = "Server Status: ON"
            self.server_status.state = True
        else:
            self.server_status.title = "Server Status: OFF"
            self.server_status.state = False


if __name__ == "__main__":
    App(
        name=APP_NAME,
        title=None,
        icon="assets/icon.ico",
        template=True,
        quit_button=None,
    ).run()
