#!/bin/bash
# =============================================================================
# SaveYourSoul – Claude Remote Control verwalten
# Tägliche Nutzung: start / stop / status / url / logs
# =============================================================================

SERVICE="claude-remote"
CMD="${1:-help}"

_url() {
  # Session-URL aus den letzten Logs extrahieren
  journalctl --user -u "$SERVICE" --no-pager -n 100 | grep -oE 'https://[a-zA-Z0-9./_?=-]+' | tail -1
}

case "$CMD" in
  start)
    systemctl --user start "$SERVICE"
    echo "▶ Service gestartet. Warte auf Session-URL..."
    sleep 3
    URL=$(_url)
    if [ -n "$URL" ]; then
      echo "📱 URL: $URL"
    else
      echo "⏳ URL noch nicht verfügbar. Mit 'logs' prüfen."
    fi
    ;;
  stop)
    systemctl --user stop "$SERVICE"
    echo "⏹ Service gestoppt."
    ;;
  restart)
    systemctl --user restart "$SERVICE"
    echo "🔄 Service neu gestartet."
    sleep 3
    URL=$(_url)
    [ -n "$URL" ] && echo "📱 URL: $URL"
    ;;
  status)
    systemctl --user status "$SERVICE" --no-pager
    ;;
  url)
    URL=$(_url)
    if [ -n "$URL" ]; then
      echo "📱 Session-URL:"
      echo "$URL"
      # QR-Code im Terminal anzeigen (falls qrencode installiert)
      if command -v qrencode &>/dev/null; then
        echo ""
        qrencode -t ANSIUTF8 "$URL"
      else
        echo "(qrencode installieren für QR: sudo apt install qrencode)"
      fi
    else
      echo "⚠️ Keine aktive Session-URL gefunden. Service laufend?"
      echo "   ./claude-remote-manage.sh status"
    fi
    ;;
  logs)
    journalctl --user -u "$SERVICE" -f --no-pager
    ;;
  help|*)
    echo "Nutzung: $0 {start|stop|restart|status|url|logs}"
    echo ""
    echo "  start    – Service starten + URL ausgeben"
    echo "  stop     – Service stoppen"
    echo "  restart  – Neustart"
    echo "  status   – Systemd-Status"
    echo "  url      – Aktuelle Session-URL + QR (falls qrencode)"
    echo "  logs     – Live-Logs verfolgen"
    ;;
esac
