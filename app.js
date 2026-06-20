/* ==========================================================================
   Band's Turner - Core Application JavaScript
   ========================================================================== */

// --- PDF.js Global Configuration ---
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// --- Global App State ---
const State = {
  db: null,
  scores: [],
  activeScore: null,
  pdfDoc: null,
  
  // View options
  viewMode: '1page', // '1page' or '2page'
  zoomScale: 1.0,    // 100% = 1.0
  currentPage: 1,
  totalPages: 1,
  
  // Settings for active score
  settings: {
    bpm: 120,
    timeSignature: 4, // Numerator of time signature (e.g., 4 for 4/4)
    countdown: 5,     // in seconds
    instrument: 'guitar', // 'guitar', 'bass', or 'standard'
    measuresUniform: true,
    uniformMeasures: 16,
    individualMeasures: [] // [page1_measures, page2_measures, ...]
  },
  
  // Playback engine
  playback: {
    status: 'idle', // 'idle', 'countdown', 'playing', 'paused'
    timerId: null,
    startTime: 0,
    pausedTime: 0,
    elapsedBeforePause: 0,
    countdownRemaining: 0,
    countdownTimerId: null,
    wakeLock: null
  },
  
  // Tap tempo state
  tapTimes: []
};

// --- DOM Elements ---
const DOM = {
  // Sidebar elements
  uploadArea: document.getElementById('upload-area'),
  fileInput: document.getElementById('file-input'),
  uploadTrigger: document.getElementById('upload-trigger'),
  searchInput: document.getElementById('search-input'),
  filterFavBtn: document.getElementById('filter-fav-btn'),
  musicList: document.getElementById('music-list'),
  emptyState: document.getElementById('empty-state'),
  sidebar: document.getElementById('sidebar'),
  
  // Workspace elements
  workspace: document.getElementById('workspace'),
  welcomeScreen: document.getElementById('welcome-screen'),
  viewerLayout: document.getElementById('viewer-layout'),
  activeScoreTitle: document.getElementById('active-score-title'),
  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  btnView1Page: document.getElementById('btn-view-1page'),
  btnView2Page: document.getElementById('btn-view-2page'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnZoomReset: document.getElementById('btn-zoom-reset'),
  zoomPercent: document.getElementById('zoom-percent'),
  canvasViewport: document.getElementById('canvas-viewport'),
  canvasContainer: document.getElementById('canvas-container'),
  navZoneLeft: document.getElementById('nav-zone-left'),
  navZoneRight: document.getElementById('nav-zone-right'),
  blinkOverlay: document.getElementById('blink-overlay'),
  
  // Playback HUD
  playbackHud: document.getElementById('playback-hud'),
  hudProgressFill: document.getElementById('hud-progress-fill'),
  btnPrevPage: document.getElementById('btn-prev-page'),
  btnNextPage: document.getElementById('btn-next-page'),
  btnPlayTrigger: document.getElementById('btn-play-trigger'),
  playSvg: document.getElementById('play-svg'),
  pauseSvg: document.getElementById('pause-svg'),
  hudTempoBadge: document.getElementById('hud-tempo-badge'),
  hudTimeRemain: document.getElementById('hud-time-remain'),
  currentPageSpan: document.getElementById('current-page'),
  totalPagesSpan: document.getElementById('total-pages'),
  
  // Right Settings Panel
  settingsPanel: document.getElementById('settings-panel'),
  btnToggleSettings: document.getElementById('btn-toggle-settings'),
  inputBpm: document.getElementById('input-bpm'),
  rangeBpm: document.getElementById('range-bpm'),
  btnTapTempo: document.getElementById('btn-tap-tempo'),
  selectTimeSignature: document.getElementById('select-time-signature'),
  selectInstrument: document.getElementById('select-instrument'),
  inputApiKey: document.getElementById('input-api-key'),
  btnSaveApiKey: document.getElementById('btn-save-api-key'),
  apiKeyStatus: document.getElementById('api-key-status'),
  chkMeasuresUniform: document.getElementById('chk-measures-uniform'),
  uniformMeasuresContainer: document.getElementById('uniform-measures-container'),
  inputMeasuresUniform: document.getElementById('input-measures-uniform'),
  btnScanMeasures: document.getElementById('btn-scan-measures'),
  individualMeasuresContainer: document.getElementById('individual-measures-container'),
  measuresGridInputs: document.getElementById('measures-grid-inputs'),
  timingSummaryList: document.getElementById('timing-summary-list'),
  
  // Countdown Overlay
  countdownOverlay: document.getElementById('countdown-overlay'),
  countdownNumber: document.getElementById('countdown-number'),
  btnCancelCountdown: document.getElementById('btn-cancel-countdown')
};

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  setupEventListeners();
  await loadScoresList();
  
  // Load global Gemini API key
  const savedApiKey = localStorage.getItem('gemini_api_key') || '';
  if (DOM.inputApiKey) {
    DOM.inputApiKey.value = savedApiKey;
  }
  
  // Sync URL or local storage for last opened score if possible
  const lastOpened = localStorage.getItem('last_opened_score_id');
  if (lastOpened) {
    const score = State.scores.find(s => s.id === lastOpened);
    if (score) selectScore(score);
  }
});

// --- 1. INDEXEDDB DATABASE MANAGER ---
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bands_turner_db', 1);
    
    request.onerror = (e) => {
      console.error('IndexedDB open error:', e);
      reject(e);
    };
    
    request.onsuccess = (e) => {
      State.db = e.target.result;
      resolve(State.db);
    };
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('scores')) {
        db.createObjectStore('scores', { keyPath: 'id' });
      }
    };
  });
}

function saveScoreToDB(score) {
  return new Promise((resolve, reject) => {
    const transaction = State.db.transaction(['scores'], 'readwrite');
    const store = transaction.objectStore('scores');
    
    // Store arraybuffer/blob directly
    const request = store.put(score);
    
    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e);
  });
}

function getScoreFromDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = State.db.transaction(['scores'], 'readonly');
    const store = transaction.objectStore('scores');
    const request = store.get(id);
    
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e);
  });
}

function deleteScoreFromDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = State.db.transaction(['scores'], 'readwrite');
    const store = transaction.objectStore('scores');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e);
  });
}

function getAllScoresFromDB() {
  return new Promise((resolve, reject) => {
    const transaction = State.db.transaction(['scores'], 'readonly');
    const store = transaction.objectStore('scores');
    const request = store.getAll();
    
    request.onsuccess = (e) => {
      // Return metadata only for performance first, or all.
      // Since it's client-side, we get everything but we can omit fileData for light memory listing
      resolve(e.target.result || []);
    };
    request.onerror = (e) => reject(e);
  });
}

// --- 2. UPLOAD & LIST MANAGMENT ---
async function loadScoresList() {
  try {
    const scores = await getAllScoresFromDB();
    // Sort: favorites first, then created date desc
    scores.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return b.createdAt - a.createdAt;
    });
    
    State.scores = scores;
    renderScoresList();
  } catch (err) {
    console.error('Failed to load score list', err);
  }
}

function renderScoresList(filterText = '', onlyFavorites = false) {
  DOM.musicList.innerHTML = '';
  
  const filtered = State.scores.filter(score => {
    const matchText = score.name.toLowerCase().includes(filterText.toLowerCase());
    const matchFav = onlyFavorites ? score.isFavorite : true;
    return matchText && matchFav;
  });
  
  if (filtered.length === 0) {
    DOM.emptyState.classList.remove('hidden');
    DOM.musicList.classList.add('hidden');
    return;
  }
  
  DOM.emptyState.classList.add('hidden');
  DOM.musicList.classList.remove('hidden');
  
  filtered.forEach(score => {
    const li = document.createElement('li');
    li.className = `music-item ${State.activeScore && State.activeScore.id === score.id ? 'active' : ''}`;
    li.dataset.id = score.id;
    
    // Format date
    const dateStr = new Date(score.createdAt).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric'
    });
    
    li.innerHTML = `
      <div class="music-item-meta">
        <span class="music-title" title="${score.name}">${score.name}</span>
        <div class="music-actions">
          <button class="btn-item-action fav ${score.isFavorite ? 'is-fav' : ''}" title="즐겨찾기">
            <svg viewBox="0 0 24 24" fill="${score.isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <button class="btn-item-action edit" title="이름 변경">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
            </svg>
          </button>
          <button class="btn-item-action delete" title="삭제">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
      <div class="music-info">
        <span>등록일: ${dateStr}</span>
      </div>
    `;
    
    // Item Click opens score
    li.addEventListener('click', (e) => {
      // Don't trigger if clicked actions
      if (e.target.closest('.btn-item-action')) return;
      selectScore(score);
    });
    
    // Action: Favorite
    li.querySelector('.fav').addEventListener('click', async (e) => {
      e.stopPropagation();
      score.isFavorite = !score.isFavorite;
      await saveScoreToDB(score);
      await loadScoresList();
      // Keep active visually
      if (State.activeScore && State.activeScore.id === score.id) {
        State.activeScore.isFavorite = score.isFavorite;
      }
    });
    
    // Action: Edit Name
    li.querySelector('.edit').addEventListener('click', async (e) => {
      e.stopPropagation();
      const newName = prompt('새로운 악보 이름을 입력하세요:', score.name);
      if (newName && newName.trim() !== '') {
        score.name = newName.trim();
        await saveScoreToDB(score);
        await loadScoresList();
        if (State.activeScore && State.activeScore.id === score.id) {
          DOM.activeScoreTitle.textContent = score.name;
        }
      }
    });
    
    // Action: Delete
    li.querySelector('.delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`'${score.name}' 악보를 정말 삭제하시겠습니까?`)) {
        await deleteScoreFromDB(score.id);
        // Clear local storage settings too
        localStorage.removeItem(`score_settings_${score.id}`);
        
        if (State.activeScore && State.activeScore.id === score.id) {
          State.activeScore = null;
          State.pdfDoc = null;
          localStorage.removeItem('last_opened_score_id');
          DOM.welcomeScreen.classList.remove('hidden');
          DOM.viewerLayout.classList.add('hidden');
        }
        await loadScoresList();
      }
    });
    
    DOM.musicList.appendChild(li);
  });
}

// Handle file uploading
async function handleFileUpload(file) {
  if (!file || file.type !== 'application/pdf') {
    alert('PDF 파일만 업로드할 수 있습니다.');
    return;
  }
  
  try {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    
    reader.onload = async (e) => {
      const arrayBuffer = e.target.result;
      const scoreId = 'score_' + Date.now();
      
      const newScore = {
        id: scoreId,
        name: file.name.replace(/\.[^/.]+$/, ""), // strip extension
        fileData: arrayBuffer,
        isFavorite: false,
        createdAt: Date.now()
      };
      
      await saveScoreToDB(newScore);
      await loadScoresList();
      selectScore(newScore);
    };
  } catch (err) {
    console.error('File reading failed', err);
    alert('파일을 처리하는 도중 에러가 발생했습니다.');
  }
}

