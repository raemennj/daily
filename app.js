const DATA_URL = 'data/daily_reflections.json';
const NOTES_KEY = 'daily-reflections-notes-v1';
const MONTH_DAY_CAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const state = {
  entries: [],
  currentEntry: null,
  notes: {}
};

const els = {
  monthSelect: document.getElementById('monthSelect'),
  daySelect: document.getElementById('daySelect'),
  goButton: document.getElementById('goButton'),
  todayButton: document.getElementById('todayButton'),
  randomButton: document.getElementById('randomButton'),
  shareButton: document.getElementById('shareButton'),
  currentMonth: document.getElementById('currentMonth'),
  currentDay: document.getElementById('currentDay'),
  currentDate: document.getElementById('currentDate'),
  currentTitle: document.getElementById('currentTitle'),
  currentSource: document.getElementById('currentSource'),
  currentQuote: document.getElementById('currentQuote'),
  currentReflection: document.getElementById('currentReflection'),
  currentTags: document.getElementById('currentTags'),
  noteField: document.getElementById('noteField'),
  saveNote: document.getElementById('saveNote'),
  noteStatus: document.getElementById('noteStatus'),
  searchInput: document.getElementById('searchInput'),
  searchResults: document.getElementById('searchResults'),
  networkStatus: document.getElementById('networkStatus'),
  pwaStatus: document.getElementById('pwaStatus')
};

init();

async function init() {
  fillMonthOptions();
  bindEvents();
  loadNotes();
  await loadEntries();
  showToday();
  updateNetworkStatus();
  registerServiceWorker();
  onSearch();
}

function bindEvents() {
  els.monthSelect.addEventListener('change', () => updateDayOptions());
  els.goButton.addEventListener('click', () => {
    const month = Number(els.monthSelect.value);
    const day = Number(els.daySelect.value);
    jumpToDate(month, day);
  });
  els.todayButton.addEventListener('click', showToday);
  els.randomButton.addEventListener('click', showRandom);
  els.shareButton.addEventListener('click', shareCurrent);
  els.saveNote.addEventListener('click', saveCurrentNote);
  els.searchInput.addEventListener('input', onSearch);
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
}

function fillMonthOptions() {
  els.monthSelect.innerHTML = monthNames
    .map((m, idx) => `<option value="${idx}">${m}</option>`)
    .join('');
  updateDayOptions();
}

function updateDayOptions(monthIndex = Number(els.monthSelect.value)) {
  const days = daysInMonth(monthIndex);
  const currentDay = Math.min(Number(els.daySelect.value) || 1, days);
  const options = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const selected = day === currentDay ? 'selected' : '';
    return `<option value="${day}" ${selected}>${day}</option>`;
  });
  els.daySelect.innerHTML = options.join('');
}

function daysInMonth(monthIndex) {
  return MONTH_DAY_CAP[monthIndex] || 31;
}

async function loadEntries() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
    state.entries = await res.json();
  } catch (err) {
    console.error(err);
    const fileProtocol = location.protocol === 'file:';
    els.currentTitle.textContent = 'Unable to load reflections';
    els.currentReflection.textContent = fileProtocol
      ? 'Open this folder with a local server (http://localhost:PORT). Browsers block file:// fetches for JSON.'
      : 'Check your connection and refresh. Offline copies are cached after first load.';
  }
}

function findEntry(monthIndex, day) {
  const monthName = monthNames[monthIndex];
  return state.entries.find(
    (entry) =>
      entry.month.toLowerCase() === monthName.toLowerCase() &&
      Number(entry.day) === Number(day)
  );
}

function jumpToDate(monthIndex, day) {
  const entry = findEntry(monthIndex, day);
  if (entry) {
    renderEntry(entry);
  } else {
    els.noteStatus.textContent = 'No entry for that date.';
  }
}

function showToday() {
  const now = new Date();
  const entry = findEntry(now.getMonth(), now.getDate());
  if (entry) {
    renderEntry(entry);
    els.monthSelect.value = now.getMonth();
    updateDayOptions(now.getMonth());
    els.daySelect.value = now.getDate();
  } else if (state.entries.length) {
    renderEntry(state.entries[0]);
  }
}

