// app/composables/useSpotify.js
// Spotify Web API – PKCE OAuth (kein Client Secret nötig, rein client-seitig)
import { ref } from "vue";

const VERIFIER_KEY  = "sys.spotify_verifier";
const STATE_KEY     = "sys.spotify_state";
const TOKEN_KEY     = "sys.spotify_token";
const CLIENT_ID_KEY = "sys.spotify_client_id";

// Singleton-State
const accessToken = ref(null);
const isConnected = ref(false);
const topArtists  = ref([]);
const topTracks   = ref([]);

export function useSpotify() {
  const isClient = typeof window !== "undefined";

  // ── PKCE Helpers ──────────────────────────────────────────────────────────

  function generateVerifier(length = 64) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
      .slice(0, length);
  }

  async function generateChallenge(verifier) {
    const data   = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  function getRedirectUri() {
    return window.location.origin + "/session";
  }

  // ── Token-Storage ─────────────────────────────────────────────────────────

  function loadStoredToken() {
    if (!isClient) return false;
    try {
      const raw = sessionStorage.getItem(TOKEN_KEY);
      if (!raw) return false;
      const { token, expires } = JSON.parse(raw);
      if (Date.now() >= expires) { sessionStorage.removeItem(TOKEN_KEY); return false; }
      accessToken.value = token;
      isConnected.value = true;
      return true;
    } catch { return false; }
  }

  function getStoredClientId() {
    if (!isClient) return "";
    return localStorage.getItem(CLIENT_ID_KEY) || "";
  }

  // ── OAuth Connect ─────────────────────────────────────────────────────────

  async function connect(clientId) {
    if (!isClient) return;
    const id = clientId?.trim() || getStoredClientId();
    if (!id) throw new Error("Kein Spotify Client ID");
    localStorage.setItem(CLIENT_ID_KEY, id);

    const verifier  = generateVerifier();
    const challenge = await generateChallenge(verifier);
    const state     = generateVerifier(16);

    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);

    const params = new URLSearchParams({
      client_id:             id,
      response_type:         "code",
      redirect_uri:          getRedirectUri(),
      code_challenge_method: "S256",
      code_challenge:        challenge,
      scope:                 "user-top-read user-read-recently-played",
      state
    });
    window.location.href = "https://accounts.spotify.com/authorize?" + params;
  }

  // Callback: tauscht den Code gegen ein Token (PKCE – kein Secret nötig)
  async function handleCallback(code, state) {
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    if (!verifier) return; // kein Spotify-Flow erwartet

    const storedState = sessionStorage.getItem(STATE_KEY);
    if (storedState && state !== storedState) throw new Error("State mismatch – möglicher CSRF-Angriff.");

    const clientId = getStoredClientId();
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     clientId,
        grant_type:    "authorization_code",
        code,
        redirect_uri:  getRedirectUri(),
        code_verifier: verifier
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || "Spotify Token-Austausch fehlgeschlagen.");

    accessToken.value = data.access_token;
    isConnected.value = true;
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
      token:   data.access_token,
      expires: Date.now() + (data.expires_in ?? 3600) * 1000
    }));
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
  }

  // ── Daten abrufen ─────────────────────────────────────────────────────────

  async function fetchTopData() {
    const headers = { Authorization: `Bearer ${accessToken.value}` };
    const [aRes, tRes] = await Promise.all([
      fetch("https://api.spotify.com/v1/me/top/artists?limit=15&time_range=medium_term", { headers }),
      fetch("https://api.spotify.com/v1/me/top/tracks?limit=10&time_range=medium_term",  { headers })
    ]);
    if (!aRes.ok || !tRes.ok) throw new Error("Spotify API Fehler");
    const [a, t] = await Promise.all([aRes.json(), tRes.json()]);
    topArtists.value = a.items ?? [];
    topTracks.value  = t.items ?? [];
    return { artists: topArtists.value, tracks: topTracks.value };
  }

  // Formatiert die Daten als sys.md-Text (für ## Ästhetik & Resonanz)
  function formatForSoul() {
    const artists = topArtists.value
      .map(a => {
        const genres = a.genres?.slice(0, 2).join(", ");
        return genres ? `${a.name} (${genres})` : a.name;
      })
      .join(", ");
    const tracks = topTracks.value
      .map(t => `${t.name} – ${t.artists[0]?.name}`)
      .join(", ");
    const lines = [];
    if (artists) lines.push(`Lieblingskünstler (Spotify): ${artists}.`);
    if (tracks)  lines.push(`Top-Tracks (Spotify): ${tracks}.`);
    return lines.join("\n");
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  function disconnect() {
    if (!isClient) return;
    accessToken.value = null;
    isConnected.value = false;
    topArtists.value  = [];
    topTracks.value   = [];
    sessionStorage.removeItem(TOKEN_KEY);
  }

  return {
    isConnected,
    topArtists,
    topTracks,
    getStoredClientId,
    loadStoredToken,
    connect,
    handleCallback,
    fetchTopData,
    formatForSoul,
    disconnect
  };
}
