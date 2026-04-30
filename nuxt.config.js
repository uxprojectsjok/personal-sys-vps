import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: "2025-07-15",

  runtimeConfig: {
    // Server-only key (nicht im Client-Bundle)
    wavespeedKey: process.env.WAVESPEED_KEY || "",
    public: {
      // Spotify App Client ID (developer.spotify.com → App → Client ID)
      spotifyClientId: process.env.SPOTIFY_CLIENT_ID || "",
      // Google OAuth 2.0 Web Client ID (console.cloud.google.com → APIs & Dienste → Anmeldedaten)
      youtubeClientId: process.env.YOUTUBE_CLIENT_ID || "",
      // Feature-Flag: Closed Beta – Soul-Erstellung deaktiviert
      // Zum Reaktivieren: true setzen oder process.env.ALLOW_CREATE_SOUL !== "false"
      allowCreateSoul: false,
      // Node-Identität — wird auf der Landingpage angezeigt
      nodeName: process.env.NODE_NAME || "Mein Soul-Node",
      nodeTagline: process.env.NODE_TAGLINE || "",
      // Docs öffentlich zugänglich? false = nur eingeloggte User
      docsPublic: process.env.DOCS_PUBLIC === "true",
      walletConnectProjectId:
        "201ffb5b9c495a44766312bc247cd80f",
    },
  },

  css: ["~/assets/css/main.css"],

  nitro: {
    preset: "static",
    compressPublicAssets: true,
    prerender: {
      crawlLinks: true,
      routes: ["/", "/api-docs"],
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  devServer: {
    host: "0.0.0.0",
    port: 3007,
    // HTTPS required for WebCrypto, camera, and Passkey APIs in dev.
    // Generate local certs with mkcert:
    //   mkcert -install && mkcert localhost 127.0.0.1 ::1
    // then place them in .certs/ (already in .gitignore).
    https: {
      key: resolve(".certs/localhost+2-key.pem"),
      cert: resolve(".certs/localhost+2.pem"),
    },
  },

  app: {
    baseURL: "/",
    buildAssetsDir: "/_nuxt/",
    head: {
      htmlAttrs: { lang: "de" },
      title: "Personal SYS VPS",
      script: [
        {
          // Force viewport zoom reset on Android Chrome before first paint.
          // Chrome saves zoom per domain; this resets it to 1:1 immediately.
          innerHTML: `(function(){var m=document.querySelector('meta[name=viewport]');if(m){var c=m.content;m.content='width=device-width,initial-scale=1,maximum-scale=1';setTimeout(function(){m.content=c;},1);}})();`,
          type: 'text/javascript',
        }
      ],
      meta: [
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, viewport-fit=cover",
        },
        { name: "description", content: "Deine persönliche Identitätsschicht für KI-Systeme. Portabel. Verschlüsselt. Unter deiner Kontrolle." },
        { name: "theme-color", content: "#12101a" },
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        {
          name: "apple-mobile-web-app-status-bar-style",
          content: "black-translucent",
        },
        { name: "apple-mobile-web-app-title", content: "SYS" },
      ],
      link: [
        { rel: "manifest", href: "/manifest.json?v=2" },
        { rel: "icon", type: "image/x-icon", href: "/logo.ico?v=2" },
        {
          rel: "apple-touch-icon",
          sizes: "192x192",
          href: "/icons/icon-192.png?v=2",
        },
        {
          rel: "apple-touch-icon",
          sizes: "512x512",
          href: "/icons/icon-512.png?v=2",
        },
        // Font Preloads – lokale Auslieferung, keine externen CDNs
        { rel: "preload", as: "font", type: "font/woff2", href: "/fonts/oxanium/Oxanium-Regular.woff2", crossorigin: "anonymous" },
        { rel: "preload", as: "font", type: "font/woff2", href: "/fonts/oxanium/Oxanium-SemiBold.woff2", crossorigin: "anonymous" },
        { rel: "preload", as: "font", type: "font/woff2", href: "/fonts/noto-serif/NotoSerif-Bold.woff2", crossorigin: "anonymous" },
        { rel: "preload", as: "font", type: "font/woff2", href: "/fonts/inter/Inter_18pt-Regular.woff2", crossorigin: "anonymous" },
        { rel: "stylesheet", href: "/fonts/remixicon/remixicon.css" },
      ],
    },
  },
});
