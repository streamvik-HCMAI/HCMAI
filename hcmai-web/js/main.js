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
const clipAudioFile = document.getElementById('clipAudioFile');
const clipAudioFileName = document.getElementById('clipAudioFileName');
const clipWorkspace = document.getElementById('clipWorkspace');
const clipYoutubeFrame = document.getElementById('clipYoutubeFrame');
const clipLocalAudio = document.getElementById('clipLocalAudio');
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
  clipVideoForm && clipVideoUrl && clipLoadButton && clipAudioFile && clipAudioFileName && clipWorkspace && clipYoutubeFrame && clipLocalAudio &&
  clipStatus && clipFallbackLink && clipDurationHint &&
  clipStartTime && clipEndTime && markClipStart && markClipEnd && clipCurrentTime && clipLoopToggle
) {
  let youtubePlayer = null;
  let youtubeApiPromise = null;
  let playerIsReady = false;
  let loopingClip = false;
  let loopSeekAvailableAt = 0;
  let currentVideoId = '';
  let activeClipSource = '';
  let localClipObjectUrl = null;
  let clipClockInterval = null;

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

  const getClipDuration = () => activeClipSource === 'audio'
    ? clipLocalAudio.duration
    : youtubePlayer?.getDuration() || 0;

  const getClipCurrentTime = () => activeClipSource === 'audio'
    ? clipLocalAudio.currentTime
    : youtubePlayer?.getCurrentTime() || 0;

  const isClipPlaying = () => activeClipSource === 'audio'
    ? !clipLocalAudio.paused && !clipLocalAudio.ended
    : youtubePlayer?.getPlayerState() === window.YT?.PlayerState.PLAYING;

  const seekClip = (seconds) => {
    if (activeClipSource === 'audio') clipLocalAudio.currentTime = seconds;
    else if (activeClipSource === 'youtube' && playerIsReady) youtubePlayer.seekTo(seconds, true);
  };

  const releaseLocalClip = () => {
    clipLocalAudio.pause();
    clipLocalAudio.removeAttribute('src');
    clipLocalAudio.load();
    if (localClipObjectUrl) URL.revokeObjectURL(localClipObjectUrl);
    localClipObjectUrl = null;
  };

  const stopClipPlayback = () => {
    loopingClip = false;
    if (activeClipSource === 'audio') clipLocalAudio.pause();
    if (activeClipSource === 'youtube' && playerIsReady) youtubePlayer.pauseVideo();
    clipLoopToggle.textContent = 'Play clip loop';
  };

  const handleClipEnded = () => {
    if (!loopingClip) return;
    const bounds = readClipBounds();
    if (!bounds) {
      stopClipPlayback();
      setClipStatus('Clip loop stopped. Check the start and end timestamps.');
      return;
    }

    loopSeekAvailableAt = performance.now() + 200;
    seekClip(bounds.start);
    if (activeClipSource === 'audio') {
      clipLocalAudio.play().catch(() => {
        stopClipPlayback();
        setClipStatus('This audio file could not be played by the browser.');
      });
    } else {
      youtubePlayer.playVideo();
    }
  };

  const updateClipDurationHint = () => {
    const duration = Math.floor(getClipDuration());
    if (!Number.isFinite(duration) || duration <= 0) {
      clipDurationHint.textContent = 'Waiting for the media duration.';
      return;
    }

    const mediaLabel = activeClipSource === 'audio' ? 'Audio duration' : 'Video duration';
    clipDurationHint.textContent = `${mediaLabel}: ${formatClipTime(duration)}. End time cannot exceed this.`;
    const end = parseClipTime(clipEndTime.value);
    if (end !== null && end > duration) clipEndTime.value = formatClipTime(duration);
  };

  const startClipClock = () => {
    if (clipClockInterval) return;
    clipClockInterval = window.setInterval(() => {
      if (!activeClipSource) return;
      const currentTime = getClipCurrentTime();
      if (Number.isFinite(currentTime)) clipCurrentTime.textContent = formatClipTime(currentTime);
      if (!loopingClip || !isClipPlaying()) return;

      const bounds = readClipBounds();
      if (!bounds) {
        stopClipPlayback();
        setClipStatus('Clip loop stopped. Check the start and end timestamps.');
        return;
      }

      if (currentTime >= bounds.end && performance.now() >= loopSeekAvailableAt) {
        loopSeekAvailableAt = performance.now() + 200;
        seekClip(bounds.start);
      }
    }, 100);
  };

  const readClipBounds = () => {
    const start = parseClipTime(clipStartTime.value);
    const end = parseClipTime(clipEndTime.value);
    const duration = getClipDuration() || 0;

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
          if (activeClipSource === 'youtube') {
            updateClipDurationHint();
            setClipStatus('Video ready. Set the clip boundaries, then play the loop.');
          }

          startClipClock();
        },
        onStateChange: (event) => {
          if (activeClipSource !== 'youtube') return;
          if (event.data === YT.PlayerState.CUED) {
            enableClipControls();
            updateClipDurationHint();
            setClipStatus('Video ready. Set the clip boundaries, then play the loop.');
          }
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
            handleClipEnded(YT);
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

  clipLocalAudio.addEventListener('loadedmetadata', () => {
    if (activeClipSource !== 'audio') return;
    const duration = Math.floor(clipLocalAudio.duration);
    clipStartTime.value = '0:00';
    clipEndTime.value = formatClipTime(Math.min(10, Math.max(1, duration)));
    enableClipControls();
    updateClipDurationHint();
    startClipClock();
    setClipStatus('Audio ready. Set the clip boundaries, then play the loop.');
  });

  clipLocalAudio.addEventListener('play', () => {
    if (activeClipSource === 'audio') {
      setClipStatus(loopingClip ? 'Playing the selected clip on loop.' : 'Audio is playing.');
    }
  });

  clipLocalAudio.addEventListener('pause', () => {
    if (activeClipSource === 'audio' && loopingClip) {
      loopingClip = false;
      clipLoopToggle.textContent = 'Play clip loop';
      setClipStatus('Clip loop paused.');
    }
  });

  clipLocalAudio.addEventListener('ended', handleClipEnded);

  clipLocalAudio.addEventListener('error', () => {
    if (activeClipSource !== 'audio') return;
    stopClipPlayback();
    setClipStatus('This audio file could not be played. Try MP3, WAV, M4A, or OGG.');
  });

  clipAudioFile.addEventListener('change', () => {
    const file = clipAudioFile.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|opus|aac|flac)$/i.test(file.name)) {
      setClipStatus('Choose a supported audio file.');
      clipAudioFileName.textContent = '';
      clipAudioFile.value = '';
      return;
    }

    stopClipPlayback();
    activeClipSource = '';
    releaseLocalClip();
    activeClipSource = 'audio';
    clipYoutubeFrame.hidden = true;
    clipLocalAudio.hidden = false;
    clipWorkspace.hidden = false;
    clipFallbackLink.hidden = true;
    clipAudioFileName.textContent = file.name;
    setClipStatus('Loading audio file...');
    localClipObjectUrl = URL.createObjectURL(file);
    clipLocalAudio.src = localClipObjectUrl;
    clipAudioFile.value = '';
  });

  window.addEventListener('pagehide', () => {
    if (localClipObjectUrl) URL.revokeObjectURL(localClipObjectUrl);
  });

  clipVideoForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clipFallbackLink.hidden = true;
    const videoId = getVideoId(clipVideoUrl.value);
    if (!videoId) {
      setClipStatus('Enter a valid YouTube video link.');
      return;
    }

    currentVideoId = videoId;
    stopClipPlayback();
    activeClipSource = '';
    releaseLocalClip();
    activeClipSource = 'youtube';
    clipYoutubeFrame.hidden = false;
    clipLocalAudio.hidden = true;
    clipAudioFileName.textContent = '';
    clipWorkspace.hidden = false;
    clipStartTime.value = '0:00';
    clipEndTime.value = '0:10';
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
    clipStartTime.value = formatClipTime(getClipCurrentTime());
    setClipStatus('Clip start set to the current position.');
  });

  markClipEnd.addEventListener('click', () => {
    clipEndTime.value = formatClipTime(getClipCurrentTime());
    setClipStatus('Clip end set to the current position.');
  });

  clipLoopToggle.addEventListener('click', () => {
    if (loopingClip) {
      stopClipPlayback();
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
    seekClip(bounds.start);
    if (activeClipSource === 'audio') {
      clipLocalAudio.play().catch(() => {
        stopClipPlayback();
        setClipStatus('This audio file could not be played by the browser.');
      });
    } else {
      youtubePlayer.playVideo();
    }
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
