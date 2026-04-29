# Implementierung – Session 2026-04-18

Alle Änderungen aus der lokalen Arbeitsinstanz (`SaveYourSoul_deploy - Kopie`)
für den Deploy auf dem VPS. Zielinstanz: `/var/www/SaveYourSoul_deploy`

---

## ⚠️ Wichtig vor dem Deploy

### `server/utils/validateSoulToken.js` — NICHT übernehmen
Die lokale Kopie enthält einen Dev-Bypass (gibt immer `true` zurück).
Auf dem VPS liegt die echte HMAC-Implementierung — diese Datei beim rsync
**explizit ausschließen**.

---

## Geänderte Dateien

### 1. `app/pages/index.vue`
**Was:** Logo-Bild aus allen drei Lockups entfernt

Das `logo.png`-Bild passt nicht mehr zum typografischen Editorial-Design.
In allen drei Lockups (Dashboard-Header, Landing-Nav, Footer) wurde
`<img src="~/assets/logo.png">` entfernt. Nur der Schrift-Mark `SYS.`
bleibt erhalten. Die CSS-Zeile für den Avatar-Fallback (`.profile .avatar::after`)
ist unverändert geblieben.

### 2. `app/components/ConsentBanner.vue`
**Was:** Vollständiges Editorial Redesign

Vorher: Tailwind-Utility-Klassen, `rounded-xl`, `sys-cta-primary`.
Jetzt: Eigene `<style scoped>` mit Design-Tokens aus dem Editorial-System:
- Keine `border-radius` (scharfe Ecken)
- `--paper-2` Hintergrund + `--rule-2` Border
- Monospace-Kicker (`cb-kicker`) über dem Text
- Zwei Buttons: Violett-Filled (`cb-accept`) + Ghost-Outlined (`cb-decline`)
- Responsive: horizontal auf Desktop, gestapelt auf Mobile ≤ 640px
- Transition: `cb-up` (translateY + opacity, 0.4s ease)
- Script komplett unverändert

### 3. `app/pages/session.vue`
**Was:** Layout-Reparatur + UI-Bereinigung + Legal-Footer

- `height: 100dvh; overflow: hidden` statt `min-height` (Grid 1fr fix)
- `min-height: 0` auf `.sess-body`, `.col-soul`, `.col-chat`
- Entfernt: `.sess-sub` (Session N°, Token-Count)
- Entfernt: `.index-strip` (IDX-Anzeige)
- Hinzugefügt: `<footer class="sess-foot">` mit Datenschutz / Impressum / Lizenz
- `@role-change="aiRole = $event"` auf `<ChatInterface>`

### 4. `app/components/ChatInterface.vue`
**Was:** Komplette Neuentwicklung

- `useClaude().chat()` + `useSession()` State-Management
- Feature-Chips: Kamera, Datei, YouTube, Spotify, Web
- `@search-youtube` / `@search-spotify` / `@search-google` Prefix-Routing
- Mode-Toggle Soul ↔ Entwicklung mit `@role-change` Emit
- Textarea mit `padding-left: clamp(12px,2vw,20px)`
- Enter sendet, Shift+Enter = Newline
- Höhenkette: `flex:1; min-height:0` + `flex-shrink:0` für Dock

### 5. `app/components/SoulViewer.vue`
**Was:** Datum-Badges entfernt

- „Erstellt" und „Zuletzt" Badge-Block entfernt

### 6. `app/components/SoulAnchorModal.vue`
**Was:** Editorial Redesign (Script unverändert)

- Sharp corners, Monospace-Labels, Violett-Primary-Button
- Backdrop `@click.self` für Outside-Click-Close

### 7. `app/components/LiveProfile.vue`
**Was:** Editorial Redesign (Script unverändert)

- Tab-Bar border-bottom, aktiver Tab Violett-Underline
- Carousel-Track mit `translateX`

### 8. `app/pages/impressum.vue` + `datenschutz.vue` + `lizenz.vue`
**Was:** Back-Navigation repariert

```diff
- <NuxtLink to="/" class="back">← Zurück</NuxtLink>
+ <button class="back" @click="$router.back()">← Zurück</button>
```
Navigiert jetzt zurück in den jeweiligen Kontext (Session oder Dashboard),
nicht mehr immer zum Dashboard.

---

## Deploy-Schritte auf dem VPS

```bash
# 1. In die Arbeitsinstanz wechseln
cd /var/www/SaveYourSoul_deploy

# 2. Geänderte Dateien einspielen — validateSoulToken.js ausschließen
rsync -av \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='.certs' \
  --exclude='server/utils/validateSoulToken.js' \
  /pfad/zum/SaveYourSoul_update/ /var/www/SaveYourSoul_deploy/

# 3. Abhängigkeiten prüfen (nur wenn package.json geändert)
npm install

# 4. Build generieren
npm run generate

# 5. CSP Meta-Tags entfernen
cd utils && node killMetas.mjs && cd ..

# 6. Static Output auf Webroot synchronisieren
rsync -a --delete .output/public/ /var/www/sys.uxprojects-jok.com/

# 7. OpenResty neu laden
openresty -s reload
```

---

## Keine Lua-Änderungen

Die OpenResty-Lua-Scripts wurden nicht geändert. Nur das Frontend (SPA).

---

## Hinweis: .certs

`.certs` wurde aus diesem Update-Paket entfernt. Die Zertifikate
kommen vom VPS (Let's Encrypt / mkcert läuft nicht mehr lokal).

---

## Schnellcheck nach Deploy

- [ ] Dashboard-Header zeigt nur noch `SYS.` (kein Logo-Bild)
- [ ] Consent-Banner hat Editorial-Stil (scharfe Ecken, Monospace-Kicker)
- [ ] Chat-Input sichtbar und am unteren Rand fixiert
- [ ] Enter / Senden-Button streamt Antwort in den Chat
- [ ] Mode-Toggle Soul ↔ Entwicklung funktioniert
- [ ] Feature-Chips (Kamera, Datei, YouTube, Spotify, Web) sichtbar
- [ ] Polygon-Modal hat Editorial-Stil
- [ ] Profil-Panel hat Editorial-Stil
- [ ] Session-Seite zeigt Legal-Footer
- [ ] „← Zurück" auf Legal-Seiten kehrt zum vorherigen Kontext zurück
- [ ] SoulViewer zeigt keine Erstellt/Zuletzt-Badges