// --- 3. SCORE SELECTION & RENDER ENGINE ---
async function selectScore(score) {
  if (State.playback.status !== 'idle') {
    stopPlayback();
  }
  
  State.activeScore = score;
  localStorage.setItem('last_opened_score_id', score.id);
  
  // Highlight in list
  document.querySelectorAll('.music-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === score.id);
  });
  
  // Show viewer layout
  DOM.welcomeScreen.classList.add('hidden');
  DOM.viewerLayout.classList.remove('hidden');
  DOM.activeScoreTitle.textContent = score.name;
  
  // Load Settings
  loadScoreSettings(score.id);
  
  // Reset navigation
  State.currentPage = 1;
  State.zoomScale = parseFloat(localStorage.getItem(`zoom_${score.id}`)) || 1.0;
  updateZoomUI();
  
  // Show spinner
  DOM.canvasContainer.innerHTML = '<div class="canvas-loading"><div class="spinner"></div>악보 로딩 중...</div>';
  
  try {
    // Load PDF with disableFontFace: true to prevent canvas tainting under file:/// protocol
    const loadingTask = pdfjsLib.getDocument({
      data: score.fileData,
      disableFontFace: true
    });
    State.pdfDoc = await loadingTask.promise;
    State.totalPages = State.pdfDoc.numPages;
    DOM.totalPagesSpan.textContent = State.totalPages;
    
    // Initialize or adjust individual measures array
    if (State.settings.individualMeasures.length !== State.totalPages) {
      // Fill missing slots with uniformMeasures or default (8)
      const currentArr = State.settings.individualMeasures;
      const defaultVal = State.settings.uniformMeasures;
      State.settings.individualMeasures = Array.from(
        { length: State.totalPages }, 
        (_, i) => currentArr[i] !== undefined ? currentArr[i] : defaultVal
      );
    }
    
    const isNewScore = !localStorage.getItem(`score_settings_${score.id}`);

    renderMeasuresGridInputs();
    updateTimingCalculations();
    
    // Render current pages
    await renderViewerPages();
    
    // Automatically trigger AI scanning for new uploads
    if (isNewScore) {
      setTimeout(() => {
        scanScoreMeasures(true);
      }, 600);
    }
    
  } catch (err) {
    console.error('Error loading PDF document:', err);
    DOM.canvasContainer.innerHTML = '<div style="color: var(--color-warning);">PDF 로딩 중 에러가 발생했습니다.</div>';
  }
}

// Renders the page(s) on the canvas
async function renderViewerPages() {
  if (!State.pdfDoc) return;
  
  DOM.canvasContainer.innerHTML = '';
  DOM.currentPageSpan.textContent = State.currentPage;
  
  // Single vs Dual Page mode
  const pagesToRender = [State.currentPage];
  if (State.viewMode === '2page' && State.currentPage + 1 <= State.totalPages) {
    pagesToRender.push(State.currentPage + 1);
  }
  
  DOM.canvasContainer.className = `canvas-container ${State.viewMode === '1page' ? 'single-layout' : 'double-layout'}`;
  
  for (const pageNum of pagesToRender) {
    try {
      const page = await State.pdfDoc.getPage(pageNum);
      
      // Calculate responsive viewport scale
      // Get base viewport at scale 1
      const baseViewport = page.getViewport({ scale: 1.0 });
      
      // Calculate matching scale based on client viewport height/width
      const containerHeight = Math.max(200, (DOM.canvasViewport.clientHeight || 800) - 48); // padding
      const containerWidth = Math.max(200, (DOM.canvasViewport.clientWidth || 1000) - 48);
      
      let scale = 1.0;
      if (State.viewMode === '1page') {
        // Fit single page to viewport height primarily, then width
        const scaleH = containerHeight / baseViewport.height;
        const scaleW = containerWidth / baseViewport.width;
        scale = Math.min(scaleH, scaleW);
      } else {
        // Fit two pages side-by-side
        const scaleH = containerHeight / baseViewport.height;
        const scaleW = (containerWidth / 2 - 20) / baseViewport.width; // account for dual spacing
        scale = Math.min(scaleH, scaleW);
      }
      
      // Apply user zoom scale settings
      const finalScale = scale * State.zoomScale;
      
      const viewport = page.getViewport({ scale: finalScale });
      
      const canvas = document.createElement('canvas');
      canvas.id = `pdf-canvas-${pageNum}`;
      const context = canvas.getContext('2d');
      
      // Higher resolution rendering for crystal-clear text
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';
      
      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
      
      const renderContext = {
        canvasContext: context,
        transform: transform,
        viewport: viewport
      };
      
      DOM.canvasContainer.appendChild(canvas);
      await page.render(renderContext).promise;
      
    } catch (err) {
      console.error(`Error rendering page ${pageNum}:`, err);
    }
  }
  
  // Highlight currently playing/active row in timing list
  updateTimingRowsActiveHighlight();
}

function updateTimingRowsActiveHighlight() {
  document.querySelectorAll('.timing-row').forEach(row => {
    const pageNum = parseInt(row.dataset.page);
    if (State.viewMode === '1page') {
      row.classList.toggle('active', pageNum === State.currentPage);
    } else {
      row.classList.toggle('active', pageNum === State.currentPage || pageNum === State.currentPage + 1);
    }
  });
}

// --- 4. SONG SETTINGS & LOCAL STORAGE ---
function loadScoreSettings(scoreId) {
  const saved = localStorage.getItem(`score_settings_${scoreId}`);
  if (saved) {
    try {
      State.settings = JSON.parse(saved);
    } catch (e) {
      console.error('Error parsing settings', e);
      resetToDefaultSettings();
    }
  } else {
    resetToDefaultSettings();
  }
  
  // Update inputs to match loaded settings
  DOM.inputBpm.value = State.settings.bpm;
  DOM.rangeBpm.value = State.settings.bpm;
  DOM.selectTimeSignature.value = State.settings.timeSignature;
  DOM.selectInstrument.value = State.settings.instrument || 'guitar';
  
  DOM.chkMeasuresUniform.checked = State.settings.measuresUniform;
  DOM.inputMeasuresUniform.value = State.settings.uniformMeasures;
  
  if (State.settings.measuresUniform) {
    DOM.uniformMeasuresContainer.classList.remove('hidden');
    DOM.individualMeasuresContainer.classList.add('hidden');
  } else {
    DOM.uniformMeasuresContainer.classList.add('hidden');
    DOM.individualMeasuresContainer.classList.remove('hidden');
  }
  
  // Update HUD badge
  DOM.hudTempoBadge.textContent = `${State.settings.bpm} BPM`;
  
  // Countdown buttons highlight
  document.querySelectorAll('.btn-countdown').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.time) === State.settings.countdown);
  });
}

function resetToDefaultSettings() {
  State.settings = {
    bpm: 120,
    timeSignature: 4,
    countdown: 5,
    instrument: 'guitar',
    measuresUniform: true,
    uniformMeasures: 16,
    individualMeasures: []
  };
}

