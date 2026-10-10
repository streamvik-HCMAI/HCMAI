import { createTanpuraPlayer, loadTanpuraSample, tanpuraFrequency } from './tanpura.js?v=20261010-calibrated-tanpura';

export const TAALS = [
  { id: 'teentaal', name: 'Teentaal', groups: [4, 4, 4, 4], khali: [9], bols: ['Dha', 'Dhin', 'Dhin', 'Dha', 'Dha', 'Dhin', 'Dhin', 'Dha', 'Dha', 'Tin', 'Tin', 'Ta', 'Ta', 'Dhin', 'Dhin', 'Dha'] },
  { id: 'ektaal', name: 'Ektaal', groups: [2, 2, 2, 2, 2, 2], khali: [3, 7], bols: ['Dhin', 'Dhin', 'Dha Ge', 'Ti Ra Ki Ta', 'Tu', 'Na', 'Kat', 'Ta', 'Dha Ge', 'Ti Ra Ki Ta', 'Dhin', 'Na'] },
  { id: 'jhaptaal', name: 'Jhaptaal', groups: [2, 3, 2, 3], khali: [6], bols: ['Dhin', 'Na', 'Dhin', 'Dhin', 'Na', 'Tin', 'Na', 'Dhin', 'Dhin', 'Na'] },
  { id: 'rupak', name: 'Rupak', groups: [3, 2, 2], khali: [1], bols: ['Tin', 'Tin', 'Na', 'Dhin', 'Na', 'Dhin', 'Na'] },
  { id: 'dadra', name: 'Dadra', groups: [3, 3], khali: [4], bols: ['Dha', 'Dhi', 'Na', 'Dha', 'Tu', 'Na'] },
  { id: 'keharwa', name: 'Keharwa', groups: [4, 4], khali: [5], bols: ['Dha', 'Ge', 'Na', 'Ti', 'Na', 'Ka', 'Dhi', 'Na'] },
  { id: 'deepchandi', name: 'Deepchandi', groups: [3, 4, 3, 4], khali: [8], bols: ['Dha', 'Dhin', '-', 'Dha', 'Dha', 'Tin', '-', 'Ta', 'Tin', '-', 'Dha', 'Dha', 'Dhin', '-'] },
  { id: 'tilwada', name: 'Tilwada', groups: [4, 4, 4, 4], khali: [9], bols: ['Dha', 'Ti Ra Ki Ta', 'Dhin', 'Dhin', 'Dha', 'Dha', 'Tin', 'Tin', 'Ta', 'Ti Ra Ki Ta', 'Dhin', 'Dhin', 'Dha', 'Dha', 'Dhin', 'Dhin'] },
  { id: 'dhamar', name: 'Dhamar', groups: [5, 2, 3, 4], khali: [8], bols: ['Ka', 'Dhi', 'Ta', 'Dhi', 'Ta', 'Dha', '-', 'Ga', 'Ti', 'Ta', 'Ti', 'Ta', 'Ta', '-'], note: 'Traditionally associated with pakhawaj; this is a recorded tabla-kit adaptation.' },
  { id: 'chautal', name: 'Chautal', groups: [2, 2, 2, 2, 2, 2], khali: [3, 7], bols: ['Dha', 'Dha', 'Dhin', 'Ta', 'Ki Ta', 'Dha', 'Dhin', 'Ta', 'Ti Ta', 'Ka Ta', 'Ga Di', 'Ge Na'], note: 'Traditionally associated with pakhawaj; this is a recorded tabla-kit adaptation.' }
];

export const SAMPLE_NAMES = ['ghe', 'ke', 'te', 'na', 'naopen', 'tun'];
const STROKES = {
  Na: ['na'], Tin: ['naopen'], Tu: ['tun'],
  Ta: ['te'], Ti: ['te'], Ra: ['te'],
  Ki: ['ke'], Ka: ['ke'], Kat: ['ke'],
  Ge: ['ghe'], Ga: ['ghe'], Di: ['naopen'],
  Dha: ['na', 'ghe'], Dhin: ['naopen', 'ghe'], Dhi: ['naopen', 'ghe']
};

