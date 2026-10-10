import { TANPURA_SCALES, createTanpuraPlayer, loadTanpuraSample, tanpuraFrequency, tanpuraPlaybackRate } from '/js/tanpura.js';

function pitchError(data, sampleRate, time, duration, expected) {
  const stride = 6;
  const count = Math.floor(duration * sampleRate / stride);
  const samples = Float64Array.from({ length: count }, (_, index) =>
    data[Math.round(time * sampleRate) + index * stride] *
    (0.5 - 0.5 * Math.cos(2 * Math.PI * index / (count - 1))));
  let best = expected;
  let maximum = 0;
  const step = expected / 6000;
  for (let frequency = expected * Math.pow(2, -20 / 1200);
    frequency < expected * Math.pow(2, 20 / 1200); frequency += step) {
    const coefficient = 2 * Math.cos(2 * Math.PI * frequency / (sampleRate / stride));
    let previous = 0;
    let older = 0;
    for (const sample of samples) {
      const next = sample + coefficient * previous - older;
      older = previous;
      previous = next;
    }
    const power = previous * previous + older * older - coefficient * previous * older;
    if (power > maximum) {
      maximum = power;
      best = frequency;
    }
  }
  if (!Number.isFinite(maximum) || maximum <= 0) throw new Error('Rendered tanpura is silent or invalid.');
  return 1200 * Math.log2(best / expected);
}

export async function verifyTanpura() {
  const results = [];
  for (const scale of TANPURA_SCALES) {
    const rate = tanpuraPlaybackRate(scale);
    const context = new OfflineAudioContext(1, Math.ceil(48000 * 16 / rate), 48000);
    const buffer = await loadTanpuraSample(context);
    const player = createTanpuraPlayer(context, buffer);
    player.setScale(scale);
    player.start();
    const output = await context.startRendering();
    const data = output.getChannelData(0);
    const sa = tanpuraFrequency(scale);
    // Include the wrap into a second cycle, as well as both sides of the crossfade.
    const windows = [0.1, 2, 4, 6, 8, 10, 12, 14].map((time) => ({
      sourceTime: time,
      saCents: pitchError(data, 48000, time / rate, 2 / rate, sa),
      paCents: pitchError(data, 48000, time / rate, 2 / rate, sa * 1.5)
    }));
    const maxSaCents = Math.max(...windows.map((entry) => Math.abs(entry.saCents)));
    const maxPaCents = Math.max(...windows.map((entry) => Math.abs(entry.paCents)));
    let energy = 0;
    let peak = 0;
    for (const sample of data) {
      energy += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    const rms = Math.sqrt(energy / data.length);
    if (maxSaCents > 5 || maxPaCents > 6 || peak > 0.95 || rms < 0.05) {
      throw new Error(`${scale} failed calibration: Sa ${maxSaCents.toFixed(2)}c, Pa ${maxPaCents.toFixed(2)}c, peak ${peak}, RMS ${rms}.`);
    }
    results.push({ scale, saHz: sa, maxSaCents, maxPaCents, rms, peak });
  }
  const loudnessSpreadDb = 20 * Math.log10(
    Math.max(...results.map((entry) => entry.rms)) / Math.min(...results.map((entry) => entry.rms)));
  if (loudnessSpreadDb > 1) throw new Error(`Scale loudness spread exceeds 1 dB: ${loudnessSpreadDb}.`);
  return { passed: true, saToleranceCents: 5, paToleranceCents: 6, loudnessSpreadDb, results };
}
