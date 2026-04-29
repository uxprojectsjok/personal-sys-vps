# Encryption Architecture

---

## Overview

SYS uses two distinct encryption layers depending on the use case:

| Layer | Algorithm | Where | Key holder |
|---|---|---|---|
| VPS storage | AES-256-CBC | Server-side files | User (via vault_key) |
| Bundle export | AES-256-GCM | .soul file download | User (Passkey or BIP39) |
| Transit | TLS 1.2+ | All API traffic | Certificate authority |

---

## 1. VPS Encryption (AES-256-CBC)

### 1.1 File Format

```
[ 4 bytes magic ][ 16 bytes IV ][ N bytes ciphertext ]
    53 59 53 01     random          PKCS7-padded
    (SYS\x01)
```

Detection: files starting with bytes `53 59 53 01` are encrypted.
Files without this magic header are treated as plaintext.

### 1.2 Key (vault_key)

- 32 bytes (256 bits), stored as 64 lowercase hex characters
- Transmitted in `POST /api/vault/unlock` body, over TLS
- Stored in OpenResty shared memory (`vault_sessions` lua_shared_dict)
- Optionally persisted as `vault_key_hex` in `api_context.json` to enable
  service-token decryption without an active session

### 1.3 Cipher Mode Selection

```json
{ "cipher_mode": "ciphered" }   ← default — AES-256-CBC before storage
{ "cipher_mode": "open"     }   ← plaintext — only for public network souls
```

Open mode MUST only be activated by an explicit user action.
The server MUST re-encrypt plaintext uploads if `cipher_mode` is `"ciphered"`.

### 1.4 Server-Side Encryption Path

```
client uploads soul_content (plaintext)
  → server checks cipher_mode
  → if "ciphered": generate random IV → AES-256-CBC(vault_key, IV, plaintext)
  → write [magic][IV][ciphertext] to disk
```

### 1.5 Server-Side Decryption Path

```
read file from disk
  → check magic header SYS\x01
  → if present: extract IV (bytes 5–20), ciphertext (bytes 21+)
  → AES-256-CBC-decrypt with vault_key from active session
  → return plaintext
```

---

## 2. Bundle Encryption (AES-256-GCM)

Used for `.soul` bundle exports and cloud backups. The bundle is a JSON
file with the following structure:

```json
{
  "schema": "saveyoursoul/bundle/v1",
  "kdf_params": {
    "algorithm": "PBKDF2",
    "hash": "SHA-256",
    "iterations": 100000,
    "salt": "<base64 random 16 bytes>"
  },
  "files": [
    {
      "path": "sys.md",
      "iv": "<base64 12 bytes>",
      "data": "<base64 AES-256-GCM ciphertext + 16-byte tag>"
    }
  ]
}
```

### 2.1 Key Derivation

**From Passkey (WebAuthn):**
```
key = WebAuthn.getAssertion().response.userHandle (32 bytes from authenticator)
```

**From BIP39 mnemonic:**
```
key = PBKDF2-SHA256(
  password = mnemonic_string,
  salt     = soul_id,
  iterations = 100000,
  length   = 32
)
```

### 2.2 Per-File Encryption

```
for each file:
  iv = crypto.getRandomValues(12 bytes)
  [ciphertext + tag] = AES-256-GCM.encrypt(key, iv, plaintext)
  store: { path, iv: base64(iv), data: base64(ciphertext+tag) }
```

### 2.3 Cloud Push

The `soul_cloud_push` MCP tool and manual export both use this format.
The server fetches AES-256-CBC ciphertext from the vault and re-packages
it into AES-256-GCM bundle format **without ever decrypting to plaintext**
when `?raw=1` is used on `/api/soul`.

---

## 3. Transit Security

- All endpoints are HTTPS-only (HSTS enforced, `max-age=63072000`)
- TLS certificates via Let's Encrypt
- `ssl_verify = true` on all outgoing server-side requests
- CSP nonce generated via `resty.random` (CSPRNG) per request

---

## 4. Key Storage Summary

| Key | Where stored | Who can read |
|---|---|---|
| `SOUL_MASTER_KEY` | systemd environment | Server process only |
| `API_SIGNING_KEY` | systemd environment | Server process only |
| `vault_key` (session) | OpenResty shared dict | Server process only, TTL-bound |
| `vault_key_hex` (persisted) | api_context.json on VPS | Server + authorized service-tokens |
| Bundle key (GCM) | User's brain / Passkey / BIP39 | User only — never touches server |

### Trust boundary

Full server-side protection (operator cannot read content) applies **only**
when:
- `vault_key_hex` is NOT persisted in `api_context.json` (i.e. service-tokens disabled)
- Bundle export uses Passkey or BIP39 key that never reaches the server

When service-tokens are enabled, the `vault_key_hex` stored in `api_context.json`
allows the server to decrypt for authorized service requests. This is a
deliberate trade-off — documented in the privacy policy.
