const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..', 'hcmai-web');
function setup(fetch) {
  const sources = [];
  const gains = [];
  const context = {
    currentTime: 2, destination: {},
    createGain() {
      const gain = {
        gain: {
          value: 0,
          setValueAtTime(value) { this.value = value; },
          linearRampToValueAtTime(value) { this.value = value; },
          cancelAndHoldAtTime() {},
          setTargetAtTime(value) { this.value = value; }
        },
        connect() {}, disconnect() { this.disconnected = true; }
      };
      gains.push(gain);
      return gain;
    },
    createBufferSource() {
      const source = {
        playbackRate: { value: 1, setTargetAtTime(value) { this.value = value; } },
        connect() {}, disconnect() { this.disconnected = true; },
        start() { this.started = true; },
        stop(time) { this.stoppedAt = time; }
      };
      sources.push(source);
      return source;
    },
    decodeAudioData: async (bytes) => ({ duration: 14, bytes })
  };
  const scope = { fetch };
  const source = fs.readFileSync(path.join(root, 'js', 'tanpura.js'), 'utf8').replace(/^export /gm, '');
  vm.runInNewContext(`${source}
globalThis.api = { TANPURA_SCALES, TANPURA_SOURCE_HZ, tanpuraFrequency, tanpuraPlaybackRate, createTanpuraPlayer, loadTanpuraSample };`, scope);
  return { ...scope.api, context, sources, gains };
}

test('all twelve scales use an explicit C3-B3 tonic at A4=440 with calibrated rates', () => {
  const { TANPURA_SCALES, TANPURA_SOURCE_HZ, tanpuraFrequency, tanpuraPlaybackRate } = setup();
  assert.equal(TANPURA_SCALES.length, 12);
  const expected = [130.8128, 138.5913, 146.8324, 155.5635, 164.8138, 174.6141,
    184.9972, 195.9977, 207.6523, 220, 233.0819, 246.9417];
  TANPURA_SCALES.forEach((scale, index) => {
    assert.ok(Math.abs(tanpuraFrequency(scale) - expected[index]) < 0.0001);
    assert.ok(Math.abs(tanpuraPlaybackRate(scale) * TANPURA_SOURCE_HZ - expected[index]) < 0.0001);
  });
  assert.throws(() => tanpuraFrequency('invalid'), /Unknown tanpura scale/);
});

test('recorded source loops natively, retunes without restarting, and releases stopped voices', () => {
  const { context, sources, gains, createTanpuraPlayer, tanpuraPlaybackRate } = setup();
  const buffer = { duration: 14 };
  const player = createTanpuraPlayer(context, buffer);
  player.setScale('G#');
  assert.equal(sources.length, 0, 'Selecting a scale must not start playback');
  player.start();
  player.start();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].buffer, buffer);
  assert.equal(sources[0].loop, true);
  assert.equal(sources[0].playbackRate.value, tanpuraPlaybackRate('G#'));
  player.setScale('A');
  assert.equal(sources.length, 1);
  assert.equal(sources[0].playbackRate.value, tanpuraPlaybackRate('A'));
  assert.throws(() => player.setScale('missing'), /Unknown/);
  assert.equal(player.isPlaying(), true);
  player.stop();
  player.stop();
  assert.equal(player.isPlaying(), false);
  assert.equal(sources[0].stoppedAt, 2.03);
  sources[0].onended();
  assert.equal(sources[0].disconnected, true);
  assert.equal(gains[1].disconnected, true);
  player.start();
  assert.equal(sources.length, 2);
  assert.equal(sources[1].playbackRate.value, tanpuraPlaybackRate('A'));
  assert.throws(() => createTanpuraPlayer(context, { duration: 0 }), /empty/);
});

