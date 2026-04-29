#!/bin/bash
# =============================================================================
# SaveYourSoul – Claude Code Remote Control Setup
# Einmalig auf dem VPS als User "janok" ausführen
# =============================================================================

set -e

PROJECT_DIR="/var/www/SaveYourSoul"
SERVICE_NAME="claude-remote"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"

echo "=== Claude Code Remote Control Setup ==="
echo ""

# --- 1. Node.js prüfen ---
if ! command -v node &>/dev/null; then
  echo "❌ Node.js nicht gefunden. Bitte zuerst installieren:"
  echo "   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
  echo "   sudo apt-get install -y nodejs"
  exit 1
fi
echo "✅ Node.js $(node --version)"

# --- 2. Claude Code installieren ---
if ! command -v claude &>/dev/null; then
  echo "📦 Installiere Claude Code..."
  npm install -g @anthropic-ai/claude-code
else
  echo "✅ Claude Code $(claude --version 2>/dev/null || echo 'installiert')"
fi

# --- 3. API Key prüfen / setzen ---
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo ""
  echo "⚠️  ANTHROPIC_API_KEY nicht gesetzt."
  echo "   Hole deinen Key von: https://console.anthropic.com/settings/keys"
  read -rp "   API Key eingeben (sk-ant-...): " API_KEY
  if [ -z "$API_KEY" ]; then
    echo "❌ Kein Key eingegeben. Abbruch."
    exit 1
  fi
  # In .bashrc + .profile speichern
  echo "export ANTHROPIC_API_KEY=\"$API_KEY\"" >> "$HOME/.bashrc"
  echo "export ANTHROPIC_API_KEY=\"$API_KEY\"" >> "$HOME/.profile"
  export ANTHROPIC_API_KEY="$API_KEY"
  echo "✅ API Key gespeichert in ~/.bashrc"
else
  echo "✅ ANTHROPIC_API_KEY gesetzt"
fi

# --- 4. Start-Script erstellen ---
mkdir -p "$HOME/bin"
cat > "$HOME/bin/sys-remote-start.sh" <<'STARTSCRIPT'
#!/bin/bash
# SaveYourSoul – Claude Remote Control starten
# Gibt URL + QR-Code für Phone-Zugriff aus

source "$HOME/.bashrc" 2>/dev/null || true
source "$HOME/.profile" 2>/dev/null || true

PROJECT_DIR="/var/www/SaveYourSoul"

echo "🚀 Starte Claude Code Remote Control..."
echo "   Projekt: $PROJECT_DIR"
echo ""
echo "→ Öffne die URL auf dem Smartphone in:"
echo "  - Claude iOS/Android App"
echo "  - Browser: claude.ai/code"
echo ""

cd "$PROJECT_DIR"
exec claude remote-control --name "SaveYourSoul VPS"
STARTSCRIPT
chmod +x "$HOME/bin/sys-remote-start.sh"
echo "✅ Start-Script: ~/bin/sys-remote-start.sh"

# --- 5. Systemd User Service ---
mkdir -p "$SYSTEMD_USER_DIR"
cat > "$SYSTEMD_USER_DIR/$SERVICE_NAME.service" <<SVCFILE
[Unit]
Description=SaveYourSoul Claude Remote Control
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
EnvironmentFile=-$HOME/.config/claude-remote/env
ExecStart=$(which claude) remote-control --name "SaveYourSoul VPS"
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
SVCFILE

# --- 6. Env-File für Systemd ---
mkdir -p "$HOME/.config/claude-remote"
if [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" > "$HOME/.config/claude-remote/env"
  chmod 600 "$HOME/.config/claude-remote/env"
  echo "✅ Env-File: ~/.config/claude-remote/env"
fi

# --- 7. Loginctl enable-linger (Service läuft ohne aktive SSH-Session) ---
if command -v loginctl &>/dev/null; then
  loginctl enable-linger "$(whoami)" 2>/dev/null && echo "✅ Linger aktiviert (Service überlebt SSH-Logout)"
fi

# --- 8. Service aktivieren ---
systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"
systemctl --user start "$SERVICE_NAME"

echo ""
echo "=== Setup abgeschlossen ==="
echo ""
echo "📋 Befehle:"
echo "  Status:   systemctl --user status $SERVICE_NAME"
echo "  Logs:     journalctl --user -u $SERVICE_NAME -f"
echo "  Stop:     systemctl --user stop $SERVICE_NAME"
echo "  Neustart: systemctl --user restart $SERVICE_NAME"
echo "  Manuell:  ~/bin/sys-remote-start.sh"
echo ""
echo "📱 Zugriff vom Smartphone:"
echo "  1. systemctl --user status $SERVICE_NAME → URL kopieren"
echo "  2. Logs: journalctl --user -u $SERVICE_NAME | grep 'session'"
echo "  3. Claude App öffnen → URL eintippen oder QR scannen"
