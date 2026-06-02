/**
 * PARTYPRESS Browse & Search
 * API URL from data-api-url on body, or ?local=1 for localhost:8073
 */
const SEARCH_API = (typeof location !== 'undefined' && location.search.includes('local=1'))
  ? 'http://localhost:8073'
  : (document.body && document.body.dataset && document.body.dataset.apiUrl) || 'https://api.partypress.org';

const DOWNLOAD_MAX = 1000;
const ALL_COLUMNS = ['date', 'country', 'party', 'CAP_issue1', 'title', 'text', 'parlgov_party_id'];

// Elements
const form = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const countrySelect = document.getElementById('filter-country');
const partySelect = document.getElementById('filter-party');
const issueSelect = document.getElementById('filter-issue');
const dateFromInput = document.getElementById('filter-date-from');
const dateToInput = document.getElementById('filter-date-to');
const pageSizeSelect = document.getElementById('page-size');
const sortBySelect = document.getElementById('sort-by');
const sortDirSelect = document.getElementById('sort-dir');
const showDateCollectedCheck = document.getElementById('show-date-collected');
const showUrlCheck = document.getElementById('show-url');
const apiStatus = document.getElementById('api-status');
const resultsSummary = document.getElementById('results-summary');
const resultsBody = document.getElementById('results-body');
const paginationEl = document.getElementById('pagination');
const downloadBtn = document.getElementById('download-btn');
const downloadModal = document.getElementById('download-modal');
const downloadCols = document.getElementById('download-cols');
const downloadCancel = document.getElementById('download-cancel');
const downloadConfirm = document.getElementById('download-confirm');
const apiDocsLink = document.getElementById('api-docs-link');
const textOverlay = document.getElementById('text-overlay');
const textOverlayClose = document.getElementById('text-overlay-close');
const textOverlayTitle = document.getElementById('text-overlay-title');
const textOverlayMeta = document.getElementById('text-overlay-meta');
const textOverlayBody = document.getElementById('text-overlay-body');

let currentOffset = 0;
let currentTotal = 0;
let currentResults = [];  // Store for expand (full text)

function normalizeToken(raw) {
  const s = (raw || '').trim();
  if (!s) return '';
  const fromUrl = s.match(/[?&]token=(pp_[A-Za-z0-9_-]+)/);
  if (fromUrl) return fromUrl[1];
  if (/^https?:\/\//.test(s)) {
    try {
      const t = new URL(s).searchParams.get('token');
      if (t) return t;
    } catch (_) { /* ignore */ }
  }
  return s;
}

function getToken() {
  const el = document.getElementById('api-token');
  return el ? normalizeToken(el.value) : '';
}

function resultTotal(data, offset) {
  if (data.total != null) return data.total;
  const n = data.results ? data.results.length : 0;
  return data.next ? offset + n + 1 : offset + n;
}
function appendToken(url) {
  const t = getToken();
  if (!t) return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'token=' + encodeURIComponent(t);
}

// Health check
fetch(appendToken(SEARCH_API + '/health'))
  .then(r => r.json())
  .then(d => {
    if (d.status === 'ok') {
      apiStatus.textContent = `${d.total_releases?.toLocaleString() ?? '?'} press releases indexed`;
    } else {
      apiStatus.textContent = 'API unavailable';
      apiStatus.classList.add('error');
    }
  })
  .catch(() => {
    apiStatus.textContent = 'API unavailable (check SEARCH_API in search.js)';
    apiStatus.classList.add('error');
  });

function addOption(select, value, text) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = text;
  select.appendChild(opt);
}

function getParams() {
  const params = {
    limit: parseInt(pageSizeSelect.value, 10),
    offset: currentOffset,
    sort_by: sortBySelect.value,
    sort_dir: sortDirSelect.value,
  };
  const q = searchInput.value.trim();
  if (q) params.q = q;
  if (countrySelect.value) params.country = countrySelect.value;
  if (partySelect.value) params.party = partySelect.value;
  if (issueSelect.value) params.issue = issueSelect.value;
  if (dateFromInput.value) params.date_from = dateFromInput.value;
  if (dateToInput.value) params.date_to = dateToInput.value;
  return params;
}

