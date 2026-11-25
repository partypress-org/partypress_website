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

  function authorNames(work) {
    var names = (work.authors || []).map(function (author) {
      return author && author.name ? String(author.name).replace(/\s*…\s*$/, '').trim() : '';
    }).filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' and ' + names[1];
    if (names.length > 2) return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
    return '';
  }

  function doiFromUrl(url) {
    if (!url) return '';
    var match = String(url).match(/10\.\d{4,9}\/[^\s?#]+/i);
    if (match) return match[0].replace(/[).,;]+$/, '').replace(/\.pdf$/i, '');
    var nature = String(url).match(/nature\.com\/articles\/([A-Za-z0-9.\-]+)/i);
    if (nature) return '10.1038/' + nature[1];
    return '';
  }

  var LANCET_JOURNALS = {
    lanpub: 'The Lancet Public Health',
    lancet: 'The Lancet',
    laninf: 'The Lancet Infectious Diseases',
    laneur: 'The Lancet Neurology',
    lanonc: 'The Lancet Oncology',
    lanplh: 'The Lancet Planetary Health',
    lanpsy: 'The Lancet Psychiatry',
    langlo: 'The Lancet Global Health',
    lanres: 'The Lancet Respiratory Medicine'
  };

  function titleCaseSlug(slug) {
    var small = { and: true, of: true, the: true, in: true, for: true, on: true, a: true };
    return String(slug).split('-').filter(Boolean).map(function (word, index) {
      var lower = word.toLowerCase();
      if (index > 0 && small[lower]) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join(' ');
  }

  function journalFromUrl(url) {
    if (!url) return '';
    var cambridge = String(url).match(/cambridge\.org\/core\/journals\/([^/?#]+)/i);
    if (cambridge) return titleCaseSlug(cambridge[1]);
    var lancet = String(url).match(/thelancet\.com\/journals\/([a-z0-9]+)/i);
    if (lancet) return LANCET_JOURNALS[lancet[1].toLowerCase()] || '';
    if (/cairn\.info\/revue-revue-francaise-de-science-politique/i.test(url)) {
      return 'Revue française de science politique';
    }
    return '';
  }

  function journalsByDoi(works) {
    var dois = [];
    var seen = {};
    works.forEach(function (work) {
      var doi = doiFromUrl(work.url);
      var key = doi.toLowerCase();
      if (!doi || seen[key]) return;
      seen[key] = true;
      dois.push(doi);
    });
    if (!dois.length) return Promise.resolve({});
    var requests = [];
    for (var start = 0; start < dois.length; start += 50) {
      var filter = 'doi:' + dois.slice(start, start + 50).join('|');
      var url = 'https://api.openalex.org/works?per-page=50&select=doi,primary_location&mailto=cornelius.erfort@uni-wh.de&filter=' + encodeURIComponent(filter);
      var lookupSignal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
        ? AbortSignal.timeout(8000)
        : undefined;
      requests.push(
        fetch(url, { signal: lookupSignal })
          .then(function (response) {
            if (!response.ok) throw new Error('journal lookup failed');
            return response.json();
          })
          .then(function (data) {
            var map = {};
            ((data && data.results) || []).forEach(function (row) {
              var source = row.primary_location && row.primary_location.source;
              if (!source || source.type !== 'journal' || !source.display_name) return;
              var doi = String(row.doi || '').replace(/^https?:\/\/doi\.org\//i, '').toLowerCase();
              if (doi) map[doi] = source.display_name;
            });
            return map;
          })
          .catch(function () { return {}; })
      );
    }
    return Promise.all(requests).then(function (maps) {
      var combined = {};
      maps.forEach(function (map) {
        Object.keys(map).forEach(function (doi) { combined[doi] = map[doi]; });
      });
      return combined;
    });
  }

  function journalFor(work, byDoi) {
    var doi = doiFromUrl(work.url).toLowerCase();
    if (doi && byDoi[doi]) return byDoi[doi];
    return journalFromUrl(work.url);
  }

  function addMeta(item, text) {
    var line = document.createElement('p');
    line.className = 'research-using-meta';
    line.textContent = text;
    item.appendChild(line);
  }

  function render(works, byDoi) {
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
      var people = authorNames(work);
      var journal = journalFor(work, byDoi || {});
      if (journal) {
        if (people) addMeta(item, people);
        var venue = document.createElement('p');
        venue.className = 'research-using-meta';
        var name = document.createElement('em');
        name.textContent = journal;
        venue.appendChild(name);
        if (work.year) venue.appendChild(document.createTextNode(', ' + work.year));
        item.appendChild(venue);
      } else if (people && work.year) {
        addMeta(item, people + ' · ' + work.year);
      } else if (people || work.year) {
        addMeta(item, people || String(work.year));
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
      return journalsByDoi(works).then(function (byDoi) {
        render(works, byDoi);
      });
    })
    .catch(function () {
      section.hidden = true;
    });
})();
