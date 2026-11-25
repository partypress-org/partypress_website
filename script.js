(function () {
  document.querySelectorAll('.bibtex-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-bibtex');
      var block = document.getElementById('bibtex-' + id);
      if (!block) return;
      var open = block.hidden;
      block.hidden = !open;
      btn.setAttribute('aria-expanded', open);
    });
  });

  document.querySelectorAll('.bibtex-copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var pre = btn.closest('.bibtex-block').querySelector('.bibtex-code');
      if (!pre) return;
      navigator.clipboard.writeText(pre.textContent).then(function () {
        var t = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = t; }, 1500);
      });
    });
  });
})();

(function () {
  var section = document.getElementById('research-using');
  var list = document.getElementById('research-using-list');
  if (!section || !list) return;

  var PARTYPRESS_KEY = '07_partypress-database_rap_2023';

  function partypressEntry(data) {
    var by = data && data.by_publication;
    if (!by || typeof by !== 'object') return null;
    if (by[PARTYPRESS_KEY] && Array.isArray(by[PARTYPRESS_KEY].citing_works)) {
      return by[PARTYPRESS_KEY];
    }
    var keys = Object.keys(by);
    for (var i = 0; i < keys.length; i++) {
      var entry = by[keys[i]];
      var title = entry && entry.scholar_title ? String(entry.scholar_title) : '';
      if (/partypress database/i.test(title) && entry && Array.isArray(entry.citing_works)) {
        return entry;
      }
    }
    return null;
  }

  function cleanTitle(title) {
    return String(title || '')
      .replace(/^\s*(\[(?:citation|[a-z])\]\s*)+/i, '')
      .trim();
  }

  function normTitle(title) {
    return cleanTitle(title)
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function score(work) {
    var value = 0;
    if (work.url) value += 4;
    if (work.year) value += 2;
    value += (work.authors && work.authors.length) || 0;
    value += Math.min(String(work.title || '').length, 200) / 200;
    return value;
  }

  function dedupe(works) {
    var items = [];
    works.forEach(function (work) {
      if (!work || !cleanTitle(work.title)) return;
      var key = normTitle(work.title);
      if (key.length < 8) return;
      items.push({ work: work, key: key, score: score(work) });
    });
    items.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return b.key.length - a.key.length;
    });
    var kept = [];
    items.forEach(function (item) {
      var duplicate = kept.some(function (existing) {
        if (existing.key === item.key) return true;
        var shorter = existing.key.length < item.key.length ? existing.key : item.key;
        var longer = existing.key.length < item.key.length ? item.key : existing.key;
        return shorter.length >= 40 && longer.indexOf(shorter) === 0;
      });
      if (!duplicate) kept.push(item);
    });
    kept.sort(function (a, b) {
      var yearA = a.work.year || 0;
      var yearB = b.work.year || 0;
      if (yearB !== yearA) return yearB - yearA;
      return String(a.work.title).localeCompare(String(b.work.title));
    });
    return kept.map(function (item) { return item.work; });
  }

  function displayTitle(title) {
    return cleanTitle(title);
  }

  function authorLine(work) {
    var names = (work.authors || []).map(function (author) {
      return author && author.name ? String(author.name).replace(/\s*…\s*$/, '').trim() : '';
    }).filter(Boolean);
    var people = '';
    if (names.length === 1) people = names[0];
    else if (names.length === 2) people = names[0] + ' and ' + names[1];
    else if (names.length > 2) people = names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
    if (people && work.year) return people + ' · ' + work.year;
    if (people) return people;
    if (work.year) return String(work.year);
    return '';
  }

  function render(works) {
    list.textContent = '';
    works.forEach(function (work) {
      var item = document.createElement('li');
      var title = displayTitle(work.title);
      var heading;
      if (work.url) {
        heading = document.createElement('a');
        heading.href = work.url;
        heading.target = '_blank';
        heading.rel = 'noopener';
      } else {
        heading = document.createElement('span');
      }
      heading.className = 'research-using-title';
      heading.textContent = title;
      item.appendChild(heading);
      var meta = authorLine(work);
      if (meta) {
        var line = document.createElement('p');
        line.className = 'research-using-meta';
        line.textContent = meta;
        item.appendChild(line);
      }
      list.appendChild(item);
    });
    section.hidden = false;
  }

  var signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(12000)
    : undefined;

  fetch('https://corneliuserfort.de/', { signal: signal })
    .then(function (response) {
      if (!response.ok) throw new Error('citations request failed');
      return response.text();
    })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var node = doc.getElementById('data-citations');
      if (!node || !node.textContent) throw new Error('citations missing');
      var entry = partypressEntry(JSON.parse(node.textContent));
      if (!entry) throw new Error('partypress citations missing');
      var works = dedupe(entry.citing_works);
      if (!works.length) throw new Error('no citing articles');
      render(works);
    })
    .catch(function () {
      section.hidden = true;
    });
})();
