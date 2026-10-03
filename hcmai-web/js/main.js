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

const clipVideoForm = document.getElementById('clipVideoForm');
const clipVideoUrl = document.getElementById('youtubeVideoUrl');
const clipLoadButton = document.getElementById('loadClipVideo');
const clipWorkspace = document.getElementById('clipWorkspace');
const clipStatus = document.getElementById('clipLoopStatus');
const clipFallbackLink = document.getElementById('openClipVideoLink');
const clipDurationHint = document.getElementById('clipDurationHint');
const clipStartTime = document.getElementById('clipStartTime');
const clipEndTime = document.getElementById('clipEndTime');
const markClipStart = document.getElementById('markClipStart');
const markClipEnd = document.getElementById('markClipEnd');
const clipCurrentTime = document.getElementById('clipCurrentTime');
const clipLoopToggle = document.getElementById('clipLoopToggle');

if (
  clipVideoForm && clipVideoUrl && clipLoadButton && clipWorkspace && clipStatus && clipFallbackLink && clipDurationHint &&
  clipStartTime && clipEndTime && markClipStart && markClipEnd && clipCurrentTime && clipLoopToggle
) {
  let youtubePlayer = null;
  let youtubeApiPromise = null;
  let playerIsReady = false;
  let loopingClip = false;
  let loopSeekAvailableAt = 0;
  let currentVideoId = '';

  const setClipStatus = (message) => {
    clipStatus.textContent = message;
  };

  const getVideoId = (value) => {
    let url;
    try {
      url = new URL(value.trim());
    } catch {
      return null;
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = null;

    if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0];
    } else if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') {
        videoId = url.searchParams.get('v');
      } else {
        videoId = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
      }
    }

    return videoId && /^[\w-]{11}$/.test(videoId) ? videoId : null;
  };

  const formatClipTime = (seconds) => {
    const wholeSeconds = Math.floor(seconds);
    const hours = Math.floor(wholeSeconds / 3600);
    const minutes = Math.floor(wholeSeconds / 60) % 60;
    const remainder = wholeSeconds % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    return `${Math.floor(wholeSeconds / 60)}:${String(remainder).padStart(2, '0')}`;
  };

  const parseClipTime = (value) => {
    const parts = value.trim().split(':');
    if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;

    const values = parts.map(Number);
    const seconds = values[values.length - 1];
    const minutes = values[values.length - 2];
    if (seconds >= 60 || (values.length === 3 && minutes >= 60)) return null;

    if (values.length === 3) return values[0] * 3600 + minutes * 60 + seconds;
    return minutes * 60 + seconds;
  };

  const updateClipDurationHint = () => {
    const duration = Math.floor(youtubePlayer.getDuration());
    if (!Number.isFinite(duration) || duration <= 0) {
      clipDurationHint.textContent = 'Waiting for YouTube to report the video duration.';
      return;
    }

    clipDurationHint.textContent = `Video duration: ${formatClipTime(duration)}. End time cannot exceed this.`;
    const end = parseClipTime(clipEndTime.value);
    if (end !== null && end > duration) clipEndTime.value = formatClipTime(duration);
  };

  const readClipBounds = () => {
    const start = parseClipTime(clipStartTime.value);
    const end = parseClipTime(clipEndTime.value);
    const duration = youtubePlayer?.getDuration() || 0;

    if (start === null || end === null || start < 0 || end <= start || duration <= 0) {
      return null;
    }
    if (duration && end > duration) return null;
    return { start, end };
  };

  const loadYouTubeApi = () => {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (youtubeApiPromise) return youtubeApiPromise;

    youtubeApiPromise = new Promise((resolve, reject) => {
      window.onYouTubeIframeAPIReady = () => resolve(window.YT);
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('YouTube player could not be loaded.'));
      document.head.append(script);
    });

    return youtubeApiPromise;
  };

  const enableClipControls = () => {
    [clipStartTime, clipEndTime, markClipStart, markClipEnd, clipLoopToggle].forEach((control) => {
      control.disabled = false;
    });
  };

  const initializeYouTubePlayer = (YT) => {
    youtubePlayer = new YT.Player('youtubePlayer', {
      width: '100%',
      height: '100%',
      videoId: currentVideoId,
      playerVars: {
        controls: 1,
        playsinline: 1,
        rel: 0,
        origin: window.location.origin
      },
      events: {
        onReady: () => {
          playerIsReady = true;
          enableClipControls();
          updateClipDurationHint();
          setClipStatus('Video ready. Set the clip boundaries, then play the loop.');

          window.setInterval(() => {
            if (!playerIsReady) return;
            const currentTime = youtubePlayer.getCurrentTime();
            if (Number.isFinite(currentTime)) {
              clipCurrentTime.textContent = formatClipTime(currentTime);
            }

            if (!loopingClip || youtubePlayer.getPlayerState() !== YT.PlayerState.PLAYING) return;
            const bounds = readClipBounds();
            if (!bounds) {
              loopingClip = false;
              clipLoopToggle.textContent = 'Play clip loop';
              setClipStatus('Clip loop stopped. Check the start and end timestamps.');
              return;
            }

            if (currentTime >= bounds.end && performance.now() >= loopSeekAvailableAt) {
              loopSeekAvailableAt = performance.now() + 350;
              youtubePlayer.seekTo(bounds.start, true);
            }
          }, 100);
        },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.CUED) updateClipDurationHint();
          if (event.data === YT.PlayerState.PLAYING) {
            updateClipDurationHint();
            setClipStatus(loopingClip ? 'Playing the selected clip on loop.' : 'YouTube video is playing.');
          }
          if (event.data === YT.PlayerState.PAUSED && loopingClip) {
            loopingClip = false;
            clipLoopToggle.textContent = 'Play clip loop';
            setClipStatus('Clip loop paused.');
          }
          if (event.data === YT.PlayerState.ENDED && loopingClip) {
            const bounds = readClipBounds();
            if (bounds) {
              loopSeekAvailableAt = performance.now() + 350;
              youtubePlayer.seekTo(bounds.start, true);
              youtubePlayer.playVideo();
            } else {
              loopingClip = false;
              clipLoopToggle.textContent = 'Play clip loop';
              setClipStatus('Clip loop stopped. Check the start and end timestamps.');
            }
          }
        },
        onError: (event) => {
          loopingClip = false;
          clipLoopToggle.textContent = 'Play clip loop';
          const errorMessages = {
            2: 'YouTube rejected this video link. Check that it points to a video.',
            5: 'YouTube could not play this video in its embedded player. Try opening it on YouTube or using another browser.',
            100: 'This video is unavailable or private on YouTube.',
            101: 'The video owner does not allow playback in embedded players.',
            150: 'The video owner does not allow playback in embedded players.',
            153: 'YouTube could not verify the embedded player origin. Try the hosted site over HTTPS.'
          };
          setClipStatus(errorMessages[event.data] || `YouTube could not play this video (error ${event.data}).`);
          clipFallbackLink.href = `https://www.youtube.com/watch?v=${encodeURIComponent(currentVideoId)}`;
          clipFallbackLink.hidden = false;
        }
      }
    });
  };

  clipVideoForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clipFallbackLink.hidden = true;
    const videoId = getVideoId(clipVideoUrl.value);
    if (!videoId) {
      setClipStatus('Enter a valid YouTube video link.');
      return;
    }

    currentVideoId = videoId;
    loopingClip = false;
    clipLoopToggle.textContent = 'Play clip loop';
    clipWorkspace.hidden = false;
    clipLoadButton.disabled = true;
    setClipStatus('Loading YouTube player...');

    try {
      const YT = await loadYouTubeApi();
      if (!youtubePlayer) initializeYouTubePlayer(YT);
      else youtubePlayer.cueVideoById(currentVideoId);
    } catch {
      youtubeApiPromise = null;
      setClipStatus('YouTube player could not be loaded. Check your connection and try again.');
    } finally {
      clipLoadButton.disabled = false;
    }
  });

  markClipStart.addEventListener('click', () => {
    clipStartTime.value = formatClipTime(youtubePlayer.getCurrentTime());
    setClipStatus('Clip start set to the current position.');
  });

  markClipEnd.addEventListener('click', () => {
    clipEndTime.value = formatClipTime(youtubePlayer.getCurrentTime());
    setClipStatus('Clip end set to the current position.');
  });

  clipLoopToggle.addEventListener('click', () => {
    if (loopingClip) {
      loopingClip = false;
      youtubePlayer.pauseVideo();
      clipLoopToggle.textContent = 'Play clip loop';
      setClipStatus('Clip loop paused.');
      return;
    }

    const bounds = readClipBounds();
    if (!bounds) {
      setClipStatus('Choose a valid end time after the start and within the video duration.');
      return;
    }

    loopingClip = true;
    loopSeekAvailableAt = performance.now() + 350;
    clipLoopToggle.textContent = 'Pause clip loop';
    setClipStatus('Starting clip loop...');
    youtubePlayer.seekTo(bounds.start, true);
    youtubePlayer.playVideo();
  });
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
