const output = document.getElementById('notationOutput');
const title = document.getElementById('notationTitle');
const printTitle = document.getElementById('printTitle');
const printNotationContent = document.getElementById('notationPrintContent');
let notation = '';

function renderNotation() {
  output.textContent = notation || 'Tap a Swara to start...';
  printTitle.textContent = title.value.trim() || 'Untitled Bandish';
  printNotationContent.textContent = notation.trim();
}

function getModifierValue(id) {
  return document.querySelector(`#${id} .active`).dataset.value;
}

const swaras = ['S', 'R', 'G', 'M', 'P', 'D', 'N', '-'];
const grid = document.getElementById('swaraGrid');
swaras.forEach((swara) => {
  const button = document.createElement('button');
  button.textContent = swara;
  button.addEventListener('click', () => {
    if (swara === '-') notation += '- ';
    else {
      const pitch = getModifierValue('pitch');
      const octave = getModifierValue('octave');
      notation += swara + (pitch === 'komal' ? '\u0331' : pitch === 'tivra' ? "'" : '') + (octave === 'lower' ? '\u0323' : octave === 'upper' ? '\u0307' : '') + ' ';
    }
    renderNotation();
  });
  grid.appendChild(button);
});

document.querySelectorAll('[data-token]').forEach((button) => button.addEventListener('click', () => { notation += `${button.dataset.token} `; renderNotation(); }));
document.querySelectorAll('.glass-slider').forEach((slider) => slider.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
  slider.querySelectorAll('button').forEach((option) => option.classList.remove('active'));
  button.classList.add('active');
})));
title.addEventListener('input', renderNotation);
document.getElementById('deleteNotation').addEventListener('click', () => { notation = notation.trimEnd().slice(0, -1).trimEnd() + (notation ? ' ' : ''); renderNotation(); });
document.getElementById('clearNotation').addEventListener('click', () => { notation = ''; title.value = ''; renderNotation(); });
document.getElementById('printNotation').addEventListener('click', () => {
  renderNotation();
  window.setTimeout(() => window.print(), 0);
});

renderNotation();