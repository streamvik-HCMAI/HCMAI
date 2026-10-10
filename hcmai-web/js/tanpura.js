export const TANPURA_SCALES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Measured tonic of the bundled, untransposed recording; see assets/tanpura/CREDITS.txt.
export const TANPURA_SOURCE_HZ = 173.72;

export function tanpuraFrequency(scale) {
  const index = TANPURA_SCALES.indexOf(scale);
  if (index < 0) throw new Error(`Unknown tanpura scale: ${scale}.`);
  return 440 * Math.pow(2, (48 + index - 69) / 12);
}

export function tanpuraPlaybackRate(scale) {
  return tanpuraFrequency(scale) / TANPURA_SOURCE_HZ;
}

export async function loadTanpuraSample(context) {
  const response = await fetch('assets/tanpura/loop.wav');
  if (!response.ok) throw new Error(`Tanpura recording could not load (${response.status}).`);
  return context.decodeAudioData(await response.arrayBuffer());
}

export function createTanpuraPlayer(context, buffer) {
  if (!buffer || buffer.duration <= 0) throw new Error('Tanpura recording is empty.');
  const output = context.createGain();
  output.gain.value = 0.8;
  output.connect(context.destination);
  let voice = null;
  let scale = 'C';
  const stop = () => {
    if (!voice) return;
    const previous = voice;
    voice = null;
    previous.gain.gain.cancelAndHoldAtTime(context.currentTime);
    previous.gain.gain.setTargetAtTime(0, context.currentTime, 0.005);
    previous.source.stop(context.currentTime + 0.03);
  };
  const start = () => {
    if (voice) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = tanpuraPlaybackRate(scale);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(1, context.currentTime + 0.03);
    source.connect(gain);
    gain.connect(output);
    voice = { source, gain };
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  };
  return {
    start, stop,
    isPlaying: () => voice !== null,
    setScale(value) {
      const rate = tanpuraPlaybackRate(value);
      scale = value;
      // Retune the existing voice without another download or restarting its pluck cycle.
      if (voice) voice.source.playbackRate.setTargetAtTime(rate, context.currentTime, 0.03);
    }
  };
}