function saveScoreSettings() {
  if (!State.activeScore) return;
  localStorage.setItem(`score_settings_${State.activeScore.id}`, JSON.stringify(State.settings));
  DOM.hudTempoBadge.textContent = `${State.settings.bpm} BPM`;
  updateTimingCalculations();
}

function renderMeasuresGridInputs() {
  DOM.measuresGridInputs.innerHTML = '';
  
  for (let i = 1; i <= State.totalPages; i++) {
    const val = State.settings.individualMeasures[i - 1] || State.settings.uniformMeasures;
    
    const div = document.createElement('div');
    div.className = 'grid-item';
    div.innerHTML = `
      <span>P.${i}</span>
      <input type="number" min="1" max="64" value="${val}" data-page="${i}">
    `;
    
    div.querySelector('input').addEventListener('change', (e) => {
      const pageNum = parseInt(e.target.dataset.page);
      const measures = Math.max(1, parseInt(e.target.value) || 8);
      State.settings.individualMeasures[pageNum - 1] = measures;
      saveScoreSettings();
    });
    
    DOM.measuresGridInputs.appendChild(div);
  }
}

// Calculate stay time per page
// Formula: (Measures * Time Signature Numerator * 60) / BPM
function getPageStayTime(pageNum) {
  let measures = State.settings.uniformMeasures;
  if (!State.settings.measuresUniform) {
    measures = State.settings.individualMeasures[pageNum - 1] || State.settings.uniformMeasures;
  }
  
  const beats = measures * State.settings.timeSignature;
  const stayTimeSeconds = (beats * 60) / State.settings.bpm;
  return stayTimeSeconds;
}

function updateTimingCalculations() {
  DOM.timingSummaryList.innerHTML = '';
  
  if (!State.pdfDoc) return;
  
  for (let i = 1; i <= State.totalPages; i++) {
    const timeSec = getPageStayTime(i);
    const row = document.createElement('div');
    row.className = 'timing-row';
    row.dataset.page = i;
    row.innerHTML = `
      <span>페이지 ${i}</span>
      <span>${timeSec.toFixed(1)}초</span>
    `;
    DOM.timingSummaryList.appendChild(row);
  }
  
  updateTimingRowsActiveHighlight();
}

// --- 5. TAP TEMPO CALCULATION ---
function handleTapTempo() {
  const now = Date.now();
  
  // Clear taps if last tap was longer than 2.5 seconds ago
  if (State.tapTimes.length > 0 && now - State.tapTimes[State.tapTimes.length - 1] > 2500) {
    State.tapTimes = [];
  }
  
  State.tapTimes.push(now);
  
  // Flash Button visually
  DOM.btnTapTempo.classList.add('active-flash');
  setTimeout(() => DOM.btnTapTempo.classList.remove('active-flash'), 150);
  
  if (State.tapTimes.length >= 2) {
    // Calculate average gap in ms
    let totalGaps = 0;
    for (let i = 1; i < State.tapTimes.length; i++) {
      totalGaps += (State.tapTimes[i] - State.tapTimes[i - 1]);
    }
    const avgGapMs = totalGaps / (State.tapTimes.length - 1);
    
    // BPM = 60000 / avgGapMs
    const calculatedBpm = Math.round(60000 / avgGapMs);
    
    // Clamp between 40 and 250
    const clampedBpm = Math.min(250, Math.max(40, calculatedBpm));
    
    State.settings.bpm = clampedBpm;
    DOM.inputBpm.value = clampedBpm;
    DOM.rangeBpm.value = clampedBpm;
    saveScoreSettings();
  }
}

// --- 6. PLAYBACK ENGINE & TIMER LOGIC ---
function startPlayback() {
  if (!State.activeScore || !State.pdfDoc) return;
  
  // Don't start if already playing or counting down
  if (State.playback.status === 'playing' || State.playback.status === 'countdown') return;
  
  State.playback.status = 'countdown';
  DOM.playbackHud.classList.add('playback-running');
  DOM.playSvg.classList.add('hidden');
  DOM.pauseSvg.classList.remove('hidden');
  
  // Request Wake Lock to prevent screen sleep
  requestWakeLock();
  
  // Countdown phase
  State.playback.countdownRemaining = State.settings.countdown;
  DOM.countdownOverlay.classList.remove('hidden');
  DOM.countdownNumber.textContent = State.playback.countdownRemaining;
  
  State.playback.countdownTimerId = setInterval(() => {
    State.playback.countdownRemaining--;
    
    if (State.playback.countdownRemaining <= 0) {
      clearInterval(State.playback.countdownTimerId);
      DOM.countdownOverlay.classList.add('hidden');
      
      // Start actual playback from Page 1
      State.currentPage = 1;
      renderViewerPages();
      
      State.playback.status = 'playing';
      State.playback.startTime = Date.now();
      State.playback.pausedTime = 0;
      State.playback.elapsedBeforePause = 0;
      
      runPlaybackLoop();
    } else {
      DOM.countdownNumber.textContent = State.playback.countdownRemaining;
    }
  }, 1000);
}

function pausePlayback() {
  if (State.playback.status !== 'playing') return;
  
  State.playback.status = 'paused';
  DOM.playSvg.classList.remove('hidden');
  DOM.pauseSvg.classList.add('hidden');
  
  // Save elapsed time
  State.playback.elapsedBeforePause = Date.now() - State.playback.startTime;
  
  // Cancel playback loop request
  if (State.playback.timerId) {
    cancelAnimationFrame(State.playback.timerId);
    State.playback.timerId = null;
  }
}

function resumePlayback() {
  if (State.playback.status !== 'paused') return;
  
  State.playback.status = 'playing';
  DOM.playSvg.classList.add('hidden');
  DOM.pauseSvg.classList.remove('hidden');
  
  // Recalculate start time shifting by elapsed time
  State.playback.startTime = Date.now() - State.playback.elapsedBeforePause;
  
  runPlaybackLoop();
}

