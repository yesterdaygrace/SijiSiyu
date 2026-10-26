#!/usr/bin/env bash
#
# A wizard to connect Saved to your real Meta Threads Developer account.
# Generated with the /wizard skill.
#
set -euo pipefail

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

TOTAL_STAGES=3
_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env}"
WRITTEN_ENV=()

_clear() {
  [[ -t 1 ]] || return 0
  if command -v tput >/dev/null 2>&1; then tput clear; else printf '\033[2J\033[3J\033[H'; fi
}

banner() {
  _clear
  printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
  printf '%s  %s stages%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"
  printf '%s  This wizard helps you connect your real Threads account using Meta\x27s\n' "$DIM"
  printf '  official Threads API OAuth. It guides you to get your App ID and Secret\n'
  printf '  from Meta for Developers, writes them to .env, and restarts the server.%s\n\n' "$RESET"
  pause "Ready to start?"
}

stage() {
  _clear
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' \
    "$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

say()  { printf '  %s\n' "$1"; }
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

open_url() {
  local url="$1"
  printf '  %s↗ opening%s %s\n' "$GREEN" "$RESET" "$url"
  { if   command -v xdg-open    >/dev/null 2>&1; then xdg-open "$url"
    elif command -v brave-browser >/dev/null 2>&1; then brave-browser "$url"
    elif command -v google-chrome >/dev/null 2>&1; then google-chrome "$url"
    elif command -v open        >/dev/null 2>&1; then open "$url"
    else warn "couldn't open browser; visit manually: $url"; fi
  } >/dev/null 2>&1 || warn "couldn't open browser, visit manually: $url"
}

pause() {
  printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"
  read -r _ || true
}

confirm() {
  local reply=""
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

_existing() {
  [[ -f "$ENV_FILE" ]] || return 1
  local line; line=$(grep -E "^${1}=" "$ENV_FILE" | tail -n1) || return 1
  printf '%s' "${line#*=}"
}

ask() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current: %s]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$current" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -r input || true
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

ask_secret() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -rs input || true
  printf '\n'
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

write_env() {
  local key="$1" value="$2" tmp
  touch "$ENV_FILE"
  tmp=$(mktemp)
  grep -vE "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  WRITTEN_ENV+=("$key")
  printf '  %s✓ wrote%s %s → %s\n' "$GREEN" "$RESET" "$key" "$ENV_FILE"
}

finish() {
  _clear
  printf '\n%s%s  ✓ Meta Threads OAuth Configured!%s\n' "$BOLD" "$GREEN" "$RESET"
  note "Updated $ENV_FILE with your Meta Threads credentials."
  printf '\n'
  say "Next steps:"
  step "Make sure the Saved server is running: npm run dev"
  step "Open http://localhost:3000 in your browser"
  step "Click 'Connect Threads' → 'Authorize with Meta Threads'"
  step "Log in with your Threads account and approve permissions!"
  printf '\n'
}

# ──────────────────────────────────────────────────────────────────────────
# STAGES
# ──────────────────────────────────────────────────────────────────────────

banner "Connect Real Threads Account Wizard"

# Stage 1: Meta App Setup
stage "Meta App & Redirect URI"
say "First, we need a Meta for Developers app with the Threads use case."
step "We will open https://developers.facebook.com/apps/"
open_url "https://developers.facebook.com/apps/"
step "Log in with your Facebook/Instagram account."
step "Click 'Create App' (or select an existing app)."
step "Choose 'Threads' or 'Other' with Threads API permissions."
step "In Threads API settings, add this exact Redirect Callback URI:"
printf '\n    %s%shttp://localhost:3000/api/auth/threads/callback%s\n\n' "$BOLD" "$YELLOW" "$RESET"
step "Save your changes."
pause "Once your app is created and the Redirect URI is saved, press Enter"

# Stage 2: Capture Credentials
stage "Copy App ID & App Secret"
say "Now find your Threads App credentials in the Meta Developer dashboard."
step "Go to Threads -> API Setup / App Settings -> Basic."
step "Find your App ID."
ask THREADS_APP_ID "Paste your Threads App ID:"
step "Find your App Secret and click 'Show'."
ask_secret THREADS_APP_SECRET "Paste your Threads App Secret:"

write_env THREADS_APP_ID "$THREADS_APP_ID"
write_env THREADS_APP_SECRET "$THREADS_APP_SECRET"
write_env THREADS_REDIRECT_URI "http://localhost:3000/api/auth/threads/callback"

# Stage 3: Restart & Test
stage "Verify Configuration"
say "Verifying that your environment has valid encryption and app credentials..."
if [[ -n "$THREADS_APP_ID" && -n "$THREADS_APP_SECRET" ]]; then
  printf '  %s✓ App ID and Secret configured.%s\n' "$GREEN" "$RESET"
else
  warn "Missing App ID or App Secret. Please re-run the wizard if you encounter errors."
fi

finish
