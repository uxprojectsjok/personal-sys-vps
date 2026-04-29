import { z } from 'zod';
import { getRawBytes } from '../lib/api.mjs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);

export function register(server, token) {
  server.tool(
    'video_get',
    'Lädt ein Video aus dem Vault, extrahiert gleichmäßig verteilte Schlüssel-Frames und gibt sie als Bilder zurück, die Claude direkt analysieren kann. Ideal für Bewegungsanalyse und profile_save motion.',
    {
      filename:   z.string().describe('Dateiname, z.B. "bewegung.webm" – aus video_list bekannt'),
      max_frames: z.number().int().min(1).max(12).optional().default(6).describe('Max. Anzahl Frames (1–12, Standard 6)'),
    },
    async ({ filename, max_frames = 6 }) => {
      // 1. Video herunterladen
      const path = `/api/vault/video/${encodeURIComponent(filename)}`;
      let buffer;
      try {
        buffer = await getRawBytes(path, token);
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: err.message, filename }) }] };
      }

      // 2. In Temp-Datei schreiben
      const tmpDir  = await mkdtemp(join(tmpdir(), 'sys-video-'));
      const inFile  = join(tmpDir, 'input.webm');
      const outPat  = join(tmpDir, 'frame_%03d.jpg');

      await writeFile(inFile, Buffer.from(buffer));

      // 3. Videodauer ermitteln
      let duration = 0;
      try {
        const { stdout } = await execFileAsync('ffprobe', [
          '-v', 'error', '-select_streams', 'v:0',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          inFile,
        ]);
        duration = parseFloat(stdout.trim()) || 0;
      } catch { /* ignorieren */ }

      // 4. Frames gleichmäßig verteilt extrahieren
      // fps=N/duration → genau N Frames über das gesamte Video
      const fps_expr = duration > 0 ? `fps=${max_frames}/${duration}` : `fps=1`;
      try {
        await execFileAsync('ffmpeg', [
          '-i', inFile,
          '-vf', `${fps_expr},scale=480:-1`,
          '-q:v', '3',
          '-frames:v', String(max_frames),
          outPat,
          '-y',
        ]);
      } catch (err) {
        await rm(tmpDir, { recursive: true, force: true });
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'ffmpeg failed: ' + err.message }) }] };
      }

      // 5. Frames einlesen + als MCP image content zurückgeben
      const content = [];
      const totalBytes = Buffer.from(buffer).length;

      content.push({
        type: 'text',
        text: JSON.stringify({
          filename,
          duration_sec: duration ? Math.round(duration) : 'unknown',
          size_kb: Math.round(totalBytes / 1024),
          frames_extracted: max_frames,
          hint: 'Frames analysieren, dann profile_save motion aufrufen.',
        }),
      });

      for (let i = 1; i <= max_frames; i++) {
        const framePath = join(tmpDir, `frame_${String(i).padStart(3, '0')}.jpg`);
        try {
          const frameData = await readFile(framePath);
          content.push({
            type: 'text',
            text: `Frame ${i}/${max_frames} (${duration > 0 ? Math.round((i / max_frames) * duration) + 's' : '?s'}):`,
          });
          content.push({ type: 'image', data: frameData.toString('base64'), mimeType: 'image/jpeg' });
        } catch { break; } // weniger Frames als erwartet → OK
      }

      await rm(tmpDir, { recursive: true, force: true });
      return { content };
    }
  );
}
