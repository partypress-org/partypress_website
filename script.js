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
  var pager = document.getElementById('research-using-pages');
  if (!section || !list) return;

  var PAGE_SIZE = 5;

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
      item.names = splitAuthorNames(item.work);
      var existing = null;
      for (var i = 0; i < kept.length; i++) {
        var other = kept[i];
        var same = other.key === item.key;
        if (!same) {
          var shorter = other.key.length < item.key.length ? other.key : item.key;
          var longer = other.key.length < item.key.length ? item.key : other.key;
          same = shorter.length >= 40 && longer.indexOf(shorter) === 0;
        }
        if (same) {
          existing = other;
          break;
        }
      }
      if (!existing) {
        kept.push(item);
        return;
      }
      existing.names = mergeAuthorNames(existing.names, item.names);
      if (!existing.work.url && item.work.url) existing.work.url = item.work.url;
      if (!existing.work.year && item.work.year) existing.work.year = item.work.year;
    });
    kept.sort(function (a, b) {
      var yearA = a.work.year || 0;
      var yearB = b.work.year || 0;
      if (yearB !== yearA) return yearB - yearA;
      return String(a.work.title).localeCompare(String(b.work.title));
    });
    return kept.map(function (item) {
      item.work.resolvedAuthors = item.names;
      return item.work;
    });
  }

  function personKey(name) {
    var bits = String(name).replace(/\./g, '').split(/\s+/).filter(Boolean);
    if (!bits.length) return '';
    return bits[bits.length - 1].toLowerCase() + '|' + bits[0].charAt(0).toLowerCase();
  }

  function splitAuthorNames(work) {
    var names = [];
    (work.authors || []).forEach(function (author) {
      String(author && author.name || '').split(/[,，;；]/).forEach(function (part) {
        var name = part.replace(/\s*(?:…|\.{3})\s*$/, '').trim();
        if (name.length < 2 || /descriptor/i.test(name)) return;
        names.push(name);
      });
    });
    return names;
  }

  function mergeAuthorNames(base, extra) {
    var out = base.slice();
    var seen = {};
    out.forEach(function (name) { seen[personKey(name)] = true; });
    extra.forEach(function (name) {
      var key = personKey(name);
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(name);
    });
    return out;
  }

  function displayTitle(title) {
    return cleanTitle(title);
  }

  function formatAuthors(names) {
    if (!names || !names.length) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' and ' + names[1];
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
  }

  function doiFromUrl(url) {
    if (!url) return '';
    var text = String(url);
    var match = text.match(/10\.\d{4,9}\/[^\s?#]+/i);
    if (match) return match[0].replace(/[).,;]+$/, '').replace(/\.pdf$/i, '');
    var nature = text.match(/nature\.com\/articles\/([A-Za-z0-9.\-]+)/i);
    if (nature) return '10.1038/' + nature[1];
    var lancet = text.match(/PII(S\d{4}-\d{4}\([^)]+\)[^/?#]*)/i);
    if (lancet) return '10.1016/' + lancet[1].toLowerCase();
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

  function authorsByDoi(works) {
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
    for (var start = 0; start < dois.length; start += 25) {
      var slice = dois.slice(start, start + 25);
      var filter = slice.map(function (doi) { return 'doi:' + doi; }).join(',');
      var url = 'https://api.crossref.org/works?rows=' + slice.length + '&select=DOI,author&mailto=cornelius.erfort@uni-wh.de&filter=' + encodeURIComponent(filter);
      var lookupSignal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
        ? AbortSignal.timeout(8000)
        : undefined;
      requests.push(
        fetch(url, { signal: lookupSignal })
          .then(function (response) {
            if (!response.ok) throw new Error('author lookup failed');
            return response.json();
          })
          .then(function (data) {
            var map = {};
            var items = (data && data.message && data.message.items) || [];
            items.forEach(function (item) {
              var names = (item.author || []).map(function (author) {
                var given = author.given ? String(author.given).trim() : '';
                var family = author.family ? String(author.family).trim() : '';
                if (given && family) return given + ' ' + family;
                return family || given || (author.name ? String(author.name).trim() : '');
              }).filter(Boolean);
              if (names.length && item.DOI) map[String(item.DOI).toLowerCase()] = names;
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

  function authorsFor(work, byDoi) {
    var scholar = work.resolvedAuthors || splitAuthorNames(work);
    var doi = doiFromUrl(work.url).toLowerCase();
    var published = doi && byDoi[doi];
    if (published && published.length >= scholar.length) return published;
    return scholar;
  }
  function journalFor(work, byDoi) {
    var doi = doiFromUrl(work.url).toLowerCase();
    if (doi && byDoi[doi]) return byDoi[doi];
    return journalFromUrl(work.url);
  }

  var prepared = [];
  var currentPage = 0;

  function overflows(el) {
    return el.scrollHeight > el.clientHeight + 1;
  }

  function fitTitle(el) {
    if (overflows(el)) el.classList.add('is-compact');
    if (overflows(el)) {
      el.classList.add('is-clamped');
      el.title = el.textContent;
    }
  }

  function authorLabel(names, count) {
    if (count >= names.length) return formatAuthors(names);
    if (count <= 1) return names[0] + ' et al.';
    return names.slice(0, count).join(', ') + ', et al.';
  }

  function fitAuthors(el, names) {
    if (!names.length || el.clientWidth < 1) {
      el.textContent = formatAuthors(names);
      return;
    }
    el.title = formatAuthors(names);
    function fits(count) {
      el.textContent = authorLabel(names, count);
      return el.scrollWidth <= el.clientWidth + 1;
    }
    if (fits(names.length)) {
      el.removeAttribute('title');
      return;
    }
    var low = 1;
    var high = names.length - 1;
    var best = 1;
    while (low <= high) {
      var mid = Math.floor((low + high) / 2);
      if (fits(mid)) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    el.textContent = authorLabel(names, best);
  }

  function renderItem(entry) {
    var work = entry.work;
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

    var authors = document.createElement('p');
    authors.className = 'research-using-meta';
    item.appendChild(authors);

    var venue = document.createElement('p');
    venue.className = 'research-using-meta';
    if (entry.journal) {
      var name = document.createElement('em');
      name.textContent = entry.journal;
      venue.appendChild(name);
      if (work.year) venue.appendChild(document.createTextNode(', ' + work.year));
    } else if (work.year) {
      venue.textContent = String(work.year);
    }
    item.appendChild(venue);
    list.appendChild(item);
    fitTitle(heading);
    fitAuthors(authors, entry.authors || []);
  }

  function renderPager(total) {
    if (!pager) return;
    var pages = Math.ceil(total / PAGE_SIZE);
    pager.textContent = '';
    if (pages <= 1) {
      pager.hidden = true;
      return;
    }
    pager.hidden = false;

    function addButton(label, index, opts) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      if (opts && opts.current) button.setAttribute('aria-current', 'page');
      if (opts && opts.disabled) button.disabled = true;
      if (index != null) {
        button.addEventListener('click', function () {
          currentPage = index;
          showPage(true);
        });
      }
      pager.appendChild(button);
    }

    addButton('Previous', currentPage - 1, { disabled: currentPage === 0 });
    for (var i = 0; i < pages; i++) {
      addButton(String(i + 1), i, { current: i === currentPage });
    }
    addButton('Next', currentPage + 1, { disabled: currentPage >= pages - 1 });
  }

  function showPage(scroll) {
    var start = currentPage * PAGE_SIZE;
    list.textContent = '';
    prepared.slice(start, start + PAGE_SIZE).forEach(renderItem);
    renderPager(prepared.length);
    if (scroll) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    if (!prepared.length || section.hidden) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { showPage(false); }, 150);
  });

  function render(works, journals, authorMap) {
    prepared = works.map(function (work) {
      return {
        work: work,
        authors: authorsFor(work, authorMap || {}),
        journal: journalFor(work, journals || {})
      };
    });
    currentPage = 0;
    section.hidden = false;
    showPage(false);
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
      return Promise.all([journalsByDoi(works), authorsByDoi(works)]).then(function (result) {
        render(works, result[0], result[1]);
      });
    })
    .catch(function () {
      section.hidden = true;
    });
})();
