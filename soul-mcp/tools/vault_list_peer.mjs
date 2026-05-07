/**
 * Generischer Vault-List-Tool für Peer-Zugriff.
 * Liest Dateiliste aus api_context.json synced_files direkt vom Dateisystem.
 * Wird für audio_list, image_list, video_list, context_list als Peer-Variante verwendet.
 */

import { loadVaultMeta, getMime, SOULS_DIR } from '../lib/vault_fs.mjs';

const TYPE_DESCRIPTIONS = {
  audio:   'Listet alle Audio-Dateien im Vault auf.',
  images:  'Listet alle Bild-Dateien im Vault auf.',
  video:   'Listet alle Video-Dateien im Vault auf.',
  context: 'Listet alle Text-Kontext-Dateien (.md, .txt, .pdf) im Vault auf.',
};

export function registerList(server, targetSoulId, vaultType) {
  const toolName  = vaultType === 'images' ? 'image_list' : `${vaultType}_list`;
  const urlBase   = `${SOULS_DIR}${targetSoulId}/vault/${vaultType}`;

  server.tool(
    toolName,
    TYPE_DESCRIPTIONS[vaultType] || `Listet ${vaultType}-Dateien im Vault auf.`,
    {},
    async () => {
      try {
        const { syncedFiles, activeFiles } = await loadVaultMeta(targetSoulId);
        const files     = syncedFiles[vaultType] || [];
        const activeRaw = activeFiles[vaultType];
        const activeName = typeof activeRaw === 'string' ? activeRaw : '';

        const list = files.map(name => ({
          name,
          mime:   getMime(name),
          active: name === activeName,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ type: vaultType, files: list }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `${toolName} fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