export async function loadTablaSamples(context) {
  const entries = await Promise.all(SAMPLE_NAMES.map(async (name) => {
    const response = await fetch(`assets/tabla/${name}.wav`);
    if (!response.ok) throw new Error(`Tabla recording ${name} could not load (${response.status}).`);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    return [name, buffer];
  }));
  return new Map(entries);
}

export function createTablaPlayer(context, buffers, onBeat) {
  for (const name of SAMPLE_NAMES) {
    if (!buffers.has(name)) throw new Error(`Missing tabla recording: ${name}.`);
  }
  const output = context.createGain();
  output.gain.value = 0.65;
  output.connect(context.destination);
  const voices = new Set();
  let taal = TAALS[0];
  let tempo = 96;
  let timer = null;
  let nextBeat = 0;
  let nextTime = 0;
  let visuals = [];

  const stop = () => {
    clearInterval(timer);
    timer = null;
    visuals = [];
    for (const voice of voices) {
      voice.source.stop();
      voice.source.disconnect();
      voice.gain.disconnect();
    }
    voices.clear();
    onBeat(null);
  };

  const schedule = () => {
    const now = context.currentTime;
    const duration = 60 / tempo;
    // Skip missed beats after a delayed timer instead of playing a catch-up burst.
    if (nextTime < now - 0.05) {
      const skipped = Math.ceil((now - nextTime) / duration);
      nextBeat = (nextBeat + skipped) % taal.bols.length;
      nextTime += skipped * duration;
    }
    while (nextTime < now + 0.1) {
      const beat = nextBeat;
      const strokes = taal.bols[beat].split(' ');
      strokes.forEach((bol, index) => {
        if (bol === '-') return;
        const samples = STROKES[bol];
        samples.forEach((name) => {
          const source = context.createBufferSource();
          source.buffer = buffers.get(name);
          const gain = context.createGain();
          gain.gain.value = (beat === 0 ? 1 : 0.8) / Math.sqrt(samples.length);
          source.connect(gain);
          gain.connect(output);
          const voice = { source, gain };
          voices.add(voice);
          source.onended = () => {
            source.disconnect();
            gain.disconnect();
            voices.delete(voice);
          };
          source.start(nextTime + index * duration / strokes.length);
        });
      });
      visuals.push({ beat, time: nextTime });
      nextBeat = (nextBeat + 1) % taal.bols.length;
      nextTime += duration;
    }
    let current = null;
    while (visuals.length && visuals[0].time <= now) current = visuals.shift().beat;
    if (current !== null) onBeat(current);
  };

  const start = () => {
    stop();
    nextBeat = 0;
    nextTime = context.currentTime + 0.03;
    schedule();
    timer = setInterval(schedule, 25);
  };

  return {
    start, stop,
    isPlaying: () => timer !== null,
    setTaal(id) {
      const selected = TAALS.find((entry) => entry.id === id);
      if (!selected) throw new Error('Unknown tabla taal.');
      const playing = timer !== null;
      stop();
      taal = selected;
      if (playing) start();
    },
    setTempo(value) {
      if (!Number.isFinite(value) || value < 30 || value > 240) throw new Error('Tabla tempo must be between 30 and 240 BPM.');
      tempo = value;
    },
    setVolume(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Tabla volume must be between 0 and 1.');
      output.gain.setTargetAtTime(value, context.currentTime, 0.015);
    }
  };
}