function showRandom() {
  if (!state.entries.length) return;
  const entry = state.entries[Math.floor(Math.random() * state.entries.length)];
  renderEntry(entry);
  const monthIdx = monthNames.findIndex((m) => m.toLowerCase() === entry.month.toLowerCase());
  els.monthSelect.value = monthIdx;
  updateDayOptions(monthIdx);
  els.daySelect.value = entry.day;
}

function renderEntry(entry) {
  state.currentEntry = entry;
  els.currentMonth.textContent = entry.month;
  els.currentDay.textContent = entry.day.toString().padStart(2, '0');
  els.currentDate.textContent = entry.date || `${entry.month} ${entry.day}`;
  els.currentTitle.textContent = entry.title;
  els.currentSource.textContent = entry.source || '';
  els.currentQuote.textContent = entry.quote || '';
  els.currentReflection.textContent = entry.reflection || '';
  renderTags(entry);
  syncNoteField();
}

function renderTags(entry) {
  const monthTag = entry.month;
  const pageTag = entry.page_index ? `p.${entry.page_index}` : 'Daily';
  els.currentTags.innerHTML = `
    <span class="tag">${monthTag}</span>
    <span class="tag">${pageTag}</span>
  `;
}

function loadNotes() {
  try {
    state.notes = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
  } catch (err) {
    state.notes = {};
  }
}

function saveNotes() {
  localStorage.setItem(NOTES_KEY, JSON.stringify(state.notes));
}

function currentNoteKey() {
  if (!state.currentEntry) return null;
  return `${state.currentEntry.month}-${state.currentEntry.day}`;
}

function syncNoteField() {
  const key = currentNoteKey();
  els.noteField.value = (key && state.notes[key]) || '';
  els.noteStatus.textContent = '';
}

function saveCurrentNote() {
  const key = currentNoteKey();
  if (!key) return;
  state.notes[key] = els.noteField.value.trim();
  saveNotes();
  els.noteStatus.textContent = 'Saved locally';
  setTimeout(() => (els.noteStatus.textContent = ''), 1500);
}

function onSearch() {
  const query = els.searchInput.value.trim().toLowerCase();
  if (!query || query.length < 2) {
    els.searchResults.innerHTML = '<div class="empty">Type to search the collection.</div>';
    return;
  }

  const matches = state.entries
    .filter((entry) => {
      const haystack = `${entry.title} ${entry.quote} ${entry.reflection}`.toLowerCase();
      return haystack.includes(query);
    })
    .slice(0, 20);

  if (!matches.length) {
    els.searchResults.innerHTML = '<div class="empty">No matches yet.</div>';
    return;
  }

  els.searchResults.innerHTML = matches
    .map((entry) => {
      const monthIdx = monthNames.findIndex((m) => m.toLowerCase() === entry.month.toLowerCase());
      return `<button class="result" data-month="${monthIdx}" data-day="${entry.day}">
        <div class="result-title">${entry.title}</div>
        <div class="result-meta">${entry.month} ${entry.day} • ${entry.source || ''}</div>
      </button>`;
    })
    .join('');

  els.searchResults.querySelectorAll('.result').forEach((btn) => {
    btn.addEventListener('click', () => {
      const month = Number(btn.dataset.month);
      const day = Number(btn.dataset.day);
      jumpToDate(month, day);
      els.monthSelect.value = month;
      updateDayOptions(month);
      els.daySelect.value = day;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

async function shareCurrent() {
  if (!state.currentEntry) return;
  const text = `${state.currentEntry.title}\n${state.currentEntry.quote}\n\n${state.currentEntry.reflection}`;
  const sharePayload = {
    title: 'Daily Reflections',
    text,
    url: location.href
  };

  if (navigator.share) {
    try {
      await navigator.share(sharePayload);
    } catch (err) {
      // user canceled share
    }
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    els.noteStatus.textContent = 'Copied for sharing';
    setTimeout(() => (els.noteStatus.textContent = ''), 1600);
  }
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  els.networkStatus.textContent = online ? 'Online' : 'Offline ready';
  els.networkStatus.classList.toggle('muted', !online);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return;
  try {
    await navigator.serviceWorker.register('service-worker.js');
    els.pwaStatus.textContent = 'Ready for Add to Home Screen';
    els.pwaStatus.classList.remove('muted');
  } catch (err) {
    console.warn('Service worker registration failed', err);
  }
}
