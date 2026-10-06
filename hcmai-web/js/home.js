import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { auth } from './auth.js';
import { fetchAccessibleRaags } from './raag-data.js';

const localTime = document.getElementById('homeLocalTime');
const timeZone = document.getElementById('homeTimeZone');
const praharLabel = document.getElementById('homePraharLabel');
const status = document.getElementById('homePraharStatus');
const recommendationList = document.getElementById('homePraharRecommendations');
const ordinalNames = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

let accessibleRaags = [];
let isAdminViewer = false;

function getPraharContext(date = new Date()) {
  const localMinutes = date.getHours() * 60 + date.getMinutes();
  const minutesSinceSix = (localMinutes - 360 + 1440) % 1440;
  const number = Math.floor(minutesSinceSix / 180) + 1;
  const startMinutes = (360 + (number - 1) * 180) % 1440;
  const endMinutes = (startMinutes + 180) % 1440;
  const formatClock = (minutes) => {
    const clock = new Date(date);
    clock.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(clock);
  };
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local timezone';
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
  return { number, label: `${ordinalNames[number - 1]} Prahar`, range: `${formatClock(startMinutes)}–${formatClock(endMinutes)}`, zone, time };
}

function getRaagPrahars(raag) {
  const fieldNumber = Number(raag.prahar);
  const numbers = new Set();
  if (Number.isInteger(fieldNumber) && fieldNumber >= 1 && fieldNumber <= 8) numbers.add(fieldNumber);
  const timeText = String(raag.timeOfDay || '').toLowerCase();
  for (const match of timeText.matchAll(/prahar[- ]?([1-8])/g)) numbers.add(Number(match[1]));
  return { numbers, allTimes: /sarva[- ]kaaleen|all[- ]day|all times|universal/.test(timeText) };
}

function openRaagHref(raag) {
  return `raag-explorer.html?search=${encodeURIComponent(raag.name || '')}`;
}

function renderRecommendations() {
  const context = getPraharContext();
  localTime.textContent = context.time;
  timeZone.textContent = context.zone;
  praharLabel.textContent = `${context.label} · ${context.range}`;
  recommendationList.replaceChildren();

  const matches = accessibleRaags.filter((raag) => {
    const match = getRaagPrahars(raag);
    return match.numbers.has(context.number) || match.allTimes;
  });

  if (!matches.length) {
    status.textContent = isAdminViewer
      ? `No imported Raag records match ${context.label}; missing or seasonal time labels are not guessed.`
      : `No reviewed Raags are published for ${context.label} yet.`;
    return;
  }

  status.textContent = `${matches.length} Raag recommendations for ${context.label} in ${context.zone}${isAdminViewer ? '; source candidates are marked below.' : '.'}`;
  matches.forEach((raag) => {
    const item = document.createElement('article');
    item.className = 'mini-card';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = raag.name || 'Unnamed source record';
    const source = document.createElement('span');
    const timeText = String(raag.timeOfDay || '');
    source.textContent = [
      raag.thaat ? `${raag.thaat} thaat` : '',
      timeText || `${context.label} (local-time estimate)`,
      raag.isPublished === true ? 'Published' : `Source candidate · ${raag.sourceName || 'Unverified source'}`
    ].filter(Boolean).join(' · ');
    copy.append(name, source);
    const link = document.createElement('a');
    link.className = 'chip accent';
    link.href = openRaagHref(raag);
    link.textContent = 'Explore';
    item.append(copy, link);
    recommendationList.appendChild(item);
  });
}

onAuthStateChanged(auth, async (user) => {
  try {
    const result = await fetchAccessibleRaags(user);
    accessibleRaags = result.raags;
    isAdminViewer = result.isAdmin;
    renderRecommendations();
  } catch (error) {
    accessibleRaags = [];
    status.textContent = error.message || 'Time-based Raag recommendations could not be loaded.';
  }
});

window.setInterval(renderRecommendations, 60_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderRecommendations();
});