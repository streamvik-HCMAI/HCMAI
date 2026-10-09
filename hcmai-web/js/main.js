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
const savedLoopsCount = document.getElementById('savedLoopsCount');
const savedLoopsEmpty = document.getElementById('savedLoopsEmpty');
const savedYouTubeLoopsList = document.getElementById('savedYouTubeLoops');
const savedLoopsSearch = document.getElementById('savedLoopsSearch');
const savedLoopsSource = document.getElementById('savedLoopsSource');
const savedLoopsPagination = document.getElementById('savedLoopsPagination');
const savedLoopsPrevious = document.getElementById('savedLoopsPrevious');
const savedLoopsNext = document.getElementById('savedLoopsNext');
const savedLoopsPageStatus = document.getElementById('savedLoopsPageStatus');
const featuredLoopsList = document.getElementById('featuredLoopsList');
const featuredLoopsStatus = document.getElementById('featuredLoopsStatus');
const youtubeSavedControls = document.getElementById('youtubeSavedControls');
const savedClipName = document.getElementById('savedClipName');
const saveYouTubeLoopButton = document.getElementById('saveYouTubeLoop');
const savedSongName = document.getElementById('savedSongName');
const savedRaagName = document.getElementById('savedRaagName');
const savedNotes = document.getElementById('savedNotes');
const savedArtist = document.getElementById('savedArtist');
const savedTaal = document.getElementById('savedTaal');
const savedLaya = document.getElementById('savedLaya');
const savedSection = document.getElementById('savedSection');
const savedTags = document.getElementById('savedTags');
const saveDetails = document.querySelector('.clip-save-details');

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
  let selectedSavedLoopId = '';
  let savedYouTubeLoops = [];
  let savedLoopsPage = 1;
  const savedLoopsPageSize = 6;
  let localClipObjectUrl = null;
  let clipClockInterval = null;
  const savedLoopsStoragePrefix = 'hcmai.practice.saved-youtube-loops.v2:';
  const legacySavedLoopsStorageKey = 'hcmai.practice.saved-youtube-loops.v1';
  let savedLoopsStorageKey = `${savedLoopsStoragePrefix}guest`;
  let savedLoopsOwnerInitialized = false;
  let currentUid = null;
  let localAudioBlob = null;
  let localAudioLoop = null;
  let localAudioName = '';
  let pendingAudioBounds = null;
  let featuredRequest = 0;
  let featuredLoops = [];
  let featuredAdmin = false;
  const maxSavedAudioSeconds = 60;
  const cloudApi = () => window.hcmaiCloudLoops || null;
  const usingCloud = () => Boolean(currentUid && cloudApi());

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

  const readSavedYouTubeLoops = (storageKey = savedLoopsStorageKey) => {
    try {
      const storedLoops = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      if (!Array.isArray(storedLoops)) return [];
      return storedLoops.filter((loop) => loop
        && typeof loop.id === 'string'
        && typeof loop.name === 'string'
        && /^[\w-]{11}$/.test(loop.videoId)
        && Number.isInteger(loop.startSeconds)
        && Number.isInteger(loop.endSeconds)
        && loop.startSeconds >= 0
        && loop.endSeconds > loop.startSeconds);
    } catch {
      return [];
    }
  };

  savedYouTubeLoops = readSavedYouTubeLoops();

  const persistSavedYouTubeLoops = () => {
    try {
      window.localStorage.setItem(savedLoopsStorageKey, JSON.stringify(savedYouTubeLoops));
      return true;
    } catch {
      setClipStatus('Saved loops could not be stored in this browser. Check its available site storage.');
      return false;
    }
  };

  const renderSavedYouTubeLoops = () => {
    const search = (savedLoopsSearch?.value || '').trim().toLowerCase();
    const source = savedLoopsSource?.value || 'all';
    const filteredLoops = savedYouTubeLoops.filter((loop) => {
      const loopSource = loop.sourceType === 'audio' ? 'audio' : 'youtube';
      const searchableText = [
        loop.name, loop.songName, loop.raagName, loop.artist, loop.taal,
        loop.laya, loop.section, loop.notes, loop.sourceName, ...(loop.tags || [])
      ].filter(Boolean).join(' ').toLowerCase();
      return (source === 'all' || source === loopSource) && searchableText.includes(search);
    });
    const pageCount = Math.max(1, Math.ceil(filteredLoops.length / savedLoopsPageSize));
    savedLoopsPage = Math.min(savedLoopsPage, pageCount);
    const firstIndex = (savedLoopsPage - 1) * savedLoopsPageSize;
    savedLoopsCount.textContent = `${savedYouTubeLoops.length} saved`;
    savedLoopsEmpty.hidden = filteredLoops.length > 0;
    savedLoopsEmpty.textContent = savedYouTubeLoops.length
      ? 'No loops match your search or source filter.'
      : 'Your saved loops will appear here.';
    savedYouTubeLoopsList.hidden = filteredLoops.length === 0;
    if (savedLoopsPagination) {
      savedLoopsPagination.hidden = filteredLoops.length === 0;
      savedLoopsPrevious.disabled = savedLoopsPage === 1;
      savedLoopsNext.disabled = savedLoopsPage === pageCount;
      savedLoopsPageStatus.textContent = `${firstIndex + 1}-${Math.min(firstIndex + savedLoopsPageSize, filteredLoops.length)} of ${filteredLoops.length} · Page ${savedLoopsPage} of ${pageCount}`;
    }
    savedYouTubeLoopsList.replaceChildren();

    filteredLoops.slice(firstIndex, firstIndex + savedLoopsPageSize).forEach((loop) => {
      const item = document.createElement('li');
      item.className = 'saved-loop-item';

      const details = document.createElement('div');
      details.className = 'saved-loop-details';
      const name = document.createElement('strong');
      name.textContent = loop.name;
      const boundaries = document.createElement('span');
      boundaries.textContent = loop.sourceType === 'audio'
        ? `Audio clip ${formatClipTime(loop.endSeconds - loop.startSeconds)}${loop.sourceName ? ` from ${loop.sourceName}` : ''}`
        : `YouTube clip ${formatClipTime(loop.startSeconds)} - ${formatClipTime(loop.endSeconds)}`;
      details.append(name, boundaries);
      const metaText = [
        loop.songName,
        loop.raagName && `Raag ${loop.raagName}`,
        loop.artist,
        loop.taal && `${loop.taal}${loop.laya ? ` (${loop.laya})` : ''}`,
        !loop.taal && loop.laya,
        loop.section
      ].filter(Boolean).join(' · ');
      if (metaText) {
        const meta = document.createElement('span');
        meta.textContent = metaText;
        details.append(meta);
      }
      if (Array.isArray(loop.tags) && loop.tags.length) {
        const tags = document.createElement('span');
        tags.textContent = loop.tags.map((tag) => `#${tag}`).join(' ');
        details.append(tags);
      }
      if (loop.notes) {
        const notes = document.createElement('p');
        notes.className = 'saved-loop-notes';
        notes.textContent = loop.notes;
        details.append(notes);
      }

      const actions = document.createElement('div');
      actions.className = 'saved-loop-actions';
      const loadButton = document.createElement('button');
      loadButton.className = 'secondary-btn small';
      loadButton.type = 'button';
      loadButton.dataset.savedLoopAction = 'load';
      loadButton.dataset.savedLoopId = loop.id;
      loadButton.textContent = 'Load';
      loadButton.setAttribute('aria-label', `Load ${loop.name}`);
      const deleteButton = document.createElement('button');
      deleteButton.className = 'secondary-btn small';
      deleteButton.type = 'button';
      deleteButton.dataset.savedLoopAction = 'delete';
      deleteButton.dataset.savedLoopId = loop.id;
      deleteButton.textContent = 'Delete';
      deleteButton.setAttribute('aria-label', `Delete ${loop.name}`);
      actions.append(loadButton, deleteButton);
      item.append(details, actions);
      savedYouTubeLoopsList.append(item);
    });
  };

  const resetSavedLoopsPage = () => {
    savedLoopsPage = 1;
    renderSavedYouTubeLoops();
  };
  savedLoopsSearch?.addEventListener('input', resetSavedLoopsPage);
  savedLoopsSource?.addEventListener('change', resetSavedLoopsPage);
  savedLoopsPrevious?.addEventListener('click', () => {
    savedLoopsPage = Math.max(1, savedLoopsPage - 1);
    renderSavedYouTubeLoops();
    savedLoopsPrevious.focus();
  });
  savedLoopsNext?.addEventListener('click', () => {
    savedLoopsPage += 1;
    renderSavedYouTubeLoops();
    savedLoopsNext.focus();
  });

  const switchSavedLoopOwner = (uid) => {
    const ownerKey = uid || 'guest';
    currentUid = uid;
    savedLoopsPage = 1;
    if (savedLoopsSearch) savedLoopsSearch.value = '';
    if (savedLoopsSource) savedLoopsSource.value = 'all';
    const nextStorageKey = `${savedLoopsStoragePrefix}${ownerKey}`;
    if (nextStorageKey === savedLoopsStorageKey) {
      savedLoopsOwnerInitialized = true;
      refreshCloudLoops();
      return;
    }

    if (uid) {
      try {
        const legacyLoops = window.localStorage.getItem(legacySavedLoopsStorageKey);
        if (legacyLoops && !window.localStorage.getItem(nextStorageKey)) {
          window.localStorage.setItem(nextStorageKey, legacyLoops);
        }
        if (legacyLoops) window.localStorage.removeItem(legacySavedLoopsStorageKey);
      } catch {
        setClipStatus('Older saved loops could not be moved into this account in this browser.');
      }
    }

    if (savedLoopsOwnerInitialized && !savedLoopsStorageKey.endsWith(':guest') && activeClipSource) {
      stopClipPlayback();
      youtubePlayer?.stopVideo?.();
      releaseLocalClip();
      localAudioBlob = null;
    localAudioLoop = null;
      clipAudioFileName.textContent = '';
      activeClipSource = '';
      currentVideoId = '';
      clipWorkspace.hidden = true;
      clipFallbackLink.hidden = true;
      clipVideoUrl.value = '';
    }
    selectedSavedLoopId = '';
    savedClipName.value = '';
    youtubeSavedControls.hidden = true;
    savedLoopsStorageKey = nextStorageKey;
    savedLoopsOwnerInitialized = true;
    savedYouTubeLoops = readSavedYouTubeLoops();
    renderSavedYouTubeLoops();
    refreshCloudLoops();
  };

  const migrateLocalLoopsToCloud = async () => {
    const localLoops = readSavedYouTubeLoops();
    if (!localLoops.length) return;
    for (const loop of localLoops) {
      await cloudApi().save({ ...loop, sourceType: 'youtube' });
    }
    try {
      window.localStorage.removeItem(savedLoopsStorageKey);
    } catch {
      // The account copy is saved; a leftover local copy is harmless.
    }
  };

  async function refreshCloudLoops() {
    if (!usingCloud()) return;
    const uid = currentUid;
    try {
      await migrateLocalLoopsToCloud();
      const loops = await cloudApi().list();
      if (uid !== currentUid) return;
      savedYouTubeLoops = loops;
      renderSavedYouTubeLoops();
      if (featuredAdmin) renderFeaturedLoops();
    } catch (error) {
      console.error('Unable to load saved loops from your account.', error);
      setClipStatus('Saved loops could not be loaded from your account.');
    }
  }

  function renderFeaturedLoops() {
    if (!featuredLoopsList) return;
    window.hcmaiInlinePlayers.close(featuredLoopsList);
    featuredLoopsList.replaceChildren();
    const slots = featuredAdmin ? ['1', '2', '3', '4', '5'] : featuredLoops.map((loop) => loop.id);
    featuredLoopsStatus.textContent = featuredAdmin
      ? 'Manage five featured slots. Published copies are separate from your saved loops.'
      : featuredLoops.length ? `${featuredLoops.length} featured loops available` : 'No featured loops are available yet.';
    slots.forEach((slot) => {
      const loop = featuredLoops.find((entry) => entry.id === slot);
      const card = document.createElement('li');
      card.className = 'featured-loop-card';
      const title = document.createElement('h3');
      title.textContent = loop?.name || `Featured slot ${slot}`;
      card.append(title);
      if (loop) {
        const description = document.createElement('p');
        description.textContent = [
          loop.sourceType === 'audio' ? 'Audio' : 'YouTube',
          loop.raagName,
          `${formatClipTime(loop.endSeconds - loop.startSeconds)}`,
          featuredAdmin && (!loop.isPublished ? 'Draft' : loop.accessLevel === 'public' ? 'Published · Anyone' : 'Published · Signed-in users')
        ].filter(Boolean).join(' · ');
        const load = document.createElement('button');
        load.type = 'button';
        load.className = 'primary-btn small';
        load.textContent = 'Practice loop';
        load.setAttribute('aria-label', `Practice ${loop.name}`);
        if (featuredAdmin) load.addEventListener('click', () => loadPracticeSelection(loop, load, false));
        card.append(description, load);
        if (!featuredAdmin) {
          window.hcmaiInlinePlayers.attach(card, load, loop, (phrase) => cloudApi().getAudioUrl(phrase));
        }
      }
      if (featuredAdmin) {
        const form = document.createElement('form');
        const makeSelect = (labelText, name, options) => {
          const label = document.createElement('label');
          label.className = 'raag-edit-field';
          const caption = document.createElement('span');
          caption.textContent = labelText;
          const select = document.createElement('select');
          select.name = name;
          options.forEach(([value, text]) => select.add(new Option(text, value)));
          label.append(caption, select);
          form.append(label);
          return select;
        };
        const source = makeSelect('My saved loop', 'source', [
          ['', 'Choose a saved loop'],
          ...savedYouTubeLoops.map((saved) => [saved.id, saved.name])
        ]);
        source.value = savedYouTubeLoops.some((saved) => saved.id === loop?.sourceLoopId) ? loop.sourceLoopId : '';
        const access = makeSelect('Who can practice this loop?', 'access', [
          ['public', 'Anyone'], ['signed-in', 'Signed-in users']
        ]);
        access.value = loop?.accessLevel || 'public';
        const label = document.createElement('label');
        label.className = 'check-row';
        const published = document.createElement('input');
        published.type = 'checkbox';
        published.checked = loop?.isPublished === true;
        label.append(published, document.createTextNode('Publish for learners'));
        const save = document.createElement('button');
        save.type = 'submit';
        save.className = 'secondary-btn small';
        save.textContent = 'Save featured slot';
        form.append(label, save);
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const selected = savedYouTubeLoops.find((saved) => saved.id === source.value);
          if (!selected) {
            featuredLoopsStatus.textContent = 'Choose a saved loop before saving this slot.';
            source.focus();
            return;
          }
          const uid = currentUid;
          const request = featuredRequest;
          save.disabled = true;
          featuredLoopsStatus.textContent = 'Saving featured loop...';
          try {
            await cloudApi().setFeatured(slot, selected, access.value, published.checked);
            if (uid === currentUid && request === featuredRequest) await refreshFeaturedLoops();
          } catch (error) {
            console.error('Unable to save featured loop.', error);
            if (uid === currentUid && request === featuredRequest) featuredLoopsStatus.textContent = error.message;
          } finally {
            save.disabled = false;
          }
        });
        card.append(form);
        if (loop) {
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'secondary-btn small';
          remove.textContent = 'Clear featured slot';
          remove.addEventListener('click', async () => {
            const uid = currentUid;
            const request = featuredRequest;
            remove.disabled = true;
            try {
              await cloudApi().removeFeatured(slot);
              if (uid === currentUid && request === featuredRequest) await refreshFeaturedLoops();
            } catch (error) {
              console.error('Unable to clear featured loop.', error);
              if (uid === currentUid && request === featuredRequest) featuredLoopsStatus.textContent = error.message;
            } finally {
              remove.disabled = false;
            }
          });
          card.append(remove);
        }
      }
      featuredLoopsList.append(card);
    });
  }

  async function refreshFeaturedLoops() {
    if (!featuredLoopsList || !cloudApi()) return;
    const request = ++featuredRequest;
    const uid = currentUid;
    featuredAdmin = false;
    featuredLoops = [];
    window.hcmaiInlinePlayers.close(featuredLoopsList);
    featuredLoopsList.replaceChildren();
    featuredLoopsStatus.textContent = 'Loading featured loops...';
    try {
      const result = await cloudApi().featured();
      if (request !== featuredRequest) return;
      if (result.isAdmin && uid) {
        const loops = await cloudApi().list();
        if (request !== featuredRequest || uid !== currentUid) return;
        savedYouTubeLoops = loops;
        renderSavedYouTubeLoops();
      }
      featuredAdmin = result.isAdmin;
      featuredLoops = result.loops;
      renderFeaturedLoops();
    } catch (error) {
      if (request !== featuredRequest) return;
      console.error('Unable to load featured loops.', error);
      featuredLoopsStatus.textContent = 'Featured loops could not be loaded. Reload the page to retry.';
    }
  }

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

  const updateSaveYouTubeLoopButton = () => {
    const sourceReady = activeClipSource === 'audio' || (activeClipSource === 'youtube' && playerIsReady);
    saveYouTubeLoopButton.disabled = !sourceReady || !readClipBounds();
    saveYouTubeLoopButton.textContent = selectedSavedLoopId ? 'Update saved loop' : 'Save loop';
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
            updateSaveYouTubeLoopButton();
          }

          startClipClock();
        },
        onStateChange: (event) => {
          if (activeClipSource !== 'youtube') return;
          if (event.data === YT.PlayerState.CUED) {
            enableClipControls();
            updateClipDurationHint();
            setClipStatus('Video ready. Set the clip boundaries, then play the loop.');
            updateSaveYouTubeLoopButton();
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
    clipStartTime.value = formatClipTime(pendingAudioBounds?.start ?? 0);
    clipEndTime.value = formatClipTime(pendingAudioBounds?.end ?? Math.min(10, Math.max(1, duration)));
    pendingAudioBounds = null;
    enableClipControls();
    updateClipDurationHint();
    updateSaveYouTubeLoopButton();
    startClipClock();
    setClipStatus('Audio ready. Set the clip boundaries, then play the loop.');
  });

  clipLocalAudio.addEventListener('play', () => {
    if (activeClipSource !== 'audio') return;
    const bounds = readClipBounds();
    if (!loopingClip && bounds) {
      loopingClip = true;
      loopSeekAvailableAt = performance.now() + 350;
      clipLoopToggle.textContent = 'Pause clip loop';
      if (clipLocalAudio.currentTime < bounds.start || clipLocalAudio.currentTime >= bounds.end) {
        clipLocalAudio.currentTime = bounds.start;
      }
    }
    startClipClock();
    setClipStatus(loopingClip ? 'Playing the selected clip on loop.' : 'Audio is playing.');
  });

  clipLocalAudio.addEventListener('pause', () => {
    if (activeClipSource === 'audio' && loopingClip && !clipLocalAudio.ended) {
      loopingClip = false;
      clipLoopToggle.textContent = 'Play clip loop';
      setClipStatus('Clip loop paused.');
    }
  });

  clipLocalAudio.addEventListener('ended', handleClipEnded);

  clipLocalAudio.addEventListener('error', () => {
    if (activeClipSource !== 'audio') return;
    stopClipPlayback();
    setClipStatus('This file could not be played. Try MP3, WAV, M4A, OGG, or an MP4/MOV video.');
  });

  const loadLocalAudio = (source, label, { savedLoopId = '', bounds = null, storedLoop = null } = {}) => {
    window.hcmaiInlinePlayers.close();
    stopClipPlayback();
    activeClipSource = '';
    selectedSavedLoopId = savedLoopId;
    releaseLocalClip();
    activeClipSource = 'audio';
    const isUrl = typeof source === 'string';
    localAudioBlob = isUrl ? null : source;
    localAudioLoop = isUrl ? storedLoop : null;
    localAudioName = label;
    pendingAudioBounds = bounds;
    youtubeSavedControls.hidden = false;
    clipYoutubeFrame.hidden = true;
    clipLocalAudio.hidden = false;
    clipWorkspace.hidden = false;
    if (savedLoopId) clipWorkspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
    clipFallbackLink.hidden = true;
    clipAudioFileName.textContent = label;
    setClipStatus('Loading audio...');
    if (isUrl) {
      localClipObjectUrl = null;
      clipLocalAudio.src = source;
    } else {
      localClipObjectUrl = URL.createObjectURL(source);
      clipLocalAudio.src = localClipObjectUrl;
    }
    updateSaveYouTubeLoopButton();
  };

  const encodeWavClip = async (blob, startSeconds, endSeconds) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('This browser cannot prepare audio clips.');
    const context = new AudioContextClass();
    let decoded;
    try {
      decoded = await context.decodeAudioData(await blob.arrayBuffer());
    } finally {
      context.close?.();
    }

    const sampleRate = decoded.sampleRate;
    const first = Math.floor(startSeconds * sampleRate);
    const last = Math.min(decoded.length, Math.ceil(endSeconds * sampleRate));
    const frames = last - first;
    const channels = Math.min(2, decoded.numberOfChannels);
    if (frames <= 0) throw new Error('The selected clip is empty.');

    const buffer = new ArrayBuffer(44 + frames * channels * 2);
    const view = new DataView(buffer);
    const writeText = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    writeText(0, 'RIFF');
    view.setUint32(4, 36 + frames * channels * 2, true);
    writeText(8, 'WAVEfmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeText(36, 'data');
    view.setUint32(40, frames * channels * 2, true);

    const channelData = Array.from({ length: channels }, (_, index) => decoded.getChannelData(index));
    let offset = 44;
    for (let frame = 0; frame < frames; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, channelData[channel][first + frame]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return { blob: new Blob([buffer], { type: 'audio/wav' }), duration: Math.round(frames / sampleRate) };
  };

  clipAudioFile.addEventListener('change', () => {
    const file = clipAudioFile.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/') && !/\.(mp3|wav|m4a|ogg|opus|aac|flac|mp4|mov|m4v|webm|3gp)$/i.test(file.name)) {
      setClipStatus('Choose a supported audio or video file.');
      clipAudioFileName.textContent = '';
      clipAudioFile.value = '';
      return;
    }

    savedClipName.value = '';
    fillLoopDetails();
    loadLocalAudio(file, file.name);
    clipAudioFile.value = '';
  });

  window.addEventListener('pagehide', () => {
    if (localClipObjectUrl) URL.revokeObjectURL(localClipObjectUrl);
  });

  const loadYouTubeClip = async (videoId, { startSeconds = 0, endSeconds = 10, savedLoopId = '' } = {}) => {
    window.hcmaiInlinePlayers.close();
    clipFallbackLink.hidden = true;
    currentVideoId = videoId;
    selectedSavedLoopId = savedLoopId;
    stopClipPlayback();
    activeClipSource = '';
    releaseLocalClip();
    localAudioBlob = null;
    localAudioLoop = null;
    activeClipSource = 'youtube';
    youtubeSavedControls.hidden = false;
    clipYoutubeFrame.hidden = false;
    clipLocalAudio.hidden = true;
    clipAudioFileName.textContent = '';
    clipWorkspace.hidden = false;
    if (savedLoopId) clipWorkspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
    clipStartTime.value = formatClipTime(startSeconds);
    clipEndTime.value = formatClipTime(endSeconds);
    clipLoadButton.disabled = true;
    setClipStatus('Loading YouTube player...');
    updateSaveYouTubeLoopButton();

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
  };

  clipVideoForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const videoId = getVideoId(clipVideoUrl.value);
    if (!videoId) {
      setClipStatus('Enter a valid YouTube video link.');
      return;
    }

    savedClipName.value = '';
    fillLoopDetails();
    await loadYouTubeClip(videoId);
  });

  const fillLoopDetails = (loop = {}) => {
    savedSongName.value = loop.songName || '';
    savedRaagName.value = loop.raagName || '';
    savedNotes.value = loop.notes || '';
    savedArtist.value = loop.artist || '';
    savedTaal.value = loop.taal || '';
    savedLaya.value = loop.laya || '';
    savedSection.value = loop.section || '';
    savedTags.value = Array.isArray(loop.tags) ? loop.tags.join(', ') : '';
    if (saveDetails) {
      saveDetails.open = Boolean(loop.songName || loop.raagName || loop.notes || loop.artist
        || loop.taal || loop.laya || loop.section || (loop.tags && loop.tags.length));
    }
  };

  const persistLoopList = () => {
    savedYouTubeLoops.sort((left, right) => (right.lastPracticedAt || right.updatedAt || 0) - (left.lastPracticedAt || left.updatedAt || 0));
    renderSavedYouTubeLoops();
  };

  savedYouTubeLoopsList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-saved-loop-action]');
    if (!button) return;
    const savedLoop = savedYouTubeLoops.find((loop) => loop.id === button.dataset.savedLoopId);
    if (!savedLoop) return;

    if (button.dataset.savedLoopAction === 'delete') {
      try {
        if (usingCloud()) await cloudApi().remove(savedLoop);
        else {
          savedYouTubeLoops = savedYouTubeLoops.filter((loop) => loop.id !== savedLoop.id);
          if (!persistSavedYouTubeLoops()) return;
        }
      } catch (error) {
        console.error('Unable to delete saved loop.', error);
        setClipStatus('This loop could not be deleted. Try again.');
        return;
      }
      savedYouTubeLoops = savedYouTubeLoops.filter((loop) => loop.id !== savedLoop.id);
      if (selectedSavedLoopId === savedLoop.id) {
        selectedSavedLoopId = '';
        updateSaveYouTubeLoopButton();
      }
      renderSavedYouTubeLoops();
      if (featuredAdmin) renderFeaturedLoops();
      setClipStatus(`Deleted "${savedLoop.name}".`);
      return;
    }

    await loadPracticeSelection(savedLoop, button, true);
  });

  async function loadPracticeSelection(savedLoop, button, personal) {
    const uid = currentUid;
    if (personal) {
      savedLoop.lastPracticedAt = Date.now();
      if (usingCloud()) cloudApi().touch(savedLoop.id, savedLoop.lastPracticedAt).catch((error) => {
        console.error('Unable to update loop practice time.', error);
        setClipStatus('The last-practiced time could not be saved.');
      });
      else persistSavedYouTubeLoops();
      persistLoopList();
    }
    savedClipName.value = savedLoop.name;
    fillLoopDetails(savedLoop);

    if (savedLoop.sourceType === 'audio') {
      button.disabled = true;
      setClipStatus('Loading saved audio...');
      try {
        const audioUrl = await cloudApi().getAudioUrl(savedLoop);
        if (uid !== currentUid) return;
        clipVideoUrl.value = '';
        loadLocalAudio(audioUrl, savedLoop.name, {
          storedLoop: savedLoop,
          savedLoopId: personal ? savedLoop.id : '',
          bounds: { start: 0, end: savedLoop.endSeconds - savedLoop.startSeconds }
        });
        clipWorkspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        console.error('Unable to load saved audio loop.', error);
        setClipStatus('The saved audio could not be loaded. Check your connection and try again.');
      } finally {
        button.disabled = false;
      }
      return;
    }

    clipVideoUrl.value = `https://www.youtube.com/watch?v=${savedLoop.videoId}`;
    await loadYouTubeClip(savedLoop.videoId, {
      startSeconds: savedLoop.startSeconds,
      endSeconds: savedLoop.endSeconds,
      savedLoopId: personal ? savedLoop.id : ''
    });
    clipWorkspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  saveYouTubeLoopButton.addEventListener('click', async () => {
    const bounds = readClipBounds();
    if (!activeClipSource || !bounds) {
      setClipStatus('Set valid start and end times before saving this loop.');
      return;
    }

    const isAudio = activeClipSource === 'audio';
    if (isAudio && !usingCloud()) {
      setClipStatus('Sign in to save audio loops to your account.');
      return;
    }
    if (isAudio && bounds.end - bounds.start > maxSavedAudioSeconds) {
      setClipStatus(`Audio loops saved to your account can be up to ${maxSavedAudioSeconds} seconds long.`);
      return;
    }

    const existingLoop = savedYouTubeLoops.find((loop) => loop.id === selectedSavedLoopId);
    const name = savedClipName.value.trim()
      || existingLoop?.name
      || `Phrase ${formatClipTime(bounds.start)} - ${formatClipTime(bounds.end)}`;
    const now = Date.now();
    const savedLoop = {
      id: existingLoop?.id || (window.crypto?.randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2)}`),
      name,
      sourceType: isAudio ? 'audio' : 'youtube',
      songName: savedSongName.value.trim().slice(0, 100),
      raagName: savedRaagName.value.trim().slice(0, 60),
      notes: savedNotes.value.trim().slice(0, 5000),
      artist: savedArtist.value.trim().slice(0, 100),
      taal: savedTaal.value.trim().slice(0, 40),
      laya: savedLaya.value,
      section: savedSection.value,
      tags: [...new Set(savedTags.value.split(',').map((tag) => tag.trim().replace(/^#/, '').slice(0, 30)).filter(Boolean))].slice(0, 10),
      createdAt: existingLoop?.createdAt || now,
      updatedAt: now,
      lastPracticedAt: existingLoop?.lastPracticedAt || now
    };

    saveYouTubeLoopButton.disabled = true;
    try {
      let clipAudio = null;
      if (isAudio) {
        setClipStatus('Preparing audio clip...');
        const sourceBlob = localAudioBlob || await cloudApi().getAudioBlob(localAudioLoop);
        clipAudio = await encodeWavClip(sourceBlob, bounds.start, bounds.end);
        savedLoop.startSeconds = 0;
        savedLoop.endSeconds = clipAudio.duration;
        savedLoop.sourceName = existingLoop?.sourceName || localAudioName.slice(0, 120);
      } else {
        savedLoop.videoId = currentVideoId;
        savedLoop.startSeconds = bounds.start;
        savedLoop.endSeconds = bounds.end;
      }

      if (usingCloud()) {
        const stored = await cloudApi().save(savedLoop, clipAudio?.blob || null);
        Object.assign(savedLoop, stored);
      } else {
        savedYouTubeLoops = [savedLoop, ...savedYouTubeLoops.filter((loop) => loop.id !== savedLoop.id)];
        if (!persistSavedYouTubeLoops()) return;
      }
    } catch (error) {
      console.error('Unable to save loop.', error);
      setClipStatus(isAudio ? 'The audio loop could not be saved. The browser may not be able to read this file, or the connection failed.' : 'The loop could not be saved. Try again.');
      return;
    } finally {
      updateSaveYouTubeLoopButton();
    }

    savedYouTubeLoops = [savedLoop, ...savedYouTubeLoops.filter((loop) => loop.id !== savedLoop.id)];
    selectedSavedLoopId = savedLoop.id;
    savedClipName.value = name;
    renderSavedYouTubeLoops();
    if (featuredAdmin) renderFeaturedLoops();
    setClipStatus(usingCloud() ? `Saved "${name}" to your account.` : `Saved "${name}" in this browser.`);
  });

  [clipStartTime, clipEndTime].forEach((input) => input.addEventListener('input', updateSaveYouTubeLoopButton));
  window.addEventListener('hcmai-auth-state-changed', (event) => {
    switchSavedLoopOwner(event.detail?.uid || null);
    refreshFeaturedLoops();
  });
  window.addEventListener('hcmai-inline-player-opening', stopClipPlayback);
  window.addEventListener('hcmai-cloud-loops-ready', () => {
    refreshCloudLoops();
    refreshFeaturedLoops();
  });
  renderSavedYouTubeLoops();

  markClipStart.addEventListener('click', () => {
    clipStartTime.value = formatClipTime(getClipCurrentTime());
    updateSaveYouTubeLoopButton();
    setClipStatus('Clip start set to the current position.');
  });

  markClipEnd.addEventListener('click', () => {
    clipEndTime.value = formatClipTime(getClipCurrentTime());
    updateSaveYouTubeLoopButton();
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

  const loadRaagLoop = async (raagId, loopId) => {
    setClipStatus('Loading practice phrase...');
    try {
      if (!window.hcmaiCloudLoops) {
        await new Promise((resolve) => window.addEventListener('hcmai-cloud-loops-ready', resolve, { once: true }));
      }
      const loop = await window.hcmaiCloudLoops.getRaagLoop(raagId, loopId);
      if (!loop) {
        setClipStatus('This practice phrase is not available.');
        return;
      }
      savedClipName.value = loop.title || '';
      fillLoopDetails(loop);
      if (loop.sourceType === 'audio') {
        const audioUrl = await window.hcmaiCloudLoops.getAudioUrl(loop);
        clipVideoUrl.value = '';
        loadLocalAudio(audioUrl, loop.title || 'Practice phrase', {
          storedLoop: loop,
          bounds: { start: 0, end: loop.endSeconds - loop.startSeconds }
        });
      } else {
        clipVideoUrl.value = `https://www.youtube.com/watch?v=${loop.videoId}`;
        await loadYouTubeClip(loop.videoId, { startSeconds: loop.startSeconds, endSeconds: loop.endSeconds });
      }
    } catch (error) {
      console.error('Unable to load Raag practice phrase.', error);
      setClipStatus('This practice phrase could not be loaded. You may need to sign in.');
    }
  };

  const practiceParams = new URLSearchParams(window.location.search);
  const requestedRaagLoop = (practiceParams.get('raagLoop') || '').match(/^([\w-]+)\/([\w-]+)$/);
  if (requestedRaagLoop) loadRaagLoop(requestedRaagLoop[1], requestedRaagLoop[2]);
  const requestedVideoId = practiceParams.get('video') || '';
  const requestedStart = Number(practiceParams.get('start'));
  const requestedEnd = Number(practiceParams.get('end'));
  if (/^[\w-]{11}$/.test(requestedVideoId)
    && Number.isSafeInteger(requestedStart)
    && Number.isSafeInteger(requestedEnd)
    && requestedStart >= 0
    && requestedEnd > requestedStart) {
    clipVideoUrl.value = `https://www.youtube.com/watch?v=${requestedVideoId}`;
    savedClipName.value = practiceParams.get('title') || '';
    loadYouTubeClip(requestedVideoId, { startSeconds: requestedStart, endSeconds: requestedEnd });
  }
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