test('one recording loads for every scale, with explicit HTTP and decoding errors', async () => {
  const urls = [];
  let response = { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  const { loadTanpuraSample, context } = setup(async (url) => { urls.push(url); return response; });
  assert.equal((await loadTanpuraSample(context)).duration, 14);
  assert.deepEqual(urls, ['assets/tanpura/loop.wav']);
  response = { ok: false, status: 404 };
  await assert.rejects(loadTanpuraSample(context), /Tanpura recording could not load \(404\)/);
  response = { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  context.decodeAudioData = async () => { throw new Error('Invalid WAV'); };
  await assert.rejects(loadTanpuraSample(context), /Invalid WAV/);
});

test('bundled mono PCM loop has normalized headroom and no abnormal wrap discontinuity', () => {
  const wav = fs.readFileSync(path.join(root, 'assets', 'tanpura', 'loop.wav'));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 14 * 24000 * 2);
  const samples = Array.from({ length: (wav.length - 44) / 2 }, (_, i) => wav.readInt16LE(44 + i * 2) / 32768);
  let peak = 0, energy = 0, stepPeak = 0;
  samples.forEach((sample, index) => {
    peak = Math.max(peak, Math.abs(sample));
    energy += sample * sample;
    if (index > 0) stepPeak = Math.max(stepPeak, Math.abs(sample - samples[index - 1]));
  });
  assert.ok(peak > 0.79 && peak <= 0.801);
  assert.ok(Math.sqrt(energy / samples.length) > 0.15);
  assert.ok(Math.abs(samples[0] - samples.at(-1)) < stepPeak, 'Loop wrap must not introduce a larger jump than normal sample steps');
});

function setupControls(fetch) {
  const api = setup(fetch);
  const listeners = new Map();
  const errors = [];
  function element(text = '') {
    return {
      textContent: text, value: '', checked: true, disabled: false,
      classList: { toggle() {}, add() {} }, attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute() {},
      append() {}, replaceChildren() {},
      addEventListener(name, callback) { this[name] = callback; },
      options: [], add(option) { this.options.push(option); if (!this.value) this.value = option.value; },
      get selectedOptions() { return this.options.filter((option) => option.value === this.value); }
    };
  }
  const ids = ['tablaTaal', 'tablaLaya', 'tablaTempo', 'tablaTempoValue', 'tablaVolume', 'playToggle',
    'playIcon', 'accompanimentStatus', 'tanpuraEnabled', 'tablaEnabled', 'selectedScaleLabel',
    'tanpuraTuning', 'tablaStructure', 'tablaCycle'];
  const elements = Object.fromEntries(ids.map((id) => [id, element()]));
  elements.selectedScaleLabel.textContent = 'C';
  elements.tablaTempo.value = '96';
  elements.tablaVolume.value = '65';
  const buttons = api.TANPURA_SCALES.map((scale) => element(scale));
  const { context } = api;
  context.state = 'suspended';
  context.resume = async () => { context.state = 'running'; };
  context.addEventListener = (name, callback) => listeners.set(name, callback);
  const document = {
    hidden: false,
    getElementById: (id) => elements[id],
    querySelectorAll: () => buttons,
    createElement: () => element(),
    addEventListener: (name, callback) => listeners.set(name, callback)
  };
  const scope = {
    ...api, fetch, document,
    window: {
      AudioContext: function () { return context; },
      addEventListener: (name, callback) => listeners.set(name, callback)
    },
    Option: function (text, value) { this.textContent = text; this.value = value; },
    console: { error: (...args) => errors.push(args) },
    setInterval: () => 1, clearInterval() {}
  };
  const source = fs.readFileSync(path.join(root, 'js', 'tabla.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInNewContext(source, scope);
  return { ...api, elements, buttons, listeners, document, errors };
}
const successfulFetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('shared controls play, retune, switch instruments, stop both, and handle interruption', async () => {
  const ui = setupControls(successfulFetch);
  await ui.elements.playToggle.click();
  const drone = ui.sources.find((source) => source.loop);
  assert.ok(drone.started);
  assert.match(ui.elements.accompanimentStatus.textContent, /Playing Tanpura \+ Tabla/);
  ui.buttons[8].click();
  await flush();
  assert.equal(ui.sources.filter((source) => source.loop).length, 1);
  assert.equal(drone.playbackRate.value, ui.tanpuraPlaybackRate('G#'));
  assert.match(ui.elements.tanpuraTuning.textContent, /G#3 \(207.65 Hz\)/);
  ui.elements.tanpuraEnabled.checked = false;
  ui.elements.tanpuraEnabled.change();
  await flush();
  assert.ok(drone.stoppedAt);
  assert.match(ui.elements.accompanimentStatus.textContent, /Playing Tabla/);
  ui.elements.tablaEnabled.checked = false;
  ui.elements.tablaEnabled.change();
  assert.equal(ui.elements.playToggle.disabled, true);
  assert.equal(ui.elements.playToggle.attributes['aria-pressed'], 'false');
  ui.elements.tanpuraEnabled.checked = true;
  ui.elements.tanpuraEnabled.change();
  await ui.elements.playToggle.click();
  assert.match(ui.elements.accompanimentStatus.textContent, /Playing Tanpura\./);
  ui.context.state = 'suspended';
  ui.listeners.get('statechange')();
  assert.match(ui.elements.accompanimentStatus.textContent, /interrupted/);
  assert.equal(ui.elements.playToggle.attributes['aria-pressed'], 'false');
});

test('pausing during download prevents late sound and later Play reuses the prepared source', async () => {
  let resolveFetch;
  const pending = new Promise((resolve) => { resolveFetch = resolve; });
  const ui = setupControls(() => pending);
  ui.elements.tablaEnabled.checked = false;
  const starting = ui.elements.playToggle.click();
  assert.equal(ui.elements.playToggle.attributes['aria-pressed'], 'true');
  ui.elements.playToggle.click();
  resolveFetch(await successfulFetch());
  await starting;
  assert.equal(ui.sources.length, 0);
  assert.equal(ui.elements.playToggle.attributes['aria-pressed'], 'false');
  await ui.elements.playToggle.click();
  assert.equal(ui.sources.length, 1);
  ui.document.hidden = true;
  ui.listeners.get('visibilitychange')();
  assert.ok(ui.sources[0].stoppedAt);
});

test('failed tanpura downloads stop both instruments, log an error, and can be retried', async () => {
  let failure = true;
  const ui = setupControls(async (url) => url.includes('tanpura') && failure
    ? { ok: false, status: 503 } : successfulFetch());
  await ui.elements.playToggle.click();
  assert.equal(ui.elements.playToggle.attributes['aria-pressed'], 'false');
  assert.match(ui.elements.accompanimentStatus.textContent, /503.*retry/);
  assert.equal(ui.errors.length, 1);
  assert.equal(ui.sources.length, 0);
  failure = false;
  await ui.elements.playToggle.click();
  assert.ok(ui.sources.some((source) => source.loop && source.started));
  assert.match(ui.elements.accompanimentStatus.textContent, /Playing Tanpura \+ Tabla/);
  ui.listeners.get('pagehide')();
});
