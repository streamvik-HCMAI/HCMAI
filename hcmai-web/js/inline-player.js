(() => {
  let youtubeApiPromise = null;

  function loadYouTubeApi() {
    if (window.YT?.Player) return Promise.resolve();
    if (!youtubeApiPromise) {
      youtubeApiPromise = new Promise((resolve, reject) => {
        const previous = window.onYouTubeIframeAPIReady;
        const script = document.createElement('script');
        const timeout = setTimeout(() => {
          script.remove();
          reject(new Error('YouTube player loading timed out.'));
        }, 15000);
        window.onYouTubeIframeAPIReady = () => {
          clearTimeout(timeout);
          previous?.();
          resolve();
        };
        script.src = 'https://www.youtube.com/iframe_api';
        script.onerror = () => {
          clearTimeout(timeout);
          script.remove();
          reject(new Error('YouTube player could not be loaded.'));
        };
        document.head.appendChild(script);
      }).catch((error) => {
        youtubeApiPromise = null;
        throw error;
      });
    }
    return youtubeApiPromise;
  }

  function closeInlinePlayers(container = document) {
    container.querySelectorAll('.practice-loop-player').forEach((panel) => {
      const button = panel.parentElement.querySelector('[data-inline-practice]');
      panel.cleanup?.();
      panel.remove();
      if (button) {
        button.textContent = button.dataset.inlinePractice;
        button.setAttribute('aria-expanded', 'false');
      }
    });
  }

  async function toggleInlinePlayer(row, button, loop, audio) {
    if (row.querySelector('.practice-loop-player')) {
      closeInlinePlayers(row);
      return;
    }
    closeInlinePlayers();
    window.dispatchEvent(new CustomEvent('hcmai-inline-player-opening'));
    const panel = document.createElement('div');
    panel.className = 'practice-loop-player';
    row.appendChild(panel);
    button.textContent = 'Close player';
    button.setAttribute('aria-expanded', 'true');
    const status = document.createElement('p');
    status.className = 'practice-loop-playback-status';
    status.setAttribute('role', 'status');
    const playButton = document.createElement('button');
    playButton.className = 'secondary-btn small';
    playButton.type = 'button';
    playButton.textContent = 'Play phrase';
    playButton.hidden = true;
    const showPlaybackError = (error) => {
      if (!panel.isConnected) return;
      console.error('Unable to start phrase playback.', error);
      status.textContent = error.name === 'NotAllowedError'
        ? 'Your browser requires another tap. Select Play phrase to start.'
        : 'Playback could not start. Select Play phrase to retry.';
      playButton.hidden = false;
    };

    if (loop.sourceType === 'audio') {
      panel.append(audio, status, playButton);
      audio.currentTime = 0;
      const startAudio = () => audio.play().catch(showPlaybackError);
      audio.onplaying = () => {
        status.textContent = '';
        playButton.hidden = true;
      };
      audio.onerror = () => {
        if (!panel.isConnected) return;
        console.error('Phrase audio failed to load.', audio.error);
        status.textContent = 'Audio could not be played. Close the player and try again.';
      };
      panel.cleanup = () => {
        audio.pause();
        audio.onplaying = null;
        audio.onerror = null;
      };
      playButton.addEventListener('click', startAudio);
      // Keep play() in the click gesture; resolving a Storage URL here loses mobile playback permission.
      startAudio();
      return;
    }

    const start = Math.max(0, Number(loop.startSeconds) || 0);
    const end = Number(loop.endSeconds) || start + 1;
    const frame = document.createElement('div');
    frame.className = 'practice-loop-video-frame';
    const target = document.createElement('iframe');
    target.title = loop.title || loop.name || 'Practice phrase video';
    target.allow = 'autoplay; encrypted-media; picture-in-picture';
    const videoUrl = new URL(`https://www.youtube.com/embed/${loop.videoId}`);
    videoUrl.search = new URLSearchParams({
      start: String(Math.floor(start)), playsinline: '1', rel: '0', autoplay: '1',
      enablejsapi: '1', fs: '0', origin: window.location.origin
    }).toString();
    target.src = videoUrl.href;
    frame.appendChild(target);
    status.textContent = 'Loading video...';
    panel.append(frame, status, playButton);
    let timer = null;
    let player = null;
    panel.cleanup = () => {
      clearInterval(timer);
      player?.destroy();
      target.remove();
    };
    playButton.addEventListener('click', () => player?.playVideo());
    try {
      await loadYouTubeApi();
      if (!panel.isConnected) return;
      player = new window.YT.Player(target, {
        events: {
          onReady: (event) => {
            if (!panel.isConnected) return;
            event.target.seekTo(start, true);
            event.target.playVideo();
            timer = setInterval(() => {
              if (event.target.getPlayerState() === window.YT.PlayerState.PLAYING
                  && event.target.getCurrentTime() >= end) {
                event.target.seekTo(start, true);
              }
            }, 250);
          },
          onStateChange: (event) => {
            if (!panel.isConnected) return;
            if (event.data === window.YT.PlayerState.PLAYING) {
              status.textContent = '';
              playButton.hidden = true;
            }
            if (event.data === window.YT.PlayerState.ENDED) {
              event.target.seekTo(start, true);
              event.target.playVideo();
            }
          },
          onAutoplayBlocked: () => {
            if (!panel.isConnected) return;
            status.textContent = 'Your browser requires another tap. Select Play phrase to start.';
            playButton.hidden = false;
          },
          onError: (event) => {
            if (!panel.isConnected) return;
            console.error('YouTube phrase playback failed.', event.data);
            const messages = {
              2: 'The YouTube video link is invalid.',
              5: 'Your browser could not play this video. Close the player and try again.',
              100: 'This YouTube video is unavailable.',
              101: 'The video owner does not allow playback on this website.',
              150: 'The video owner does not allow playback on this website.'
            };
            status.textContent = messages[event.data] || 'YouTube playback failed. Close the player and try again.';
            playButton.hidden = true;
          }
        }
      });
    } catch (error) {
      if (!panel.isConnected) return;
      panel.cleanup();
      console.error('Unable to load phrase player.', error);
      status.textContent = 'Video player could not be loaded. Close it and try again.';
    }
  }

  function attachInlinePlayer(row, button, loop, getAudioUrl) {
    button.dataset.inlinePractice = button.textContent;
    button.setAttribute('aria-expanded', 'false');
    const audio = loop.sourceType === 'audio' ? document.createElement('audio') : null;
    const status = document.createElement('span');
    status.className = 'practice-loop-playback-status';
    status.setAttribute('role', 'status');
    row.appendChild(status);
    if (audio) {
      audio.controls = true;
      audio.loop = true;
      audio.preload = 'metadata';
    }
    const prepareAudio = async () => {
      button.disabled = true;
      status.textContent = 'Preparing audio...';
      try {
        const url = await getAudioUrl(loop);
        if (!row.isConnected) return;
        audio.src = url;
        status.textContent = '';
        button.textContent = button.dataset.inlinePractice;
      } catch (error) {
        if (!row.isConnected) return;
        console.error('Unable to prepare phrase audio.', error);
        status.textContent = 'Audio could not be loaded. Retry to prepare it again.';
        button.textContent = 'Retry audio';
      } finally {
        button.disabled = false;
      }
    };
    button.addEventListener('click', () => {
      if (audio && !audio.getAttribute('src')) {
        prepareAudio();
        return;
      }
      toggleInlinePlayer(row, button, loop, audio);
    });
    if (audio) prepareAudio();
  }

  window.hcmaiInlinePlayers = { attach: attachInlinePlayer, close: closeInlinePlayers };
  window.addEventListener('pagehide', () => closeInlinePlayers());
})();
