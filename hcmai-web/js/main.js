const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');

if (navToggle && mainNav) {
  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    mainNav.classList.toggle('open');
  });
}

const raagSearch = document.getElementById('raagSearch');
const raagCards = document.querySelectorAll('#raagGrid .music-card');

if (raagSearch && raagCards.length) {
  raagSearch.addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();

    raagCards.forEach((card) => {
      const text = card.textContent.toLowerCase();
      const matches = text.includes(query) || query === '';
      card.style.display = matches ? 'block' : 'none';
    });
  });
}

const playToggle = document.getElementById('playToggle');
const playIcon = document.getElementById('playIcon');
const selectedScaleLabel = document.getElementById('selectedScaleLabel');
const scaleButtons = document.querySelectorAll('.scale-btn');
const tanpuraAudio = document.getElementById('tanpuraAudio');

if (playToggle && playIcon && selectedScaleLabel && scaleButtons.length) {
  let isPlaying = false;

  playToggle.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playIcon.textContent = isPlaying ? '❚❚' : '▶';
    playToggle.style.transform = isPlaying ? 'scale(0.96)' : 'scale(1)';

    if (tanpuraAudio) {
      if (isPlaying) tanpuraAudio.play().catch(() => { isPlaying = false; playIcon.textContent = '▶'; });
      else tanpuraAudio.pause();
    }
  });

  scaleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      scaleButtons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');
      selectedScaleLabel.textContent = button.textContent.trim();
      if (tanpuraAudio) {
        const fileName = button.textContent.trim().replace('#', 'sharp');
        tanpuraAudio.src = `assets/tanpura_${fileName}.mp3`;
        tanpuraAudio.playbackRate = ['G#', 'A', 'B'].includes(button.textContent.trim())
          ? Math.pow(2, -1 / 12)
          : 1;
        if (isPlaying) tanpuraAudio.play().catch(() => {});
      }
    });
  });

  if (tanpuraAudio) tanpuraAudio.src = 'assets/tanpura_C.mp3';
}

const timerToggle = document.getElementById('timerToggle');
const timerValue = document.getElementById('timerValue');

if (timerToggle && timerValue) {
  let timerActive = false;
  let totalSeconds = 15 * 60;

  timerToggle.addEventListener('click', () => {
    timerActive = !timerActive;
    timerToggle.textContent = timerActive ? 'Pause' : 'Start';

    if (timerActive) {
      const countDown = setInterval(() => {
        if (!timerActive) {
          clearInterval(countDown);
          return;
        }

        totalSeconds -= 1;
        const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const secs = String(totalSeconds % 60).padStart(2, '0');
        timerValue.textContent = `${mins}:${secs}`;

        if (totalSeconds <= 0) {
          clearInterval(countDown);
          timerActive = false;
          timerToggle.textContent = 'Start';
        }
      }, 1000);
    }
  });
}
