const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function setup({ apiReady = true } = {}) {
  class Element {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.dataset = {};
      this.attributes = {};
      this.listeners = {};
      this.textContent = '';
      this.hidden = false;
    }
    get isConnected() { return this === document || !!this.parentElement?.isConnected; }
    append(...children) { children.forEach((child) => this.appendChild(child)); }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    remove() {
      if (!this.parentElement) return;
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
    }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    matches(selector) {
      return selector === '[data-inline-practice]' ? !!this.dataset.inlinePractice
        : selector.startsWith('.') ? this.className === selector.slice(1) : this.tag === selector;
    }
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [
        ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)
      ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    click() { this.listeners.click(); }
  }
  const timeouts = new Map();
  const intervals = new Map();
  const document = new Element('document');
  document.createElement = (tag) => new Element(tag);
  document.head = new Element('head');
  document.append(document.head);
  const players = [];
  let timerId = 0;
  const window = {
    location: { origin: 'https://hcmai-dev.web.app' },
    dispatchEvent() {}, addEventListener() {},
    YT: apiReady ? {
      PlayerState: { PLAYING: 1, ENDED: 0 },
      Player: class {
        constructor(target, options) {
          this.target = target;
          this.events = options.events;
          this.seeks = [];
          this.plays = 0;
          this.time = 603;
          this.destroyed = false;
          players.push(this);
        }
        seekTo(time) { this.seeks.push(time); }
        playVideo() { this.plays++; }
        getPlayerState() { return 1; }
        getCurrentTime() { return this.time; }
        destroy() { this.destroyed = true; this.target.remove(); }
      }
    } : undefined
  };
  const scope = {
    window, document, URL, URLSearchParams, CustomEvent: class {},
    console: { error() {} },
    setTimeout(callback) { const id = ++timerId; timeouts.set(id, callback); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    setInterval(callback) { const id = ++timerId; intervals.set(id, callback); return id; },
    clearInterval(id) { intervals.delete(id); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'hcmai-web', 'js', 'inline-player.js'), 'utf8'), scope);
  const row = new Element('li');
  const button = new Element('button');
  button.textContent = 'Practice loop';
  row.append(button);
  document.append(row);
  window.hcmaiInlinePlayers.attach(row, button, { name: 'Bhimpalasi', videoId: 'OmlD5s8quO4', startSeconds: 603, endSeconds: 703 });
  return {
    window, document, row, button, players, timeouts, intervals,
    panel: () => row.querySelector('.practice-loop-player'),
    tickTimeouts() { for (const [id, callback] of [...timeouts]) { timeouts.delete(id); callback(); } }
  };
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('guest embed uses privacy-enhanced host, explicit referrer, and original loop start', async () => {
  const state = setup();
  state.button.click();
  await flush();
  const frame = state.row.querySelector('iframe');
  const url = new URL(frame.src);
  assert.equal(url.hostname, 'www.youtube-nocookie.com');
  assert.equal(url.searchParams.get('start'), '603');
  assert.equal(url.searchParams.get('origin'), 'https://hcmai-dev.web.app');
  assert.equal(url.searchParams.get('playsinline'), '1');
  assert.equal(frame.referrerPolicy, 'strict-origin-when-cross-origin');
  assert.equal(state.panel().querySelector('a').hidden, true);
  state.window.hcmaiInlinePlayers.close();
});

test('blank player times out, stops polling and exposes inline retry with timestamped fallback', async () => {
  const state = setup();
  state.button.click();
  await flush();
  state.tickTimeouts();
  assert.equal(state.players[0].destroyed, true);
  assert.equal(state.row.querySelector('iframe'), null);
  assert.match(state.panel().querySelector('p').textContent, /did not finish loading/);
  const retry = state.panel().querySelectorAll('button').find((button) => button.textContent === 'Retry video');
  assert.equal(retry.hidden, false);
  const link = state.panel().querySelector('a');
  assert.equal(link.hidden, false);
  assert.equal(link.href, 'https://www.youtube.com/watch?v=OmlD5s8quO4&t=603s');
  retry.click();
  await flush();
  assert.equal(state.players.length, 2);
  assert.equal(state.row.querySelectorAll('.practice-loop-player').length, 1);
  assert.equal(state.panel().querySelector('a').hidden, true);
  state.window.hcmaiInlinePlayers.close();
});

test('ready player cancels timeout, requests playback, exposes second-tap control and loops', async () => {
  const state = setup();
  state.button.click();
  await flush();
  const player = state.players[0];
  player.events.onReady({ target: player });
  assert.equal(state.timeouts.size, 0);
  assert.deepEqual(player.seeks, [603]);
  assert.equal(player.plays, 1);
  const play = state.panel().querySelector('button');
  assert.equal(play.hidden, false);
  play.click();
  assert.equal(player.plays, 2);
  player.events.onStateChange({ data: 1, target: player });
  assert.equal(play.hidden, true);
  player.time = 703;
  [...state.intervals.values()][0]();
  assert.deepEqual(player.seeks, [603, 603]);
  state.window.hcmaiInlinePlayers.close();
  assert.equal(state.intervals.size, 0);
  assert.equal(state.button.textContent, 'Practice loop');
});

test('referrer configuration error is explicit and disposes the player', async () => {
  const state = setup();
  state.button.click();
  await flush();
  const player = state.players[0];
  player.events.onError({ data: 153 });
  assert.equal(player.destroyed, true);
  assert.match(state.panel().querySelector('p').textContent, /required referrer/);
  assert.equal(state.timeouts.size, 0);
  player.events.onReady({ target: player });
  assert.equal(player.plays, 0);
});

test('concurrent callers share the API loader and closing a pending panel prevents late playback', async () => {
  const state = setup({ apiReady: false });
  const a = state.window.hcmaiInlinePlayers.loadYouTubeApi();
  const b = state.window.hcmaiInlinePlayers.loadYouTubeApi();
  assert.equal(a, b);
  assert.equal(state.document.head.children.length, 1);
  state.button.click();
  state.window.hcmaiInlinePlayers.close();
  state.window.onYouTubeIframeAPIReady();
  await Promise.all([a, b]);
  await flush();
  assert.equal(state.panel(), null);
  assert.equal(state.timeouts.size, 0);
});
