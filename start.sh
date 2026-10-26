#!/usr/bin/env bash
# ==============================================================================
# Saved — Threads Library Startup Script
#
# Usage:
#   ./start.sh              -> Starts server and opens in browser
#   ./start.sh dev          -> Starts with live reload (tsx watch)
#   ./start.sh prod         -> Builds TypeScript and starts production server
#   ./start.sh daemon       -> Starts server in background
#   ./start.sh stop         -> Cleanly stops the running server
#   ./start.sh restart      -> Restarts the server
#   ./start.sh status       -> Checks server health and database status
#   ./start.sh install      -> Installs global 'saved' command to ~/.local/bin/saved
#   ./start.sh service      -> Installs & enables auto-starting systemd user service
#   ./start.sh logs         -> Streams recent server logs
#
# Flags:
#   --no-open, -n           -> Do not open the browser automatically
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PORT="${PORT:-3000}"
PID_FILE="$DIR/data/.saved.pid"
LOG_FILE="$DIR/data/.saved.log"
URL="http://localhost:$PORT"

# Colors for terminal output
BOLD="\033[1m"
DIM="\033[2m"
WHITE="\033[97m"
GREEN="\033[32m"
YELLOW="\033[33m"
GRAY="\033[90m"
RESET="\033[0m"

print_banner() {
  echo -e "${BOLD}${WHITE}● saved.${RESET} ${DIM}your Threads library${RESET}"
}

ensure_dependencies() {
  if [ ! -d "$DIR/node_modules" ]; then
    echo -e "  ${DIM}Installing dependencies (first run)...${RESET}"
    npm install
  fi
}

is_running() {
  if curl -s -f -m 1 "$URL/api/health" >/dev/null 2>&1; then
    return 0
  else
    return 1
  fi
}

open_browser() {
  if [ "$NO_OPEN" = "true" ]; then
    return 0
  fi
  sleep 0.5
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  fi
}

wait_for_server() {
  local max_wait=30
  local count=0
  echo -ne "  ${DIM}Waiting for server to become ready...${RESET} "
  while ! is_running; do
    sleep 0.3
    count=$((count + 1))
    if [ "$count" -ge "$max_wait" ]; then
      echo -e "\n  ${BOLD}Error:${RESET} Server failed to respond at $URL within 9s."
      if [ -f "$LOG_FILE" ]; then
        echo -e "  ${DIM}Recent logs:${RESET}"
        tail -n 15 "$LOG_FILE"
      fi
      exit 1
    fi
  done
  echo -e "${GREEN}ready!${RESET}"
}

cmd_status() {
  print_banner
  echo ""
  if is_running; then
    echo -e "  Status:   ${GREEN}● Active & Running${RESET}"
    echo -e "  Address:  ${BOLD}$URL${RESET}"
    
    # Try fetching status details from API
    STATUS_JSON=$(curl -s -m 2 "$URL/api/auth/status" 2>/dev/null || echo "")
    if [ -n "$STATUS_JSON" ]; then
      CONNECTED=$(echo "$STATUS_JSON" | grep -o '"connected":[^,]*' | cut -d: -f2 | tr -d ' ')
      USERNAME=$(echo "$STATUS_JSON" | grep -o '"username":"[^"]*' | cut -d'"' -f4)
      COUNT=$(echo "$STATUS_JSON" | grep -o '"savedPostCount":[^,}]*' | cut -d: -f2 | tr -d ' ')
      if [ "$CONNECTED" = "true" ]; then
        echo -e "  Account:  ${WHITE}@${USERNAME:-connected}${RESET}"
        echo -e "  Library:  ${WHITE}${COUNT:-0} saved posts${RESET} in SQLite"
      else
        echo -e "  Account:  ${DIM}Preview mode (no account linked)${RESET}"
      fi
    fi
  else
    echo -e "  Status:   ${GRAY}○ Stopped (port $PORT is free)${RESET}"
  fi
  echo ""
}

