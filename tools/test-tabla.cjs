const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function setup() {
  let tick = null;
  const starts = [];
  const beats = [];
  const buffers = new Map(['ghe', 'ke', 'te', 'na', 'naopen', 'tun'].map((name) => [name, { name }]));
  const gains = [];
  const context = {
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    createGain() {
      const gain = { gain: { value: 0, setTargetAtTime(value) { this.value = value; } }, connect() {}, disconnect() {} };
      gains.push(gain);
      return gain;
    },
    createBufferSource() {
      return {
        buffer: null, stopped: false, connect() {}, disconnect() {},
        start(time) {
          assert.ok(this.buffer, 'Every bol must resolve to an audio buffer');
          starts.push({ time, source: this });
        },
        stop() { this.stopped = true; }
      };
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'hcmai-web', 'js', 'tabla.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const scope = {
    setInterval(callback, delay) { assert.equal(delay, 25); tick = callback; return 1; },
    clearInterval() { tick = null; },
    Float32Array, console
  };
  vm.runInNewContext(`${source}\nglobalThis.api = { TAALS, SAMPLE_NAMES, loadTablaSamples, createTablaPlayer };`, scope);
  const player = scope.api.createTablaPlayer(context, buffers, (beat) => beats.push(beat));
  return {
    ...scope.api, player, context, starts, beats, buffers, gains,
    advance(time) { context.currentTime = time; tick?.(); },
    running: () => tick !== null
  };
}

test('ten taals have correct matra counts, vibhags and khali markers', () => {
  const { TAALS } = setup();
  const expected = {
    teentaal: [16, [4, 4, 4, 4], [9]], ektaal: [12, [2, 2, 2, 2, 2, 2], [3, 7]],
    jhaptaal: [10, [2, 3, 2, 3], [6]], rupak: [7, [3, 2, 2], [1]],
    dadra: [6, [3, 3], [4]], keharwa: [8, [4, 4], [5]],
    deepchandi: [14, [3, 4, 3, 4], [8]], tilwada: [16, [4, 4, 4, 4], [9]],
    dhamar: [14, [5, 2, 3, 4], [8]], chautal: [12, [2, 2, 2, 2, 2, 2], [3, 7]]
  };
  assert.equal(TAALS.length, 10);
  assert.equal(new Set(TAALS.map((taal) => taal.id)).size, 10);
  for (const taal of TAALS) {
    const [length, groups, khali] = expected[taal.id];
    assert.equal(taal.bols.length, length);
    assert.deepEqual(Array.from(taal.groups), groups);
    assert.deepEqual(Array.from(taal.khali), khali);
    assert.equal(taal.groups.reduce((sum, count) => sum + count, 0), length);
  }
});

test('six bundled CC0 recordings are valid non-silent mono 44.1 kHz PCM WAV files', () => {
  const { SAMPLE_NAMES } = setup();
  for (const name of SAMPLE_NAMES) {
    const data = fs.readFileSync(path.join(__dirname, '..', 'hcmai-web', 'assets', 'tabla', `${name}.wav`));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.toString('ascii', 8, 12), 'WAVE');
    assert.equal(data.readUInt32LE(4), data.length - 8);
    assert.equal(data.readUInt16LE(20), 1);
    assert.equal(data.readUInt16LE(22), 1);
    assert.equal(data.readUInt32LE(24), 44100);
    assert.equal(data.readUInt16LE(34), 16);
    assert.equal(data.readUInt32LE(40), data.length - 44);
    let peak = 0;
    for (let offset = 44; offset < data.length; offset += 2) peak = Math.max(peak, Math.abs(data.readInt16LE(offset)));
    assert.ok(peak > 3000);
  }
});

const voiceCount = (bol) => bol === '-' ? 0 : ['Dha', 'Dhin', 'Dhi'].includes(bol) ? 2 : 1;
const uniqueTimes = (starts) => [...new Set(starts.map(({ time }) => Number(time.toFixed(8))))];

test('every taal plays all its bols and repeats exactly at the next sam', () => {
  for (const bpm of [30, 96, 240]) {
    for (const taal of setup().TAALS) {
      const { player, advance, beats, starts } = setup();
      player.setTaal(taal.id);
      player.setTempo(bpm);
      player.start();
      const duration = 60 / bpm;
      for (let beat = 0; beat <= taal.bols.length; beat++) advance(0.030001 + beat * duration);
      const played = beats.filter((beat) => beat !== null);
      assert.deepEqual(played, [...taal.bols.keys(), 0], `${taal.id} at ${bpm} BPM`);
      const strokes = taal.bols.flatMap((bol) => bol.split(' ')).reduce((count, bol) => count + voiceCount(bol), 0);
      assert.equal(starts.length, strokes + voiceCount(taal.bols[0]));
      assert.ok(Math.abs(starts.at(-1).time - (0.03 + taal.bols.length * duration)) < 1e-8);
      player.stop();
    }
  }
});

