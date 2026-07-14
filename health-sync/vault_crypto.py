"""Shared AES-256-CBC vault-file encryption, compatible with the Lua side
(lua/api_context.lua encrypt_content / lua/api_serve.lua try_decrypt).

Format: b"SYS\\x01" (4-byte magic) + 16-byte random IV + PKCS7-padded
AES-256-CBC ciphertext. Key is vault_key_hex (64 hex chars = 32 raw bytes),
read from a soul's api_context.json.
"""

import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

MAGIC = b"SYS\x01"


def encrypt(plaintext: bytes, vault_key_hex: str) -> bytes:
    """Encrypts plaintext for storage. Returns plaintext unchanged if no key."""
    if not vault_key_hex or len(vault_key_hex) != 64:
        return plaintext
    key = bytes.fromhex(vault_key_hex)
    iv = os.urandom(16)
    padder = padding.PKCS7(128).padder()
    padded = padder.update(plaintext) + padder.finalize()
    encryptor = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()
    return MAGIC + iv + ciphertext


def decrypt(data: bytes, vault_key_hex: str) -> bytes | None:
    """Decrypts data written by encrypt(). Returns data unchanged if not
    encrypted (no magic prefix). Returns None if encrypted but no/invalid key."""
    if not data or not data.startswith(MAGIC):
        return data
    if not vault_key_hex or len(vault_key_hex) != 64:
        return None
    key = bytes.fromhex(vault_key_hex)
    iv = data[4:20]
    ciphertext = data[20:]
    decryptor = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()
    unpadder = padding.PKCS7(128).unpadder()
    return unpadder.update(padded) + unpadder.finalize()


def encrypt_field(plaintext: str, vault_key_hex: str | None) -> str:
    """Encrypts a JSON string field (e.g. garmin_email/garmin_password) and
    base64-encodes the result so it stays valid JSON text — matches the Lua
    side's encrypt_field() in lua/health_config.lua. Passthrough if no key."""
    if not plaintext:
        return plaintext
    if not vault_key_hex or len(vault_key_hex) != 64:
        return plaintext
    import base64
    ciphertext = encrypt(plaintext.encode("utf-8"), vault_key_hex)
    return base64.b64encode(ciphertext).decode("ascii")


def decrypt_field(data: str, vault_key_hex: str | None) -> str | None:
    """Decrypts a JSON string field written by encrypt_field(). Returns data
    unchanged if it's plaintext (legacy, not base64/magic-prefixed). Returns
    None if encrypted but no/invalid key available."""
    if not data:
        return data
    import base64
    try:
        decoded = base64.b64decode(data, validate=True)
    except Exception:
        return data  # not base64 → legacy plaintext, passthrough
    if not decoded.startswith(MAGIC):
        return data  # base64-looking but not our format → legacy plaintext
    plaintext = decrypt(decoded, vault_key_hex)
    if plaintext is None:
        return None
    return plaintext.decode("utf-8")


def read_vault_key(soul_id: str) -> str | None:
    """Reads vault_key_hex from a soul's api_context.json, or None if absent."""
    ctx_path = Path(f"/var/lib/sys/souls/{soul_id}/api_context.json")
    try:
        ctx = json.loads(ctx_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    key = ctx.get("vault_key_hex")
    if isinstance(key, str) and len(key) == 64:
        return key
    return None
