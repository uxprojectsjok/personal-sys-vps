// agent_vault_ctx.mjs — decrypt/encrypt agent.md for the Autonomous Agent Runner
// (shared/sys-agent-run.sh), which works with the vault as plaintext on disk but
// must never persist plaintext into a vault stored with cipher_mode "ciphered".
// Reuses vault_fs.mjs's exact AES-256-CBC scheme so the result round-trips
// through soul_write/context_get like any browser-side vault write.
//
// Usage:
//   node agent_vault_ctx.mjs decrypt <soul_id> <out_path>
//   node agent_vault_ctx.mjs encrypt <soul_id> <in_path>

import { loadVaultMeta, readVaultFile, encryptBuf, SOULS_DIR } from '../lib/vault_fs.mjs';
import { readFile, writeFile } from 'fs/promises';

const [, , cmd, soulId, path] = process.argv;

if (!cmd || !soulId || !path || !/^[a-zA-Z0-9-]+$/.test(soulId)) {
  console.error('usage: agent_vault_ctx.mjs <decrypt|encrypt> <soul_id> <path>');
  process.exit(2);
}

const meta = await loadVaultMeta(soulId);

if (cmd === 'decrypt') {
  const buf = await readVaultFile(soulId, 'context', 'agent.md', meta.vaultKeyHex);
  await writeFile(path, buf);
} else if (cmd === 'encrypt') {
  const plain = await readFile(path);
  const target = `${SOULS_DIR}${soulId}/vault/context/agent.md`;
  const out = (meta.cipherMode === 'ciphered' && meta.vaultKeyHex)
    ? encryptBuf(plain, meta.vaultKeyHex)
    : plain;
  await writeFile(target, out);
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}