cmd_stop() {
  print_banner
  echo -e "  ${DIM}Stopping Saved server...${RESET}"
  local stopped=0

  # Check systemd service first
  if command -v systemctl >/dev/null 2>&1; then
    if systemctl --user is-active --quiet saved-threads 2>/dev/null; then
      systemctl --user stop saved-threads 2>/dev/null || true
      stopped=1
    fi
  fi

  # Check PID file
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null || true
      stopped=1
    fi
    rm -f "$PID_FILE"
  fi

  # Free port 3000 if still held by any process
  PORT_PID=$(lsof -ti :$PORT 2>/dev/null || fuser $PORT/tcp 2>/dev/null | awk '{print $1}' || true)
  if [ -n "$PORT_PID" ]; then
    kill -TERM "$PORT_PID" 2>/dev/null || true
    stopped=1
  fi

  sleep 0.4
  if is_running; then
    PORT_PID=$(lsof -ti :$PORT 2>/dev/null || fuser $PORT/tcp 2>/dev/null | awk '{print $1}' || true)
    if [ -n "$PORT_PID" ]; then
      kill -9 "$PORT_PID" 2>/dev/null || true
    fi
  fi

  echo -e "  ${GREEN}✓${RESET} Server stopped."
}

cmd_daemon() {
  print_banner
  ensure_dependencies
  mkdir -p "$DIR/data"

  if is_running; then
    echo -e "  ${GREEN}●${RESET} Saved is already running at ${BOLD}$URL${RESET}"
    open_browser
    exit 0
  fi

  # Ensure production build is ready
  if [ ! -f "$DIR/.output/server/index.mjs" ]; then
    echo -e "  ${DIM}Building Nuxt for background daemon...${RESET}"
    npm run build >/dev/null 2>&1
  fi

  echo -e "  Starting background daemon..."
  setsid node -r dotenv/config "$DIR/.output/server/index.mjs" >>"$LOG_FILE" 2>&1 &
  DAEMON_PID=$!
  echo "$DAEMON_PID" > "$PID_FILE"
  disown "$DAEMON_PID" 2>/dev/null || true

  wait_for_server

  echo -e "  ${GREEN}✓${RESET} Saved is running in background at ${BOLD}$URL${RESET}"
  echo -e "    PID:  $DAEMON_PID"
  echo -e "    Logs: $LOG_FILE"
  echo -e "    Stop with: ${BOLD}./start.sh stop${RESET}"
  echo ""
  open_browser
}

cmd_start() {
  print_banner
  ensure_dependencies
  mkdir -p "$DIR/data"

  if is_running; then
    echo -e "\n  ${GREEN}●${RESET} Saved is already running at ${BOLD}$URL${RESET}"
    open_browser
    exit 0
  fi

  local MODE="${1:-dev}"
  echo ""
  echo -e "  Launching Saved (${MODE} mode)..."
  echo -e "  URL:  ${BOLD}${WHITE}$URL${RESET}"
  echo -e "  Exit: ${DIM}Press Ctrl+C to stop${RESET}"
  echo ""

  # Open browser concurrently
  (open_browser) &

  if [ "$MODE" = "prod" ]; then
    npm run build
    exec node -r dotenv/config .output/server/index.mjs
  else
    exec npx nuxt dev --port "$PORT"
  fi
}

cmd_logs() {
  print_banner
  if [ ! -f "$LOG_FILE" ]; then
    echo -e "  ${DIM}No log file found at $LOG_FILE${RESET}"
    exit 0
  fi
  echo -e "  ${DIM}Streaming logs from $LOG_FILE (Ctrl+C to exit):${RESET}"
  echo ""
  tail -f -n 30 "$LOG_FILE"
}

cmd_restart() {
  cmd_stop
  sleep 0.5
  cmd_daemon
}

cmd_install_cli() {
  print_banner
  local TARGET_BIN="$HOME/.local/bin/saved"
  mkdir -p "$HOME/.local/bin"

  cat <<EOF > "$TARGET_BIN"
#!/usr/bin/env bash
exec "$DIR/start.sh" "\$@"
EOF
  chmod +x "$TARGET_BIN"

  echo -e "  ${GREEN}✓${RESET} Installed global CLI shortcut to: ${BOLD}$TARGET_BIN${RESET}"
  echo -e "  You can now type ${BOLD}saved${RESET} from anywhere in your terminal!"
  echo ""
  echo -e "  Commands available:"
  echo -e "    ${BOLD}saved${RESET}           -> Start and open in browser"
  echo -e "    ${BOLD}saved daemon${RESET}    -> Start in background"
  echo -e "    ${BOLD}saved stop${RESET}      -> Stop background server"
  echo -e "    ${BOLD}saved status${RESET}    -> View library & server status"
  echo -e "    ${BOLD}saved logs${RESET}      -> Stream server logs"
  echo ""
}

