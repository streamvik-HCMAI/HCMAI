const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Browser decoding avoids requiring a platform-specific MP3 decoder for this one-time build.
const root = path.join(__dirname, '..', 'hcmai-web');
const source = path.join(root, 'assets', 'tanpura_F.mp3');
const output = path.join(root, 'assets', 'tanpura', 'loop.wav');
const html = `<!doctype html><title>Build recorded tanpura loop</title>
<p id="status">Preparing existing recording...</p><script>
(async () => {
  const context = new OfflineAudioContext(1, 1, 24000);
  const decoded = await context.decodeAudioData(await (await fetch('/source')).arrayBuffer());
  const samples = decoded.getChannelData(0);
  const rate = 24000, start = 32, end = 48, fade = 2;
  const frames = (end - start - fade) * rate;
  const pcm = new Float32Array(frames);
  let peak = 0, energy = 0;
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    let sample = samples[Math.round((start + t) * decoded.sampleRate)];
    if (t < fade) {
      const tail = samples[Math.round((end - fade + t) * decoded.sampleRate)];
      sample = tail * (1 - t / fade) + sample * t / fade;
    }
    pcm[i] = sample;
    peak = Math.max(peak, Math.abs(sample));
    energy += sample * sample;
  }
  if (!Number.isFinite(peak) || peak === 0) throw new Error('Source recording is silent or invalid.');
  const level = 0.8 / peak;
  const wav = new ArrayBuffer(44 + frames * 2), view = new DataView(wav);
  const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, wav.byteLength - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) view.setInt16(44 + i * 2, Math.round(pcm[i] * level * 32767), true);
  const response = await fetch('/output', { method: 'POST', body: wav });
  if (!response.ok) throw new Error(await response.text());
  document.getElementById('status').textContent = 'Saved calibrated source loop: ' +
    frames / rate + ' seconds, peak 0.8, RMS ' + (Math.sqrt(energy / frames) * level).toFixed(4);
})().catch(error => {
  console.error(error);
  document.getElementById('status').textContent = error.message;
});
</script>`;

const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(html);
  } else if (request.method === 'GET' && request.url === '/verify') {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><title>Tanpura tuning verification</title><pre id="status">Checking all 12 scales...</pre>
<script type="module">
import { verifyTanpura } from '/verify-tanpura.mjs';
try {
  const result = await verifyTanpura();
  window.tanpuraVerification = result;
  document.getElementById('status').textContent = JSON.stringify(result, null, 2);
} catch (error) {
  console.error(error);
  document.getElementById('status').textContent = 'FAILED: ' + error.message;
}
</script>`);
  } else if (request.method === 'GET' && [
    '/js/tanpura.js', '/verify-tanpura.mjs', '/assets/tanpura/loop.wav'
  ].includes(request.url)) {
    const files = {
      '/js/tanpura.js': path.join(root, 'js', 'tanpura.js'),
      '/verify-tanpura.mjs': path.join(__dirname, 'verify-tanpura.mjs'),
      '/assets/tanpura/loop.wav': output
    };
    response.setHeader('Content-Type', request.url.endsWith('.wav') ? 'audio/wav' : 'text/javascript');
    fs.createReadStream(files[request.url]).pipe(response);
  } else if (request.method === 'GET' && request.url === '/source') {
    response.setHeader('Content-Type', 'audio/mpeg');
    fs.createReadStream(source).pipe(response);
  } else if (request.method === 'POST' && request.url === '/output') {
    if (request.headers.origin !== 'http://127.0.0.1:8766') {
      response.writeHead(403).end('Unexpected origin.');
      return;
    }
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1000000) request.destroy();
      else chunks.push(chunk);
    });
    request.on('end', () => {
      const data = Buffer.concat(chunks);
      if (data.length !== 672044 || data.toString('ascii', 0, 4) !== 'RIFF') {
        response.writeHead(400).end('Unexpected WAV output.');
        return;
      }
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, data);
      console.log('Saved:', output);
      console.log('Source SHA-256:', crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'));
      console.log('Loop SHA-256:', crypto.createHash('sha256').update(data).digest('hex'));
      response.end('Saved.');
    });
  } else {
    response.writeHead(404).end('Not found.');
  }
});
server.listen(8766, '127.0.0.1', () => console.log('Open http://127.0.0.1:8766 to rebuild the loop; stop this server afterwards.'));
