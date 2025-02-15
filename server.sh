#!/bin/bash

APP_NAME="audio_summarizer"
APP_DIR="$HOME/$APP_NAME"
PLIST_NAME="com.$APP_NAME.server"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/$PLIST_NAME.plist"

COMMAND=$1
UV_BIN=$(which uv)

if [ "$COMMAND" == "install" ]; then
echo "🚀 Installing launchd service..."

# Create the LaunchAgents directory if it does not exist
mkdir -p "$PLIST_DIR"

# Create the launchd plist file
cat <<EOF > "$PLIST_FILE"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>$PLIST_NAME</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>WorkingDirectory</key>
    <string>$APP_DIR/src/server</string>

    <key>ProgramArguments</key>
    <array>
      <string>$UV_BIN</string>
      <string>run</string>
      <string>server.py</string>
    </array>

    <key>StandardOutPath</key>
    <string>server_output.log</string>
    <key>StandardErrorPath</key>
    <string>server_error.log</string>
  </dict>
</plist>
EOF
launchctl load "$PLIST_FILE"
elif [ "$COMMAND" == "uninstall" ]; then
    echo "🚫 Uninstalling $APP_NAME..."
    launchctl unload "$PLIST_FILE"
    rm "$PLIST_FILE"
elif [ "$COMMAND" == "start" ]; then
    echo "🚀 Starting $APP_NAME..."
    launchctl start "$PLIST_NAME"
elif [ "$COMMAND" == "stop" ]; then
    echo "🛑 Stopping $APP_NAME..."
    launchctl stop "$PLIST_NAME"
elif [ "$COMMAND" == "restart" ]; then
    echo "🔄 Restarting $APP_NAME..."
    launchctl stop "$PLIST_NAME"
    launchctl start "$PLIST_NAME"
elif [ "$COMMAND" == "status" ]; then
    echo "🔍 Checking status of $APP_NAME..."
    status_line=$(launchctl list | grep "$PLIST_NAME")
    pid=$(echo "$status_line" | awk '{print $1}')
    # If not running, pid will be "-"
    # If running, pid will be a number
    # If not found, pid will be empty
    if [ "$pid" == "-" ]; then
        echo "$APP_NAME server is not running."
    else
        echo "$APP_NAME server is running. PID: $pid"
    fi
else
    echo "Usage: $0 [install|uninstall|start|stop|restart|status]"
    exit 1
fi
