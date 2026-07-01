(function() {
  const emptyState = document.getElementById('emptyState');
  const activeStage = document.getElementById('activeStage');
  const parkHereBtn = document.getElementById('parkHereBtn');
  const sheetBackdrop = document.getElementById('sheetBackdrop');
  const durationGrid = document.getElementById('durationGrid');
  const customMinsWrap = document.getElementById('customMinsWrap');
  const customMins = document.getElementById('customMins');
  const noteInput = document.getElementById('noteInput');
  const confirmParkBtn = document.getElementById('confirmParkBtn');
  const cancelSheetBtn = document.getElementById('cancelSheetBtn');
  const dialProgress = document.getElementById('dialProgress');
  const dialTime = document.getElementById('dialTime');
  const dialLabel = document.getElementById('dialLabel');
  const flipFlag = document.getElementById('flipFlag');
  const spotNote = document.getElementById('spotNote');
  const spotDistance = document.getElementById('spotDistance');
  const directionsBtn = document.getElementById('directionsBtn');
  const imBackBtn = document.getElementById('imBackBtn');
  const liveStatus = document.getElementById('liveStatus');
  const historyToggle = document.getElementById('historyToggle');
  const historyList = document.getElementById('historyList');
  const historyChevron = document.getElementById('historyChevron');

  const RADIUS = 86;
  const CIRC = 2 * Math.PI * RADIUS;
  dialProgress.style.strokeDasharray = CIRC;

  let selectedMins = null;
  let currentSpot = null; // { lat, lng, note, parkedAt, expiresAt, durationMins }
  let tickTimer = null;
  let watchId = null;

  // ---------- Storage helpers (localStorage) ----------
  async function saveCurrentSpot(spot) {
    try { localStorage.setItem('current-spot', JSON.stringify(spot)); }
    catch (e) { console.error('save current spot failed', e); }
  }
  async function clearCurrentSpotStorage() {
    try { localStorage.removeItem('current-spot'); } catch (e) { /* may not exist */ }
  }
  async function loadCurrentSpot() {
    try {
      const raw = localStorage.getItem('current-spot');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  async function pushHistory(entry) {
    try {
      const raw = localStorage.getItem('history');
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(entry);
      localStorage.setItem('history', JSON.stringify(list.slice(0, 25)));
    } catch (e) { console.error('history save failed', e); }
  }
  async function loadHistory() {
    try {
      const raw = localStorage.getItem('history');
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  // ---------- Sheet ----------
  parkHereBtn.addEventListener('click', openSheet);
  cancelSheetBtn.addEventListener('click', closeSheet);
  sheetBackdrop.addEventListener('click', (e) => { if (e.target === sheetBackdrop) closeSheet(); });

  function openSheet() {
    selectedMins = null;
    noteInput.value = '';
    customMins.value = '';
    customMinsWrap.style.display = 'none';
    document.querySelectorAll('.duration-opt').forEach(b => b.classList.remove('selected'));
    sheetBackdrop.classList.add('open');
  }
  function closeSheet() { sheetBackdrop.classList.remove('open'); }

  durationGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.duration-opt');
    if (!btn) return;
    document.querySelectorAll('.duration-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    if (btn.dataset.mins === 'custom') {
      selectedMins = 'custom';
      customMinsWrap.style.display = 'block';
      customMins.focus();
    } else {
      selectedMins = parseInt(btn.dataset.mins, 10);
      customMinsWrap.style.display = 'none';
    }
  });

  confirmParkBtn.addEventListener('click', async () => {
    let mins = selectedMins;
    if (mins === 'custom') {
      const v = parseInt(customMins.value, 10);
      if (!v || v <= 0) { customMins.focus(); return; }
      mins = v;
    }
    if (!mins) { return; }

    confirmParkBtn.textContent = 'Locating…';
    confirmParkBtn.disabled = true;

    const note = noteInput.value.trim();
    const now = Date.now();

    const finalize = (lat, lng) => {
      currentSpot = {
        lat, lng,
        note: note || 'Parking spot',
        parkedAt: now,
        durationMins: mins,
        expiresAt: now + mins * 60000
      };
      saveCurrentSpot(currentSpot);
      confirmParkBtn.textContent = 'Drop Pin';
      confirmParkBtn.disabled = false;
      closeSheet();
      enterActiveState();
    };

    if (!navigator.geolocation) {
      finalize(null, null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => finalize(pos.coords.latitude, pos.coords.longitude),
      () => finalize(null, null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  // ---------- Active state ----------
  function enterActiveState() {
    emptyState.style.display = 'none';
    activeStage.style.display = 'flex';
    spotNote.textContent = currentSpot.note;
    flipFlag.classList.remove('show');
    startTicking();
    startLocationWatch();
  }

  function enterEmptyState() {
    activeStage.style.display = 'none';
    emptyState.style.display = 'flex';
    stopTicking();
    stopLocationWatch();
  }

  function startTicking() {
    stopTicking();
    tick();
    tickTimer = setInterval(tick, 1000);
  }
  function stopTicking() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }

  function tick() {
    if (!currentSpot) return;
    const now = Date.now();
    const totalMs = currentSpot.durationMins * 60000;
    const remainingMs = currentSpot.expiresAt - now;
    const frac = Math.max(0, Math.min(1, remainingMs / totalMs));

    dialProgress.style.strokeDashoffset = CIRC * (1 - frac);

    let color = '#6FA287'; // safe green
    if (frac <= 0) color = 'var(--curb-red)';
    else if (frac < 0.2) color = 'var(--curb-red)';
    else if (frac < 0.5) color = 'var(--meter-yellow)';
    dialProgress.style.stroke = color;

    if (remainingMs <= 0) {
      dialTime.textContent = '00:00';
      dialLabel.textContent = 'time\u2019s up';
      flipFlag.classList.add('show');
    } else {
      const totalSec = Math.ceil(remainingMs / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      dialTime.textContent = h > 0
        ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
        : `${m}:${String(s).padStart(2,'0')}`;
      dialLabel.textContent = 'remaining';
      flipFlag.classList.remove('show');
    }
  }

  // ---------- Distance / directions ----------
  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
  function formatDistance(meters) {
    if (meters < 1000) return `${Math.round(meters)} m away`;
    return `${(meters/1000).toFixed(1)} km away`;
  }

  function startLocationWatch() {
    stopLocationWatch();
    if (!currentSpot || currentSpot.lat === null || !navigator.geolocation) {
      spotDistance.textContent = 'Location unavailable';
      liveStatus.textContent = 'GPS wasn\u2019t available when you parked \u2014 timer still works.';
      return;
    }
    liveStatus.textContent = '';
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const d = haversineMeters(pos.coords.latitude, pos.coords.longitude, currentSpot.lat, currentSpot.lng);
        spotDistance.textContent = formatDistance(d);
      },
      (err) => {
        spotDistance.textContent = 'Location unavailable';
        liveStatus.textContent = 'Can\u2019t access live location right now.';
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }
  function stopLocationWatch() {
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  directionsBtn.addEventListener('click', () => {
    if (!currentSpot || currentSpot.lat === null) {
      liveStatus.textContent = 'No saved location for this spot to route to.';
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${currentSpot.lat},${currentSpot.lng}`;
    window.open(url, '_blank');
  });

  imBackBtn.addEventListener('click', async () => {
    if (!currentSpot) return;
    await pushHistory({
      note: currentSpot.note,
      parkedAt: currentSpot.parkedAt,
      returnedAt: Date.now(),
      durationMins: currentSpot.durationMins
    });
    await clearCurrentSpotStorage();
    currentSpot = null;
    enterEmptyState();
    renderHistory();
  });

  // ---------- History ----------
  historyToggle.addEventListener('click', () => {
    const open = historyList.classList.toggle('open');
    historyChevron.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
    if (open) renderHistory();
  });

  function fmtWhen(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' \u00b7 ' +
           d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  async function renderHistory() {
    const list = await loadHistory();
    if (!list.length) {
      historyList.innerHTML = '<div class="history-empty">No past spots yet.</div>';
      return;
    }
    historyList.innerHTML = list.map(item => `
      <div class="history-item">
        <div>
          <div class="h-note">${escapeHtml(item.note)}</div>
          <div class="h-meta">${fmtWhen(item.parkedAt)} \u00b7 ${item.durationMins} min meter</div>
        </div>
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Register service worker (offline support) ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.log('SW registration failed', e));
    });
  }

  // ---------- Init ----------
  (async function init() {
    const saved = await loadCurrentSpot();
    if (saved) {
      currentSpot = saved;
      enterActiveState();
    } else {
      enterEmptyState();
    }
    renderHistory();
  })();
})();