test('compound bols subdivide a matra evenly and rests remain silent', () => {
  const { player, starts, advance } = setup();
  player.setTaal('ektaal');
  player.setTempo(60);
  player.start();
  advance(1.03);
  advance(2.03);
  advance(3.03);
  assert.deepEqual(uniqueTimes(starts).slice(2, 8), [2.03, 2.53, 3.03, 3.28, 3.53, 3.78]);
  player.setTaal('deepchandi');
  const before = starts.length;
  advance(4.03);
  advance(5.03);
  assert.equal(starts.length, before + 2, 'Second beat layers Dhin, third beat is a rest');
  player.stop();
});

test('tempo changes preserve the cycle and use the new beat interval without drift', () => {
  const { player, starts, advance } = setup();
  player.setTempo(60);
  player.start();
  advance(0.03);
  player.setTempo(120);
  for (let i = 0; i < 1000; i++) advance(1.030001 + i * 0.5);
  assert.equal(uniqueTimes(starts).length, 1001);
  assert.ok(Math.abs(starts.at(-1).time - 500.53) < 1e-8);
  player.stop();
});

test('changing taal restarts at sam; stopping cancels every voice and clears scheduling', () => {
  const { player, advance, beats, starts, running } = setup();
  player.start();
  advance(0.655);
  const oldVoices = starts.map((entry) => entry.source);
  player.setTaal('rupak');
  assert.ok(oldVoices.every((source) => source.stopped));
  advance(0.685001);
  assert.equal(beats.at(-1), 0);
  player.stop();
  assert.ok(starts.every(({ source }) => source.stopped));
  assert.equal(running(), false);
  assert.equal(beats.at(-1), null);
  const count = starts.length;
  advance(100);
  assert.equal(starts.length, count);
});

test('a stalled scheduler skips overdue beats without an audible catch-up burst', () => {
  const { player, starts, advance } = setup();
  player.setTempo(60);
  player.start();
  advance(20.03);
  assert.equal(uniqueTimes(starts).length, 2);
  assert.ok(starts.at(-1).time >= 20.03 - 1e-8);
  player.stop();
});

test('tempo, volume and taal reject invalid values, and volume applies to the mix', () => {
  const { player, gains } = setup();
  for (const value of [29, 241, NaN, Infinity]) assert.throws(() => player.setTempo(value), /30 and 240/);
  for (const value of [-1, 1.1, NaN]) assert.throws(() => player.setVolume(value), /0 and 1/);
  assert.throws(() => player.setTaal('missing'), /Unknown/);
  player.setVolume(0);
  assert.equal(gains[0].gain.value, 0);
  player.setVolume(1);
  assert.equal(gains[0].gain.value, 1);
});

test('Dha layers recorded na and ghe, all samples stay at their recorded pitch', () => {
  const { player, starts } = setup();
  player.start();
  assert.deepEqual(starts.map(({ source }) => source.buffer.name), ['na', 'ghe']);
  assert.equal(starts[0].time, starts[1].time);
  assert.ok(starts.every(({ source }) => !Object.hasOwn(source, 'playbackRate')));
  player.stop();
});

test('missing recordings are rejected, not replaced by synthesized audio', () => {
  const { context, buffers, createTablaPlayer } = setup();
  buffers.delete('na');
  assert.throws(() => createTablaPlayer(context, buffers, () => {}), /Missing tabla recording: na/);
});

test('sample loading decodes all local recordings and reports download or decoding errors', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'hcmai-web', 'js', 'tabla.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const urls = [];
  let failure = false;
  const scope = {
    fetch: async (url) => {
      urls.push(url);
      return { ok: !failure, status: failure ? 404 : 200, arrayBuffer: async () => new ArrayBuffer(8) };
    }
  };
  vm.runInNewContext(`${source}\nglobalThis.load = loadTablaSamples;`, scope);
  const buffers = await scope.load({ decodeAudioData: async () => ({ recorded: true }) });
  assert.equal(buffers.size, 6);
  assert.ok(urls.every((url) => /^assets\/tabla\/\w+\.wav$/.test(url)));
  failure = true;
  await assert.rejects(scope.load({ decodeAudioData: async () => ({}) }), /could not load \(404\)/);
  failure = false;
  await assert.rejects(scope.load({ decodeAudioData: async () => { throw new Error('Invalid recording'); } }), /Invalid recording/);
});