cmd_install_service() {
  print_banner
  local SERVICE_DIR="$HOME/.config/systemd/user"
  local SERVICE_FILE="$SERVICE_DIR/saved-threads.service"
  local NODE_BIN
  NODE_BIN="$(which node)"

  mkdir -p "$SERVICE_DIR"

  # Ensure production build is fresh
  echo -e "  Building application for service execution..."
  ensure_dependencies
  npm run build

  cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Saved — Local Threads Library Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$DIR
Environment=PORT=$PORT
Environment=NODE_ENV=production
ExecStart=$NODE_BIN -r dotenv/config $DIR/.output/server/index.mjs
Restart=always
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=10

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable --now saved-threads.service

  echo -e "  ${GREEN}✓${RESET} Installed and started systemd user service: ${BOLD}saved-threads${RESET}"
  echo -e "  Auto-starts on system login."
  echo -e "  Manage with:"
  echo -e "    systemctl --user status saved-threads"
  echo -e "    systemctl --user stop saved-threads"
  echo -e "    systemctl --user restart saved-threads"
  echo ""
}

cmd_sync() {
  print_banner
  ensure_dependencies
  echo -e "\n  ${BOLD}Syncing Threads Saved Bookmarks...${RESET}"
  
  local EXTRA_ARGS=""
  if [ "$FULL_SCAN" = "true" ]; then
    EXTRA_ARGS="--full-scan"
    echo -e "  Mode: ${DIM}Full lifetime history scan${RESET}"
  else
    echo -e "  Mode: ${DIM}Fast incremental sync${RESET}"
  fi

  if is_running; then
    echo -e "  Server active at ${WHITE}$URL${RESET}."
  else
    echo -e "  Server is offline. Running standalone sync engine directly against SQLite..."
  fi

  node "$DIR/scripts/auto-sync-threads.mjs" $EXTRA_ARGS
  echo ""
  cmd_status
}

# --- Flag Extraction ---
NO_OPEN="false"
FULL_SCAN="false"
COMMAND=""

for arg in "$@"; do
  case "$arg" in
    --no-open|-n)
      NO_OPEN="true"
      ;;
    --full|--full-scan)
      FULL_SCAN="true"
      ;;
    *)
      if [ -z "$COMMAND" ]; then
        COMMAND="$arg"
      fi
      ;;
  esac
done

# --- CLI Dispatch ---
case "${COMMAND:-}" in
  ""|"start"|"run")
    cmd_start "dev"
    ;;
  "dev")
    cmd_start "dev"
    ;;
  "prod")
    cmd_start "prod"
    ;;
  "daemon"|"bg"|"background")
    cmd_daemon
    ;;
  "sync")
    cmd_sync
    ;;
  "stop"|"kill")
    cmd_stop
    ;;
  "restart")
    cmd_restart
    ;;
  "logs"|"log")
    cmd_logs
    ;;
  "status"|"info")
    cmd_status
    ;;
  "install"|"install-cli")
    cmd_install_cli
    ;;
  "service"|"install-service")
    cmd_install_service
    ;;
  "-h"|"--help"|"help")
    print_banner
    echo ""
    echo "Usage: ./start.sh [command] [options]"
    echo ""
    echo "Commands:"
    echo "  (none) / dev       Start interactive server with live reload and open browser"
    echo "  sync               Sync saved posts directly from your Threads account"
    echo "  prod               Build and run production server"
    echo "  daemon             Start server in background"
    echo "  stop               Stop running server"
    echo "  restart            Restart background server"
    echo "  logs               Stream background server logs"
    echo "  status             Check status and saved post count"
    echo "  install            Install global 'saved' command to ~/.local/bin/saved"
    echo "  service            Install & enable auto-starting systemd user service"
    echo ""
    echo "Options:"
    echo "  -n, --no-open      Do not open browser automatically"
    echo "  --full             Perform full lifetime history scan instead of incremental"
    echo ""
    ;;
  *)
    echo "Unknown command: $COMMAND"
    echo "Run './start.sh --help' for usage."
    exit 1
    ;;
esac