function stopPlayback() {
  // Clear any running timers
  if (State.playback.countdownTimerId) {
    clearInterval(State.playback.countdownTimerId);
    State.playback.countdownTimerId = null;
  }
  
  if (State.playback.timerId) {
    cancelAnimationFrame(State.playback.timerId);
    State.playback.timerId = null;
  }
  
  State.playback.status = 'idle';
  DOM.playbackHud.classList.remove('playback-running');
  DOM.playSvg.classList.remove('hidden');
  DOM.pauseSvg.classList.add('hidden');
  DOM.countdownOverlay.classList.add('hidden');
  DOM.blinkOverlay.classList.remove('blink-active');
  
  DOM.hudProgressFill.style.width = '0%';
  DOM.hudTimeRemain.textContent = '다음 페이지까지: --초';
  
  // Release wake lock
  releaseWakeLock();
}

// Main Playback Loop using requestAnimationFrame for accuracy
function runPlaybackLoop() {
  if (State.playback.status !== 'playing') return;
  
  const elapsed = Date.now() - State.playback.startTime;
  
  // Compute how long the current view should stay on screen
  // If in 2-page mode, we calculate stay time based on the active rightmost page or max of the two pages
  let stayTimeSec = getPageStayTime(State.currentPage);
  if (State.viewMode === '2page' && State.currentPage + 1 <= State.totalPages) {
    // Both pages are visible, page turns when the duration for both is completed?
    // User PRD: calculations for each page. In 2-page mode, it renders P1 & P2 side-by-side.
    // It should turn to P3 & P4 after the time for *both* pages is complete (i.e. P1 time + P2 time),
    // OR we can make it step 1 page at a time (P1/P2 -> P2/P3 -> P3/P4), meaning each page-slide happens
    // after the time calculated for the leftmost page.
    // Let's implement the standard: Page turns 2 pages at a time (P1/P2 -> P3/P4).
    // The duration is the sum of P1 + P2 stay time. This is extremely intuitive because
    // the user needs to read both pages before they flip.
    const page2Sec = getPageStayTime(State.currentPage + 1);
    stayTimeSec = stayTimeSec + page2Sec;
  }
  
  const targetTimeMs = stayTimeSec * 1000;
  
  // Progress Bar
  const progressPercent = Math.min(100, (elapsed / targetTimeMs) * 100);
  DOM.hudProgressFill.style.width = `${progressPercent}%`;
  
  // Time Remaining
  const remainingSec = Math.max(0, (targetTimeMs - elapsed) / 1000);
  DOM.hudTimeRemain.textContent = `다음 페이지까지: ${remainingSec.toFixed(1)}초`;
  
  // 0.3s before turn: Blink Visual Alert
  if (targetTimeMs - elapsed <= 300 && targetTimeMs - elapsed > 0) {
    DOM.blinkOverlay.classList.add('blink-active');
  } else {
    DOM.blinkOverlay.classList.remove('blink-active');
  }
  
  // Time is up!
  if (elapsed >= targetTimeMs) {
    DOM.blinkOverlay.classList.remove('blink-active');
    
    // Page Turn Step
    const pageStep = State.viewMode === '1page' ? 1 : 2;
    const nextStartPage = State.currentPage + pageStep;
    
    if (nextStartPage <= State.totalPages) {
      State.currentPage = nextStartPage;
      renderViewerPages();
      
      // Reset page timer
      State.playback.startTime = Date.now();
    } else {
      // Completed last page
      stopPlayback();
      return;
    }
  }
  
  State.playback.timerId = requestAnimationFrame(runPlaybackLoop);
}

// Manual navigation
function prevPage() {
  if (!State.pdfDoc) return;
  const pageStep = State.viewMode === '1page' ? 1 : 2;
  const newPage = Math.max(1, State.currentPage - pageStep);
  
  if (newPage !== State.currentPage) {
    State.currentPage = newPage;
    renderViewerPages();
    
    // If playing, reset page timer
    if (State.playback.status === 'playing') {
      State.playback.startTime = Date.now();
    }
  }
}

function nextPage() {
  if (!State.pdfDoc) return;
  const pageStep = State.viewMode === '1page' ? 1 : 2;
  const newPage = State.currentPage + pageStep;
  
  if (newPage <= State.totalPages) {
    State.currentPage = newPage;
    renderViewerPages();
    
    // If playing, reset page timer
    if (State.playback.status === 'playing') {
      State.playback.startTime = Date.now();
    }
  } else {
    // If next is clicked at last page while playing, stop
    if (State.playback.status === 'playing') {
      stopPlayback();
    }
  }
}

// Prevent Screen Sleep (Wake Lock)
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      State.playback.wakeLock = await navigator.wakeLock.request('screen');
      console.log('Screen Wake Lock is active');
    } catch (err) {
      console.warn('Wake Lock request failed:', err.message);
    }
  }
}

function releaseWakeLock() {
  if (State.playback.wakeLock) {
    State.playback.wakeLock.release()
      .then(() => {
        State.playback.wakeLock = null;
        console.log('Screen Wake Lock released');
      });
  }
}