function fetchList() {
  const params = new URLSearchParams(getParams());
  resultsBody.innerHTML = '<tr><td colspan="8">Loading…</td></tr>';

  // Use /search for text queries (skips total count, faster). Use /list for browse.
  const hasQuery = searchInput.value.trim().length > 0;
  const endpoint = hasQuery ? '/search' : '/list';
  const url = appendToken(SEARCH_API + endpoint + '?' + params);
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), hasQuery ? 90000 : 30000);  // 90s for search, 30s for list

  fetch(url, { signal: ctrl.signal })
    .then(r => {
      clearTimeout(timeout);
      if (r.status === 401) {
        throw new Error('Invalid API token — paste only the pp_… value, not the full health URL.');
      }
      if (!r.ok) throw new Error(`API error (${r.status})`);
      return r.json();
    })
    .then(data => {
      if (data.error) {
        resultsBody.innerHTML = `<tr><td colspan="8" class="api-status error">${escapeHtml(data.error)}</td></tr>`;
        resultsSummary.textContent = '';
        return;
      }

      const total = resultTotal(data, data.offset ?? currentOffset);
      currentTotal = total;
      currentResults = data.results || [];
      const totalLabel = data.total_exact === false ? `${total.toLocaleString()}+` : total.toLocaleString();
      resultsSummary.textContent = `${totalLabel} result${total !== 1 ? 's' : ''}${searchInput.value.trim() ? ` for "${escapeHtml(searchInput.value.trim())}"` : ''}`;

      if (currentResults.length === 0) {
        resultsBody.innerHTML = '<tr><td colspan="8">No results.</td></tr>';
      } else {
        resultsBody.innerHTML = currentResults.map((r, i) => rowHtml(r, i)).join('');
        attachExpandHandlers();
      }

      renderPagination(total, data.limit, data.offset);
    })
    .catch(err => {
      clearTimeout(timeout);
      const msg = err.name === 'AbortError' ? 'Request timed out. Try a shorter search or fewer filters.' : err.message;
      resultsBody.innerHTML = `<tr><td colspan="8" class="api-status error">${escapeHtml(msg)}</td></tr>`;
      resultsSummary.textContent = '';
    });
}

function rowHtml(r, index) {
  const title = r.title || '(No title)';
  const titleSafe = escapeHtmlAllowMark(title);
  const titleLink = r.url
    ? `<a class="title-link" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${titleSafe}</a>`
    : titleSafe;
  const snippet = r.search_snippet ? `<div class="search-snippet">${escapeHtmlAllowMark(r.search_snippet)}</div>` : '';
  const urlCell = r.url ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">Link</a>` : '—';
  return `<tr data-row-index="${index}">
    <td>${escapeHtml(r.country || '')}</td>
    <td>${escapeHtml(r.date || '')}</td>
    <td>${escapeHtml(r.party || '')}</td>
    <td data-col="CAP_issue1">${escapeHtml(r.CAP_issue1 || '')}</td>
    <td class="title-cell">${titleLink}${snippet}</td>
    <td><button type="button" class="expand-btn">Show text</button></td>
    <td class="opt-col" data-col="date_collected">${escapeHtml(r.date_collected || '')}</td>
    <td class="opt-col" data-col="url">${urlCell}</td>
  </tr>`;
}

function attachExpandHandlers() {
  resultsBody.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      const idx = parseInt(row.dataset.rowIndex, 10);
      const r = currentResults[idx];
      if (!r) return;
      textOverlayTitle.textContent = (r.title || '(No title)').replace(/<\/?mark>/gi, '');
      textOverlayMeta.textContent = [r.country, r.date, r.party].filter(Boolean).join(' · ');
      textOverlayBody.textContent = r.text || '(No content)';
      textOverlay.hidden = false;
    });
  });
}

function renderPagination(total, limit, offset) {
  if (total == null || !limit) {
    paginationEl.innerHTML = '';
    return;
  }
  const pages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;
  let html = '';
  html += `<button type="button" id="page-prev" ${offset === 0 ? 'disabled' : ''}>Previous</button>`;
  html += `<span class="page-info">Page ${currentPage} of ${pages || 1} (${total.toLocaleString()} total)</span>`;
  html += `<button type="button" id="page-next" ${offset + limit >= total ? 'disabled' : ''}>Next</button>`;
  paginationEl.innerHTML = html;
  paginationEl.querySelector('#page-prev')?.addEventListener('click', () => {
    currentOffset = Math.max(0, offset - limit);
    fetchList();
  });
  paginationEl.querySelector('#page-next')?.addEventListener('click', () => {
    currentOffset = Math.min(offset + limit, total - 1);
    fetchList();
  });
}

