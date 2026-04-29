// app/composables/useYouTube.js
// YouTube Data API v3 – Google OAuth 2.0 Implicit Flow (client-seitig, kein Secret)
// Implicit flow: response_type=token → access_token kommt im URL-Hash zurück.
import { ref } from "vue";

const TOKEN_KEY     = "sys.yt_token";
const STATE_KEY     = "sys.yt_state";
const CLIENT_ID_KEY = "sys.yt_client_id";

// Singleton-State
const accessToken   = ref(null);
const isConnected   = ref(false);
const subscriptions = ref([]);
const likedVideos   = ref([]);

export function useYouTube() {
  const isClient = typeof window !== "undefined";

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

  function connect(clientId) {
    if (!isClient) return;
    const id = clientId?.trim() || getStoredClientId();
    if (!id) throw new Error("Kein YouTube Client ID");
    localStorage.setItem(CLIENT_ID_KEY, id);

    // State für CSRF-Schutz
    const state = Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map(b => b.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem(STATE_KEY, state);

    const params = new URLSearchParams({
      client_id:              id,
      redirect_uri:           getRedirectUri(),
      response_type:          "token",
      scope:                  "https://www.googleapis.com/auth/youtube.readonly",
      state,
      include_granted_scopes: "true"
    });
    window.location.href = "https://accounts.google.com/o/oauth2/auth?" + params;
  }

  // Callback: liest access_token aus dem URL-Hash (implicit flow)
  function handleCallback(hash) {
    const params  = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const token   = params.get("access_token");
    const expires = params.get("expires_in");
    const state   = params.get("state");

    if (!token) return false;

    const storedState = sessionStorage.getItem(STATE_KEY);
    if (storedState && state !== storedState) throw new Error("State mismatch – möglicher CSRF-Angriff.");

    accessToken.value = token;
    isConnected.value = true;
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
      token,
      expires: Date.now() + (parseInt(expires) || 3600) * 1000
    }));
    sessionStorage.removeItem(STATE_KEY);
    return true;
  }

  // ── Daten abrufen ─────────────────────────────────────────────────────────

  async function fetchData() {
    const headers = { Authorization: `Bearer ${accessToken.value}` };
    const [subsRes, likedRes] = await Promise.all([
      fetch(
        "https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50&order=alphabetical",
        { headers }
      ),
      fetch(
        "https://www.googleapis.com/youtube/v3/videos?part=snippet&myRating=like&maxResults=20",
        { headers }
      )
    ]);
    if (!subsRes.ok || !likedRes.ok) throw new Error("YouTube API Fehler");
    const [subs, liked] = await Promise.all([subsRes.json(), likedRes.json()]);
    subscriptions.value = subs.items  ?? [];
    likedVideos.value   = liked.items ?? [];
    return { subscriptions: subscriptions.value, likedVideos: likedVideos.value };
  }

  // Formatiert die Daten als sys.md-Text (für ## Ästhetik & Resonanz)
  function formatForSoul() {
    const channels = subscriptions.value
      .map(s => s.snippet?.title)
      .filter(Boolean)
      .join(", ");
    const videos = likedVideos.value
      .slice(0, 8)
      .map(v => v.snippet?.title)
      .filter(Boolean)
      .join(", ");
    const lines = [];
    if (channels) lines.push(`YouTube-Abos: ${channels}.`);
    if (videos)   lines.push(`Gelikte Videos (zuletzt): ${videos}.`);
    return lines.join("\n");
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  function disconnect() {
    if (!isClient) return;
    accessToken.value   = null;
    isConnected.value   = false;
    subscriptions.value = [];
    likedVideos.value   = [];
    sessionStorage.removeItem(TOKEN_KEY);
  }

  return {
    isConnected,
    subscriptions,
    likedVideos,
    getStoredClientId,
    loadStoredToken,
    connect,
    handleCallback,
    fetchData,
    formatForSoul,
    disconnect
  };
}