// --- 7. GUI / EVENT LISTENERS SETUP ---
function setupEventListeners() {
  // Sidebar toggling
  DOM.btnToggleSidebar.addEventListener('click', () => {
    DOM.sidebar.classList.toggle('collapsed');
  });
  
  // Settings Panel toggling
  DOM.btnToggleSettings.addEventListener('click', () => {
    DOM.settingsPanel.classList.toggle('collapsed');
  });
  
  // Upload actions
  DOM.uploadTrigger.addEventListener('click', () => DOM.fileInput.click());
  DOM.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });
  
  // Drag and Drop files
  DOM.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.uploadTrigger.style.borderColor = 'var(--color-accent)';
  });
  
  DOM.uploadArea.addEventListener('dragleave', () => {
    DOM.uploadTrigger.style.borderColor = 'var(--border-color)';
  });
  
  DOM.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.uploadTrigger.style.borderColor = 'var(--border-color)';
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });
  
  // Search filtering
  DOM.searchInput.addEventListener('input', (e) => {
    const favOnly = DOM.filterFavBtn.classList.contains('active');
    renderScoresList(e.target.value, favOnly);
  });
  
  DOM.filterFavBtn.addEventListener('click', () => {
    DOM.filterFavBtn.classList.toggle('active');
    const favOnly = DOM.filterFavBtn.classList.contains('active');
    renderScoresList(DOM.searchInput.value, favOnly);
  });
  
  // Settings Change Handlers
  DOM.inputBpm.addEventListener('change', (e) => {
    const val = Math.min(250, Math.max(40, parseInt(e.target.value) || 120));
    State.settings.bpm = val;
    DOM.inputBpm.value = val;
    DOM.rangeBpm.value = val;
    saveScoreSettings();
  });
  
  DOM.rangeBpm.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    State.settings.bpm = val;
    DOM.inputBpm.value = val;
    saveScoreSettings();
  });
  
  DOM.btnTapTempo.addEventListener('click', handleTapTempo);
  
  DOM.selectTimeSignature.addEventListener('change', (e) => {
    State.settings.timeSignature = parseInt(e.target.value);
    saveScoreSettings();
  });
  
  DOM.selectInstrument.addEventListener('change', (e) => {
    State.settings.instrument = e.target.value;
    saveScoreSettings();
  });
  
  DOM.btnSaveApiKey.addEventListener('click', () => {
    const key = DOM.inputApiKey.value.trim();
    localStorage.setItem('gemini_api_key', key);
    
    // Show status badge
    if (DOM.apiKeyStatus) {
      DOM.apiKeyStatus.style.display = 'inline';
      setTimeout(() => {
        DOM.apiKeyStatus.style.display = 'none';
      }, 2000);
    }
  });

  DOM.inputApiKey.addEventListener('input', (e) => {
    localStorage.setItem('gemini_api_key', e.target.value.trim());
  });
  
  // Countdown settings
  document.querySelectorAll('.btn-countdown').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const time = parseInt(e.target.dataset.time);
      State.settings.countdown = time;
      
      document.querySelectorAll('.btn-countdown').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      saveScoreSettings();
    });
  });
  
  // Measures Configuration
  DOM.chkMeasuresUniform.addEventListener('change', (e) => {
    State.settings.measuresUniform = e.target.checked;
    if (e.target.checked) {
      DOM.uniformMeasuresContainer.classList.remove('hidden');
      DOM.individualMeasuresContainer.classList.add('hidden');
    } else {
      DOM.uniformMeasuresContainer.classList.add('hidden');
      DOM.individualMeasuresContainer.classList.remove('hidden');
    }
    saveScoreSettings();
  });
  
  DOM.inputMeasuresUniform.addEventListener('change', (e) => {
    const val = Math.max(1, parseInt(e.target.value) || 8);
    State.settings.uniformMeasures = val;
    DOM.inputMeasuresUniform.value = val;
    
    // Sync all individual measures if uniform is changed
    if (State.pdfDoc) {
      State.settings.individualMeasures = State.settings.individualMeasures.map(() => val);
      renderMeasuresGridInputs();
    }
    saveScoreSettings();
  });
  
  DOM.btnScanMeasures.addEventListener('click', () => {
    scanScoreMeasures();
  });
  
  // View mode toggles
  DOM.btnView1Page.addEventListener('click', () => {
    if (State.viewMode === '2page') {
      State.viewMode = '1page';
      DOM.btnView1Page.classList.add('active');
      DOM.btnView2Page.classList.remove('active');
      renderViewerPages();
    }
  });
  
  DOM.btnView2Page.addEventListener('click', () => {
    if (State.viewMode === '1page') {
      State.viewMode = '2page';
      DOM.btnView1Page.classList.remove('active');
      DOM.btnView2Page.classList.add('active');
      renderViewerPages();
    }
  });
  
  // Zoom actions
  DOM.btnZoomIn.addEventListener('click', () => {
    State.zoomScale = Math.min(2.5, State.zoomScale + 0.1);
    updateZoomUI();
    renderViewerPages();
  });
  
  DOM.btnZoomOut.addEventListener('click', () => {
    State.zoomScale = Math.max(0.5, State.zoomScale - 0.1);
    updateZoomUI();
    renderViewerPages();
  });
  
  DOM.btnZoomReset.addEventListener('click', () => {
    State.zoomScale = 1.0;
    updateZoomUI();
    renderViewerPages();
  });
  
  // Playback control triggers
  DOM.btnPlayTrigger.addEventListener('click', () => {
    if (State.playback.status === 'idle') {
      startPlayback();
    } else if (State.playback.status === 'playing') {
      pausePlayback();
    } else if (State.playback.status === 'paused') {
      resumePlayback();
    }
  });
  
  DOM.btnCancelCountdown.addEventListener('click', stopPlayback);
  DOM.btnPrevPage.addEventListener('click', prevPage);
  DOM.btnNextPage.addEventListener('click', nextPage);
  
  // Side zone navigation clicks
  DOM.navZoneLeft.addEventListener('click', prevPage);
  DOM.navZoneRight.addEventListener('click', nextPage);
  
  // Global Hotkeys
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    
    if (e.code === 'Space') {
      e.preventDefault();
      DOM.btnPlayTrigger.click();
    } else if (e.code === 'ArrowLeft') {
      prevPage();
    } else if (e.code === 'ArrowRight') {
      nextPage();
    } else if (e.code === 'Escape') {
      if (State.playback.status === 'countdown') {
        stopPlayback();
      }
    }
  });
  
  // Touch / Swipe handling inside viewport
  let touchStartX = 0;
  let touchStartY = 0;
  
  DOM.canvasViewport.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });
  
  DOM.canvasViewport.addEventListener('touchend', (e) => {
    const diffX = e.changedTouches[0].screenX - touchStartX;
    const diffY = e.changedTouches[0].screenY - touchStartY;
    
    // Detect horizontal swipes primarily
    if (Math.abs(diffX) > 60 && Math.abs(diffY) < 100) {
      if (diffX > 0) {
        prevPage();
      } else {
        nextPage();
      }
    }
  }, { passive: true });
  
  // Single click on viewport canvas area pauses/resumes
  DOM.canvasViewport.addEventListener('click', (e) => {
    // Avoid if clicked on nav zones or overlays
    if (e.target.closest('.nav-zone') || e.target.closest('.playback-hud')) return;
    
    if (State.playback.status === 'playing') {
      pausePlayback();
    } else if (State.playback.status === 'paused') {
      resumePlayback();
    }
  });

  // Resize event listener to handle canvas adjustments dynamically
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (State.activeScore && State.pdfDoc) {
        renderViewerPages();
      }
    }, 150);
  });
}

