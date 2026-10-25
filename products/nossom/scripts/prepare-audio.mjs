import { mkdir, cp } from 'node:fs/promises';
await mkdir('public/ffmpeg/worker', { recursive: true });
await cp('node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', 'public/ffmpeg/ffmpeg-core.js');
await cp('node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm', 'public/ffmpeg/ffmpeg-core.wasm');
await cp('node_modules/@ffmpeg/ffmpeg/dist/esm', 'public/ffmpeg/worker', { recursive: true });
console.log('Audio engine assets ready.');
await mkdir('public/audio', { recursive: true });
await cp('node_modules/@shiguredo/rnnoise-wasm/dist/rnnoise.js', 'public/audio/rnnoise.js');
await cp('node_modules/@shiguredo/rnnoise-wasm/LICENSE', 'public/audio/RNNOISE-WASM-LICENSE.txt');
await cp('scripts/neural-worker.mjs', 'public/audio/neural-worker.js');
await cp('node_modules/@lofcz/deepfilternet-web/dist/index.js', 'public/audio/deepfilter.js');
await cp('node_modules/@lofcz/deepfilternet-web/dist/df_bg.wasm', 'public/audio/df_bg.wasm');
await cp(
  'node_modules/@lofcz/deepfilternet-web/LICENSE-MIT',
  'public/audio/DEEPFILTER-LICENSE.txt',
);
await cp('scripts/deepfilter-worker.mjs', 'public/audio/deepfilter-worker.js');
await cp('lib/voice-restoration.mjs', 'public/audio/voice-restoration.js');
