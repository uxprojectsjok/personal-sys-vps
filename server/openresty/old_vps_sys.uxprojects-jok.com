# /etc/openresty/sites-available/sys.uxprojects-jok.com
# Deploy: sudo cp sys.uxprojects-jok.com.nginx /etc/openresty/sites-available/sys.uxprojects-jok.com
#         sudo openresty -t && sudo openresty -s reload
# Geändert 2026-03-10:
#   [FIX KRITISCH] Nonce: math.random → resty.random (CSPRNG)
#   [FIX MITTEL]   Security-Headers: add_header → more_set_headers (vererbt sich in alle Locations)
#   [FIX MITTEL]   font-src: https: entfernt (zu weit)
#   [FIX GERING]   Error-Pages: Status-Codes korrekt (=400/403/404/...)
#   [NEU]          Permissions-Policy + Cross-Origin-Opener-Policy
#   [CLEANUP]      CSP: Duplikate in connect-src + frame-src entfernt

############################
# HTTP → HTTPS
############################
server {
  listen 80;
  server_name sys.uxprojects-jok.com www.sys.uxprojects-jok.com;
  return 301 https://$host$request_uri;
}

############################
# HTTPS
############################
server {
  listen 443 ssl;
  http2 on;
  server_name sys.uxprojects-jok.com www.sys.uxprojects-jok.com;

  ################################
  # TLS
  ################################
  ssl_certificate     /etc/openresty/ssl/uxprojects-jok.com/uxprojects-jok-fullchain.pem;
  ssl_certificate_key /etc/openresty/ssl/uxprojects-jok.com/uxprojects-jok-key.pem;
  ssl_protocols       TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers on;
  ssl_session_cache   shared:SSL:10m;
  ssl_session_timeout 10m;

  ################################
  # Nonce pro Request
  # FIX: war math.random (PRNG, vorhersagbar) → jetzt resty.random (CSPRNG)
  ################################
  set_by_lua_block $nonce {
    local random = require("resty.random")
    local str    = require("resty.string")
    return str.to_hex(random.bytes(12))
  }

  ################################
  # Security Headers
  # more_set_headers (headers-more-nginx-module, in OpenResty built-in):
  # Vererbt sich in ALLE location-Blöcke, unabhängig von deren add_header-Direktiven.
  # Löst das nginx-Vererbungsproblem (add_header überschreibt server-level nicht).
  ################################
  more_set_headers "Strict-Transport-Security: max-age=63072000; includeSubDomains; preload";
  more_set_headers "X-Content-Type-Options: nosniff";
  more_set_headers "Referrer-Policy: no-referrer";
  more_set_headers "Permissions-Policy: camera=(self), microphone=(self), geolocation=(), payment=()";
  more_set_headers "Cross-Origin-Opener-Policy: same-origin";

  ################################
  # Error Pages – mit korrekten Status-Codes
  ################################
  error_page 400 =400 /400.html;
  error_page 401 =401 /401.html;
  error_page 403 =403 /403.html;
  error_page 404 =404 /404.html;
  error_page 500 =500 /500.html;
  error_page 502 =502 /502.html;
  error_page 504 =504 /504.html;

  location ~ ^/(400|401|403|404|500|502|504)\.html$ {
    root /var/www/sys.uxprojects-jok.com;
    internal;
  }

  ################################
  # Sensitive Files blocken
  ################################
  location ~ /\.(svn|hg|DS_Store|htaccess|npmrc|yarnrc|lock) {
    deny all;
    access_log off;
    log_not_found off;
  }
  location ^~ /.git/              { return 404; }
  location ^~ /.env               { return 404; }
  location ~ /\.(?!well-known/)   { return 404; }
  location ~ ^/(assets|_nuxt|logo|fonts|img)/$ { return 404; }
  location ~ ^/(assets|_nuxt|logo|fonts|img)$  { return 404; }

  ################################
  # Static Assets – Long Cache
  # Security-Headers kommen via more_set_headers (server-level) automatisch mit.
  ################################
  location ~* \.(?:css|js|mjs|png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|woff|ttf|otf|eot|map|json|xml|txt|mp4|webm)$ {
    root /var/www/sys.uxprojects-jok.com;
    try_files $uri =404;
    access_log off;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    add_header Accept-Ranges "bytes" always;
  }

  ################################
  # Gzip
  ################################
  gzip on;
  gzip_types text/plain text/css application/javascript application/json image/svg+xml;
  gzip_min_length 256;
  gzip_comp_level 6;

  ################################
  # Nuxt Payload
  ################################
  location = /_payload.json {
    root /var/www/sys.uxprojects-jok.com;
    default_type application/json;
    try_files /_payload.json =404;
    add_header Cache-Control "no-store" always;
  }
  location ^~ /_payload/ {
    root /var/www/sys.uxprojects-jok.com;
    default_type application/json;
    try_files $uri =404;
    add_header Cache-Control "no-store" always;
  }

  # ── Soul-API-Token (JWT) ausstellen ──────────────────────────────────────────
  location = /api/soul/v1/token {
    limit_except POST { deny all; }
    limit_req zone=chat burst=5 nodelay;
    access_by_lua_file /etc/openresty/lua/soul_auth.lua;
    default_type application/json;
    content_by_lua_file /etc/openresty/lua/soul_token_jwt.lua;
  }

  # ── Soul-Session signieren (kein Auth – HMAC ist die Absicherung) ───────────
  location = /api/soul-sign-session {
    limit_except POST { deny all; }
    limit_req zone=chat burst=10 nodelay;
    default_type application/json;
    content_by_lua_file /etc/openresty/lua/soul_sign_session.lua;
  }

  # ── Soul-Cert generieren (kein Auth – HMAC ist die Absicherung) ──────────────
  location = /api/soul-cert {
    limit_req zone=chat burst=10 nodelay;
    default_type application/json;
    content_by_lua_file /etc/openresty/lua/soul_cert.lua;
  }

  # ── Cert-Vorvalidierung (kein Anthropic-Aufruf) ──────────────────────────────
  location = /api/validate {
    limit_req zone=chat burst=10 nodelay;
    access_by_lua_file /etc/openresty/lua/soul_auth.lua;
    default_type application/json;
    add_header Cache-Control "no-store" always;
    return 200 '{"ok":true}';
  }

  ################################
  # /api/soul-update → Anthropic Proxy (kein Streaming, JSON-Antwort)
  ################################
  location = /api/soul-update {
    limit_except POST { deny all; }
    limit_req zone=chat burst=5 nodelay;
    access_by_lua_file /etc/openresty/lua/soul_auth.lua;

    set_by_lua_block $anthropic_key {
      return os.getenv("ANTHROPIC_API_KEY") or ""
    }

    resolver 1.1.1.1 8.8.8.8 valid=60s ipv6=off;
    resolver_timeout 5s;

    proxy_pass            https://api.anthropic.com/v1/messages;
    proxy_ssl_server_name on;
    proxy_ssl_name        api.anthropic.com;
    proxy_ssl_verify      on;
    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;

    proxy_set_header Host              "api.anthropic.com";
    proxy_set_header x-api-key         $anthropic_key;
    proxy_set_header anthropic-version "2023-06-01";
    proxy_set_header Origin            "";
    proxy_set_header Referer           "";

    proxy_http_version 1.1;
    proxy_set_header   Connection "";

    proxy_connect_timeout  10s;
    proxy_send_timeout     30s;
    proxy_read_timeout     60s;
    client_max_body_size   5M;

    add_header Cache-Control "no-store" always;
  }

  ################################
  # /api/chat → Anthropic Proxy
  ################################
  location = /api/chat {
    limit_except POST { deny all; }
    limit_req zone=chat burst=3 nodelay;
    access_by_lua_file /etc/openresty/lua/soul_auth.lua;

    set_by_lua_block $anthropic_key {
      return os.getenv("ANTHROPIC_API_KEY") or ""
    }

    resolver 1.1.1.1 8.8.8.8 valid=60s ipv6=off;
    resolver_timeout 5s;

    proxy_pass            https://api.anthropic.com/v1/messages;
    proxy_ssl_server_name on;
    proxy_ssl_name        api.anthropic.com;
    proxy_ssl_verify      on;
    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;

    proxy_set_header Host              "api.anthropic.com";
    proxy_set_header x-api-key         $anthropic_key;
    proxy_set_header anthropic-version "2023-06-01";
    proxy_set_header Origin            "";
    proxy_set_header Referer           "";

    proxy_buffering    off;
    proxy_cache        off;
    proxy_http_version 1.1;
    proxy_set_header   Connection "";

    proxy_connect_timeout  10s;
    proxy_send_timeout     60s;
    proxy_read_timeout    120s;
    client_max_body_size  5M;

    add_header Cache-Control "no-store" always;
  }

  ################################
  # SPA Root
  ################################
  location / {
    root /var/www/sys.uxprojects-jok.com;
    index index.html;
    try_files $uri $uri.html /index.html;

    add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
    add_header Pragma        "no-cache" always;
    add_header Expires       "0" always;
    add_header Vary          "Accept-Encoding" always;
    # CSP: font-src ohne https: (FIX), connect-src + frame-src dedupliziert (CLEANUP)
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://analytics.uxprojects-jok.com 'nonce-${nonce}'; script-src-elem 'self' https://analytics.uxprojects-jok.com 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' 'nonce-${nonce}'; style-src-elem 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'; connect-src 'self' https://analytics.uxprojects-jok.com wss://relay.walletconnect.com https://relay.walletconnect.com https://explorer-api.walletconnect.com https://api.web3modal.com https://api.web3modal.org wss://relay.walletconnect.org https://relay.walletconnect.org https://verify.walletconnect.org https://rpc.walletconnect.org https://pulse.walletconnect.org https://rpc-amoy.polygon.technology https://polygon-rpc.com; font-src 'self' data:; img-src 'self' data: https://explorer-api.walletconnect.com https://imagedelivery.net; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'self' https://secure.walletconnect.com https://secure.walletconnect.org; frame-ancestors 'self'; upgrade-insecure-requests" always;

    body_filter_by_lua_block {
      local chunk, eof = ngx.arg[1], ngx.arg[2]
      if not ngx.ctx.buffer then ngx.ctx.buffer = {} end
      if chunk ~= "" then
        table.insert(ngx.ctx.buffer, chunk)
        ngx.arg[1] = nil
      end
      if eof then
        local ct = ngx.header["Content-Type"] or ""
        if ct:find("text/html", 1, true) then
          local data = table.concat(ngx.ctx.buffer)
          data = data:gsub("<script(.-)>", "<script%1 nonce=\"" .. ngx.var.nonce .. "\">")
          data = data:gsub("<style(.-)>",  "<style%1 nonce=\""  .. ngx.var.nonce .. "\">")
          ngx.arg[1] = data
        else
          ngx.arg[1] = table.concat(ngx.ctx.buffer)
        end
      end
    }
  }

  ################################
  # Legal Pages
  ################################
  location = /impressum/   { return 301 /impressum; }
  location = /datenschutz/ { return 301 /datenschutz; }

  location = /impressum {
    alias /var/www/sys.uxprojects-jok.com/impressum/index.html;
    default_type text/html;
    add_header Content-Type  "text/html; charset=utf-8" always;
    add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
    add_header Pragma        "no-cache" always;
    add_header Expires       "0" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://analytics.uxprojects-jok.com 'nonce-${nonce}'; script-src-elem 'self' https://analytics.uxprojects-jok.com 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' 'nonce-${nonce}'; style-src-elem 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'; connect-src 'self' https://analytics.uxprojects-jok.com wss://relay.walletconnect.com https://relay.walletconnect.com https://explorer-api.walletconnect.com https://api.web3modal.com https://api.web3modal.org wss://relay.walletconnect.org https://relay.walletconnect.org https://verify.walletconnect.org https://rpc.walletconnect.org https://pulse.walletconnect.org https://rpc-amoy.polygon.technology https://polygon-rpc.com; font-src 'self' data:; img-src 'self' data: https://explorer-api.walletconnect.com https://imagedelivery.net; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'self' https://secure.walletconnect.com https://secure.walletconnect.org; frame-ancestors 'self'; upgrade-insecure-requests" always;
    body_filter_by_lua_block {
      local chunk, eof = ngx.arg[1], ngx.arg[2]
      if not ngx.ctx.buffer then ngx.ctx.buffer = {} end
      if chunk ~= "" then
        table.insert(ngx.ctx.buffer, chunk)
        ngx.arg[1] = nil
      end
      if eof then
        local ct = ngx.header["Content-Type"] or ""
        if ct:find("text/html", 1, true) then
          local data = table.concat(ngx.ctx.buffer)
          data = data:gsub("<script(.-)>", "<script%1 nonce=\"" .. ngx.var.nonce .. "\">")
          data = data:gsub("<style(.-)>",  "<style%1 nonce=\""  .. ngx.var.nonce .. "\">")
          ngx.arg[1] = data
        else
          ngx.arg[1] = table.concat(ngx.ctx.buffer)
        end
      end
    }
  }

  location = /datenschutz {
    alias /var/www/sys.uxprojects-jok.com/datenschutz/index.html;
    default_type text/html;
    add_header Content-Type  "text/html; charset=utf-8" always;
    add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
    add_header Pragma        "no-cache" always;
    add_header Expires       "0" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://analytics.uxprojects-jok.com 'nonce-${nonce}'; script-src-elem 'self' https://analytics.uxprojects-jok.com 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' 'nonce-${nonce}'; style-src-elem 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'; connect-src 'self' https://analytics.uxprojects-jok.com wss://relay.walletconnect.com https://relay.walletconnect.com https://explorer-api.walletconnect.com https://api.web3modal.com https://api.web3modal.org wss://relay.walletconnect.org https://relay.walletconnect.org https://verify.walletconnect.org https://rpc.walletconnect.org https://pulse.walletconnect.org https://rpc-amoy.polygon.technology https://polygon-rpc.com; font-src 'self' data:; img-src 'self' data: https://explorer-api.walletconnect.com https://imagedelivery.net; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'self' https://secure.walletconnect.com https://secure.walletconnect.org; frame-ancestors 'self'; upgrade-insecure-requests" always;
    body_filter_by_lua_block {
      local chunk, eof = ngx.arg[1], ngx.arg[2]
      if not ngx.ctx.buffer then ngx.ctx.buffer = {} end
      if chunk ~= "" then
        table.insert(ngx.ctx.buffer, chunk)
        ngx.arg[1] = nil
      end
      if eof then
        local ct = ngx.header["Content-Type"] or ""
        if ct:find("text/html", 1, true) then
          local data = table.concat(ngx.ctx.buffer)
          data = data:gsub("<script(.-)>", "<script%1 nonce=\"" .. ngx.var.nonce .. "\">")
          data = data:gsub("<style(.-)>",  "<style%1 nonce=\""  .. ngx.var.nonce .. "\">")
          ngx.arg[1] = data
        else
          ngx.arg[1] = table.concat(ngx.ctx.buffer)
        end
      end
    }
  }

  ################################
  # Favicon
  ################################
  location = /favicon.ico {
    log_not_found off;
    alias /var/www/sys.uxprojects-jok.com/logo/logo.ico;
    default_type image/x-icon;
  }

  client_max_body_size 1M;
}