function updateZoomUI() {
  DOM.zoomPercent.textContent = `${Math.round(State.zoomScale * 100)}%`;
  if (State.activeScore) {
    localStorage.setItem(`zoom_${State.activeScore.id}`, State.zoomScale);
  }
}

// --- 8. AI OMR SCANNING & MEASURE DETECTION ENGINE ---
async function scanScoreMeasures(silent = false) {
  if (!State.pdfDoc) return;
  
  const btn = DOM.btnScanMeasures;
  if (!btn) return;
  
  btn.classList.add('scanning');
  const span = btn.querySelector('span');
  const originalText = span ? span.textContent : '자동 마디 감지';
  if (span) span.textContent = '악보 분석 중...';
  
  const detectedList = [];
  const apiKey = localStorage.getItem('gemini_api_key') || '';
  
  try {
    for (let i = 1; i <= State.totalPages; i++) {
      if (!silent && span) {
        span.textContent = apiKey 
          ? `Gemini AI 해독 중... (${i}/${State.totalPages})` 
          : `로컬 CV 분석 중... (${i}/${State.totalPages})`;
      }
      
      const page = await State.pdfDoc.getPage(i);
      
      // Render page to a fixed-width offscreen canvas for OMR scanning
      const baseViewport = page.getViewport({ scale: 1.0 });
      const targetWidth = 1000; // Increased to 1000px for high clarity of numbers and lines
      const scale = targetWidth / baseViewport.width;
      const viewport = page.getViewport({ scale: scale });
      
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      
      let measures = 16; // default fallback
      
      if (apiKey) {
        // --- Gemini Multimodal API Scan ---
        try {
          const base64Data = canvas.toDataURL('image/jpeg').split(',')[1];
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
          
          const instrumentDesc = State.settings.instrument === 'guitar' 
            ? '6-line guitar TAB staff' 
            : (State.settings.instrument === 'bass' ? '4-line bass TAB staff' : '5-line standard notation staff');
          
          const promptText = `
This is a sheet music page. Your task is to count the total number of measures (마디) on this page.
Follow these strict instructions to count:
1. Locate all the horizontal music systems (lines of score).
2. Each system may contain a standard notation staff (5 lines with notes) and a TAB staff (${instrumentDesc} with numbers on the lines) stacked vertically together.
3. Look ONLY at the ${instrumentDesc} (TAB) staff. Ignore the standard notation staff entirely so you do NOT double-count.
4. Count the number of measures (the horizontal spaces separated by vertical bar lines '|') on each TAB staff.
5. Sum the count of measures across all TAB systems on this page.
6. Do NOT count lyrics, text, or chord symbols as measures.
7. Return ONLY a JSON object containing the field 'totalMeasures' with the integer value: {"totalMeasures": X}. Do not include markdown wraps or any other text.
`;

          const payload = {
            contents: [
              {
                parts: [
                  {
                    text: promptText
                  },
                  {
                    inlineData: {
                      mimeType: "image/jpeg",
                      data: base64Data
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json"
            }
          };
          
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          
          if (!response.ok) {
            throw new Error(`Gemini API returned status ${response.status}`);
          }
          
          const resJson = await response.json();
          const text = resJson.candidates[0].content.parts[0].text;
          const parsed = JSON.parse(text);
          measures = parsed.totalMeasures || 16;
          console.log(`Page ${i} Gemini scan: ${measures} measures`);
        } catch (apiErr) {
          console.warn(`Gemini scan failed for page ${i}, falling back to local scan:`, apiErr);
          // Fallback to local CV
          try {
            measures = scanCanvasForMeasures(canvas);
          } catch (e) {
            measures = 16;
          }
        }
      } else {
        // --- Local CV Scan ---
        try {
          measures = scanCanvasForMeasures(canvas);
        } catch (e) {
          measures = 16;
        }
      }
      
      detectedList.push(measures);
    }
    
    // Save results to settings
    State.settings.individualMeasures = detectedList;
    State.settings.measuresUniform = false;
    DOM.chkMeasuresUniform.checked = false;
    
    DOM.uniformMeasuresContainer.classList.add('hidden');
    DOM.individualMeasuresContainer.classList.remove('hidden');
    
    saveScoreSettings();
    renderMeasuresGridInputs();
    updateTimingCalculations();
    
    // Redraw active pages to refresh visual highlights
    renderViewerPages();
    
    if (!silent) {
      const scanType = apiKey ? 'Gemini AI' : '자체 필터';
      alert(`🎉 악보 스캔 완료! (${scanType} 적용)\n\n총 ${State.totalPages}페이지를 스캔하여 마디 수를 자동 감지하였습니다.\n곡 설정 창에서 페이지별 감지된 마디 수와 상세 타이밍을 확인하실 수 있습니다.`);
    }
  } catch (err) {
    console.error('OMR Sheet Music scanning failed:', err);
    if (!silent) {
      alert('악보 마디 감지 중 오류가 발생했습니다.');
    }
  } finally {
    btn.classList.remove('scanning');
    if (span) span.textContent = originalText;
  }
}

// Computer Vision pixel analysis for staff and bar lines
function scanCanvasForMeasures(canvas) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  let imgData;
  try {
    imgData = ctx.getImageData(0, 0, width, height);
  } catch (e) {
    console.warn('Canvas pixel access blocked (CORS). Falling back to default measures.', e);
    return 16;
  }
  
  const data = imgData.data;

  // 1. Convert canvas to 2D binary grid: 1 for dark pixels (ink), 0 for light pixels (paper)
  const grid = [];
  const rowSums = new Int32Array(height);
  
  for (let y = 0; y < height; y++) {
    grid[y] = new Uint8Array(width);
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx+1];
      const b = data[idx+2];
      const brightness = (r + g + b) / 3;
      
      // Threshold 180 (black lines on paper are typically very dark)
      const isBlack = brightness < 180 ? 1 : 0;
      grid[y][x] = isBlack;
      rowSum += isBlack;
    }
    rowSums[y] = rowSum;
  }

  // 2. Detect Horizontal Staff Lines
  // Staff lines span across the page horizontally. Row sums at these lines will be very high.
  const lineThreshold = width * 0.25; // at least 25% of the page width must be black ink
  const lineRows = [];
  for (let y = 0; y < height; y++) {
    if (rowSums[y] > lineThreshold) {
      lineRows.push(y);
    }
  }

  if (lineRows.length === 0) {
    return 16; // Fallback
  }

  // 3. Group horizontal lines into "Systems" (lines of music)
  // Staff lines that are vertically close to each other belong to the same system.
  const systemGapThreshold = height * 0.04; // 4% of total height gap represents a new system
  const systems = [];
  let currentSystem = [lineRows[0]];

  for (let i = 1; i < lineRows.length; i++) {
    const prevY = lineRows[i-1];
    const currY = lineRows[i];
    if (currY - prevY < systemGapThreshold) {
      currentSystem.push(currY);
    } else {
      systems.push(currentSystem);
      currentSystem = [currY];
    }
  }
  systems.push(currentSystem);

  // Helper to count distinct physical lines inside grouped line rows
  function countDistinctLines(lineIndices) {
    if (lineIndices.length === 0) return 0;
    let count = 1;
    for (let i = 1; i < lineIndices.length; i++) {
      if (lineIndices[i] - lineIndices[i-1] > 3) { // more than 3 pixels vertical gap
        count++;
      }
    }
    return count;
  }

  // A valid system must contain multiple staff lines (typically 3 or more close lines)
  const validSystems = systems.filter(sys => sys.length >= 3);

  if (validSystems.length === 0) {
    return 16; // Fallback
  }

  // Filter systems according to target instrument strings count
  // Guitar TAB: 6 lines, Bass TAB: 4 lines, Standard Staff: 5 lines
  const targetLines = State.settings.instrument === 'guitar' ? 6 : (State.settings.instrument === 'bass' ? 4 : 5);
  
  const systemsWithCounts = validSystems.map(sys => {
    return {
      sys: sys,
      lineCount: countDistinctLines(sys)
    };
  });
  
  // Filter systems that exactly match the target line count
  let filteredSystems = systemsWithCounts.filter(item => item.lineCount === targetLines);
  
  // Fallback: If no matching systems are found, keep all systems to prevent complete blank detection
  if (filteredSystems.length === 0) {
    filteredSystems = systemsWithCounts;
  }

  let totalMeasures = 0;

  // 4. Scan each system vertically to find Bar Lines
  filteredSystems.forEach(item => {
    const sys = item.sys;
    const minY = sys[0];
    const maxY = sys[sys.length - 1];
    const sysHeight = maxY - minY + 1;

    if (sysHeight < 5) return; // Ignore thin system noise

    // Scan column density across system width
    const colDensities = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      let blackCount = 0;
      for (let y = minY; y <= maxY; y++) {
        blackCount += grid[y][x];
      }
      colDensities[x] = blackCount / sysHeight;
    }

    // Identify peaks that correspond to solid vertical lines (bar lines)
    const barLineThreshold = 0.70; // 70% vertical black density inside the system
    const barLineCols = [];
    // Skip margins of the page to avoid border artifacts
    for (let x = 15; x < width - 15; x++) {
      if (colDensities[x] > barLineThreshold) {
        barLineCols.push(x);
      }
    }

    // Merge adjacent bar line pixels (lines can be 2-5 pixels thick)
    const distinctBarLines = [];
    if (barLineCols.length > 0) {
      let currentBar = [barLineCols[0]];
      for (let i = 1; i < barLineCols.length; i++) {
        if (barLineCols[i] - barLineCols[i-1] <= 5) {
          currentBar.push(barLineCols[i]);
        } else {
          const avgX = Math.round(currentBar.reduce((a, b) => a + b, 0) / currentBar.length);
          distinctBarLines.push(avgX);
          currentBar = [barLineCols[i]];
        }
      }
      const avgX = Math.round(currentBar.reduce((a, b) => a + b, 0) / currentBar.length);
      distinctBarLines.push(avgX);
    }

    // Filter out redundant/too-close lines (e.g. double bar lines or noise).
    // Gaps between real measures must be at least 6% of page width.
    const minBarGap = width * 0.06;
    const filteredBarLines = [];
    distinctBarLines.forEach(x => {
      if (filteredBarLines.length === 0) {
        filteredBarLines.push(x);
      } else {
        const lastX = filteredBarLines[filteredBarLines.length - 1];
        if (x - lastX > minBarGap) {
          filteredBarLines.push(x);
        }
      }
    });

    // Measures = Gaps between bar lines.
    // If N bar lines are found, there are N-1 measures (e.g. | | | | -> 3 measures)
    // If not enough lines are found, default to 4 measures per system.
    let systemMeasures = 4;
    if (filteredBarLines.length >= 2) {
      systemMeasures = filteredBarLines.length - 1;
    }
    
    // Clamp to realistic bounds (1 to 8 measures per system line)
    systemMeasures = Math.max(1, Math.min(8, systemMeasures));
    totalMeasures += systemMeasures;
  });

  // Clamp overall page measures to realistic limits or return sum
  return totalMeasures > 0 ? totalMeasures : 16;
}
