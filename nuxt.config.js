import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: "2025-07-15",

  modules: ["@nuxtjs/i18n"],

  i18n: {
    strategy: "no_prefix",
    defaultLocale: "en",
    locales: [
      { code: "en", name: "English", file: "en.json" },
      { code: "de", name: "Deutsch", file: "de.json" },
    ],
    lazy: true,
    langDir: "locales/",
    detectBrowserLanguage: false,
    // Impressum/Datenschutz/Lizenz brauchen echtes HTML (Absätze, Links) in
    // den Übersetzungen — der Default (strictMessage: true) macht daraus
    // sonst einen harten Build-Fehler statt nur der beabsichtigten
    // XSS-Warnung. Die Strings hier sind Entwickler-Content, kein User-Input.
    compilation: { strictMessage: false },
  },

  runtimeConfig: {
    public: {
      // Personal Node: Soul-Erstellung immer erlaubt (Single-Soul, erster Nutzer wird Owner)
      allowCreateSoul: true,
      // Node-Identität — wird auf der Landingpage angezeigt
      nodeName: process.env.NODE_NAME || "My Soul Node",
      nodeTagline: process.env.NODE_TAGLINE || "",
      // Docs öffentlich zugänglich? false = nur eingeloggte User
      docsPublic: process.env.DOCS_PUBLIC === "true",
      reownProjectId: process.env.REOWN_PROJECT_ID || "",
      // Etherscan API-Key für /scanner (On-Chain-Discovery via getLogs, siehe scanner.vue)
      // Kostenloser Free-Tier-Key reicht — ohnehin öffentlich im Browser-Bundle sichtbar.
      etherscanApiKey: process.env.NUXT_PUBLIC_ETHERSCAN_API_KEY || "",
    },
  },

  css: ["~/assets/css/main.css", "~/assets/css/sys-v2.css"],

  nitro: {
    preset: "static",
    compressPublicAssets: true,
    prerender: {
      crawlLinks: true,
      routes: ["/", "/api-docs", "/agb"],
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
      htmlAttrs: { lang: "en" },
      title: "Personal SYS VPS",
      meta: [
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover",
        },
        { name: "description", content: "Your personal identity layer for AI systems. Portable. Encrypted. Under your control." },
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
        { rel: "manifest", href: "/manifest.json?v=10" },
        { rel: "icon", type: "image/x-icon", href: "/logo.ico?v=9" },
        {
          rel: "apple-touch-icon",
          sizes: "192x192",
          href: "/icons/icon-192.png?v=9",
        },
        {
          rel: "apple-touch-icon",
          sizes: "512x512",
          href: "/icons/icon-512.png?v=9",
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