function escapeHtml(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/** Escape HTML but allow <mark> and </mark> so API search highlights render. */
function escapeHtmlAllowMark(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  let out = div.innerHTML;
  // Restore <mark> and </mark> so they render as tags (handle both &lt; and &amp;lt; from API)
  out = out.replace(/&amp;lt;mark&amp;gt;/gi, '<mark>').replace(/&amp;lt;\/mark&amp;gt;/gi, '</mark>');
  out = out.replace(/&lt;mark&gt;/gi, '<mark>').replace(/&lt;\/mark&gt;/gi, '</mark>');
  return out;
}

function toggleOptionalCols() {
  document.querySelectorAll('.opt-col').forEach(el => {
    const col = el.getAttribute('data-col');
    if (col === 'date_collected') el.classList.toggle('visible', showDateCollectedCheck.checked);
    if (col === 'url') el.classList.toggle('visible', showUrlCheck.checked);
  });
}

// Event handlers
form.addEventListener('submit', (e) => {
  e.preventDefault();
  currentOffset = 0;
  fetchList();
});

pageSizeSelect.addEventListener('change', () => { currentOffset = 0; fetchList(); });
sortBySelect.addEventListener('change', fetchList);
sortDirSelect.addEventListener('change', fetchList);
showDateCollectedCheck.addEventListener('change', toggleOptionalCols);
showUrlCheck.addEventListener('change', toggleOptionalCols);

downloadBtn.addEventListener('click', () => {
  downloadCols.innerHTML = ALL_COLUMNS.map(c => `
    <label><input type="checkbox" name="col" value="${c}" ${['date','country','party','CAP_issue1','title','text'].includes(c) ? 'checked' : ''}> ${c}</label>
  `).join('');
  downloadModal.hidden = false;
});

downloadCancel.addEventListener('click', () => { downloadModal.hidden = true; });
downloadModal.addEventListener('click', (e) => { if (e.target === downloadModal) downloadModal.hidden = true; });

downloadConfirm.addEventListener('click', () => {
  const cols = [...downloadModal.querySelectorAll('input[name="col"]:checked')].map(c => c.value);
  if (cols.length === 0) return;
  const p = {};
  if (searchInput.value.trim()) p.q = searchInput.value.trim();
  if (countrySelect.value) p.country = countrySelect.value;
  if (partySelect.value) p.party = partySelect.value;
  if (issueSelect.value) p.issue = issueSelect.value;
  if (dateFromInput.value) p.date_from = dateFromInput.value;
  if (dateToInput.value) p.date_to = dateToInput.value;
  p.limit = DOWNLOAD_MAX;
  p.cols = cols.join(',');
  window.location.href = appendToken(SEARCH_API + '/download?' + new URLSearchParams(p));
  downloadModal.hidden = true;
});

textOverlayClose.addEventListener('click', () => { textOverlay.hidden = true; });
textOverlay.addEventListener('click', (e) => { if (e.target === textOverlay) textOverlay.hidden = true; });

if (apiDocsLink) apiDocsLink.href = SEARCH_API + '/docs';

// Load filters first, then run initial fetch so dropdowns are populated before user interacts
function addLoadingOption(select) {
  const opt = document.createElement('option');
  opt.value = '';
  opt.textContent = 'Loading…';
  opt.disabled = true;
  select.appendChild(opt);
}

[countrySelect, partySelect, issueSelect].forEach(s => { if (s.options.length === 1) addLoadingOption(s); });

fetch(appendToken(SEARCH_API + '/filters'))
  .then(r => r.json())
  .then(data => {
    [countrySelect, partySelect, issueSelect].forEach(s => {
      const loading = s.querySelector('option[disabled]');
      if (loading) loading.remove();
    });
    data.countries?.forEach(c => addOption(countrySelect, c, c));
    data.parties?.slice(0, 300).forEach(p => addOption(partySelect, p, p));
    data.issues?.forEach(i => addOption(issueSelect, i, i));
  })
  .catch(() => {
    [countrySelect, partySelect, issueSelect].forEach(s => {
      const loading = s.querySelector('option[disabled]');
      if (loading) loading.textContent = 'Failed to load';
    });
  })
  .finally(() => {
    // Initial load only after filters are ready (or failed)
    fetchList();
  });

</think>

<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
StrReplace