function initializeTabla() {
  const select = document.getElementById('tablaTaal');
  if (!select) return;
  const laya = document.getElementById('tablaLaya');
  const tempo = document.getElementById('tablaTempo');
  const tempoValue = document.getElementById('tablaTempoValue');
  const volume = document.getElementById('tablaVolume');
  const toggle = document.getElementById('playToggle');
  const icon = document.getElementById('playIcon');
  const status = document.getElementById('accompanimentStatus');
  const tanpuraEnabled = document.getElementById('tanpuraEnabled');
  const tablaEnabled = document.getElementById('tablaEnabled');
  const scaleLabel = document.getElementById('selectedScaleLabel');
  const tuningLabel = document.getElementById('tanpuraTuning');
  const scaleButtons = document.querySelectorAll('.scale-btn');
  const structure = document.getElementById('tablaStructure');
  const cycle = document.getElementById('tablaCycle');
  let context = null;
  let player = null;
  let preparation = null;
  let tanpura = null;
  let dronePreparation = null;
  let playing = false;
  let request = 0;
  let beatElements = [];

  const showBeat = (beat) => {
    beatElements.forEach((element, index) => {
      element.classList.toggle('active', index === beat);
      if (index === beat) element.setAttribute('aria-current', 'true');
      else element.removeAttribute('aria-current');
    });
  };
  const updateButton = () => {
    toggle.disabled = !tanpuraEnabled.checked && !tablaEnabled.checked;
    toggle.setAttribute('aria-label', playing ? 'Pause accompaniment' : 'Play accompaniment');
    toggle.setAttribute('aria-pressed', String(playing));
    icon.textContent = playing ? '\u275a\u275a' : '\u25b6';
  };
  const stop = (message = 'Paused. Play restarts tabla from sam.') => {
    request++;
    player?.stop();
    tanpura?.stop();
    playing = false;
    updateButton();
    status.textContent = message;
  };
  const prepareContext = () => {
    if (!context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('This browser does not support recorded accompaniment playback.');
      context = new AudioContextClass();
      context.addEventListener('statechange', () => {
        if (playing && context.state !== 'running') {
          stop('Accompaniment audio was interrupted. Select Play accompaniment to restart.');
        }
      });
    }
    return context;
  };
  const prepareTabla = () => {
    if (!preparation) {
      preparation = loadTablaSamples(context).then((buffers) => {
        player = createTablaPlayer(context, buffers, showBeat);
        return player;
      }).catch((error) => {
        preparation = null;
        throw error;
      });
    }
    return preparation;
  };
  const prepareTanpura = () => {
    if (!dronePreparation) {
      dronePreparation = loadTanpuraSample(context).then((buffer) => {
        tanpura = createTanpuraPlayer(context, buffer);
        return tanpura;
      }).catch((error) => {
        dronePreparation = null;
        throw error;
      });
    }
    return dronePreparation;
  };
  const synchronize = async () => {
    if (!tanpuraEnabled.checked && !tablaEnabled.checked) {
      stop('Both instruments are off. Switch on Tanpura or Tabla to play.');
      return;
    }
    const currentRequest = ++request;
    playing = true;
    updateButton();
    status.textContent = 'Starting selected instruments...';
    try {
      // Resume the shared audio context in the click gesture, before downloads.
      const resumed = prepareContext().resume();
      if (!tanpuraEnabled.checked) tanpura?.stop();
      if (!tablaEnabled.checked) player?.stop();
      await Promise.all([
        resumed,
        tanpuraEnabled.checked ? prepareTanpura() : Promise.resolve(),
        tablaEnabled.checked ? prepareTabla() : Promise.resolve()
      ]);
      if (currentRequest !== request) return;
      if (context.state !== 'running') throw new Error('Accompaniment audio is blocked.');
      if (tanpuraEnabled.checked) {
        tanpura.setScale(scaleLabel.textContent);
        tanpura.start();
      }
      if (tablaEnabled.checked) {
        player.setTempo(Number(tempo.value));
        player.setVolume(Number(volume.value) / 100);
        if (!player.isPlaying()) {
          player.setTaal(select.value);
          player.start();
        }
      }
      const names = [tanpuraEnabled.checked && 'Tanpura', tablaEnabled.checked && 'Tabla'].filter(Boolean);
      status.textContent = `Playing ${names.join(' + ')}${tablaEnabled.checked ? `: ${select.selectedOptions[0].textContent}` : ''}.`;
    } catch (error) {
      if (currentRequest !== request) return;
      console.error('Unable to start accompaniment.', error);
      stop(`${error.message || 'Accompaniment could not start.'} Select Play accompaniment to retry.`);
    }
  };
  const showTaal = () => {
    const taal = TAALS.find((entry) => entry.id === select.value);
    structure.textContent = `${taal.bols.length} matras, grouped ${taal.groups.join(' + ')}. ${taal.note || 'Basic theka; bols can vary by tradition.'}`;
    cycle.replaceChildren();
    const starts = new Set();
    let offset = 0;
    taal.groups.forEach((length) => { starts.add(offset); offset += length; });
    beatElements = taal.bols.map((bol, index) => {
      const element = document.createElement('li');
      element.className = 'tabla-beat';
      if (starts.has(index)) element.classList.add('vibhag-start');
      const marker = index === 0
        ? `X${taal.khali.includes(1) ? ' 0' : ''}`
        : taal.khali.includes(index + 1) ? '0' : starts.has(index) ? 'T' : '';
      const number = document.createElement('small');
      number.textContent = `${index + 1} ${marker}`;
      const text = document.createElement('strong');
      text.textContent = bol;
      element.setAttribute('aria-label', `Beat ${index + 1}, ${bol}${index === 0 ? ', sam' : ''}${taal.khali.includes(index + 1) ? ', khali' : starts.has(index) ? ', taali' : ''}`);
      element.append(number, text);
      cycle.append(element);
      return element;
    });
  };
  TAALS.forEach((taal) => select.add(new Option(`${taal.name} - ${taal.bols.length} beats`, taal.id)));
  showTaal();
  select.addEventListener('change', () => {
    showTaal();
    player?.setTaal(select.value);
    if (playing && tablaEnabled.checked) status.textContent = `Playing ${select.selectedOptions[0].textContent}. Restarted from sam.`;
  });
  const updateTempo = () => {
    const bpm = Number(tempo.value);
    tempoValue.value = String(bpm);
    tempo.setAttribute('aria-valuetext', `${bpm} beats per minute`);
    player?.setTempo(bpm);
    laya.value = ['48', '96', '168'].includes(tempo.value) ? tempo.value : 'custom';
  };
  tempo.addEventListener('input', updateTempo);
  laya.addEventListener('change', () => {
    if (laya.value !== 'custom') {
      tempo.value = laya.value;
      updateTempo();
    }
  });
  volume.addEventListener('input', () => player?.setVolume(Number(volume.value) / 100));
  toggle.addEventListener('click', () => playing ? stop() : synchronize());
  [tanpuraEnabled, tablaEnabled].forEach((input) => {
    input.addEventListener('change', () => {
      if (playing) synchronize();
      else {
        updateButton();
        status.textContent = toggle.disabled
          ? 'Both instruments are off. Switch on Tanpura or Tabla to play.'
          : 'Ready. Select Play accompaniment to begin.';
      }
    });
  });
  const showTuning = () => {
    tuningLabel.textContent = `Sa: ${scaleLabel.textContent}3 (${tanpuraFrequency(scaleLabel.textContent).toFixed(2)} Hz). A4 = 440 Hz.`;
  };
  showTuning();
  scaleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      scaleButtons.forEach((entry) => entry.classList.toggle('active', entry === button));
      const scale = button.textContent.trim();
      scaleLabel.textContent = scale;
      showTuning();
      tanpura?.setScale(scale);
      if (playing) synchronize();
    });
  });
  updateButton();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) stop('Accompaniment paused when you left this tab. Select Play accompaniment to restart.');
  });
  window.addEventListener('pagehide', () => stop());
}

if (typeof document !== 'undefined') initializeTabla();
