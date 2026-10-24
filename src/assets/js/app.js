/* MYBIKE — фильтры, калькулятор, бронирование. Без зависимостей. */
(function () {
  'use strict';
  var CFG = window.MYBIKE || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var NB = ' ';

  // ---------- деньги ----------
  function num(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NB); }
  function vnd(n) { return num(n) + NB + '₫'; }
  function rub(n) { return '≈' + NB + num(Math.ceil(n / (CFG.rub || 300) / 10) * 10) + NB + '₽'; }
  function days(n) { var m = n % 100, k = n % 10; return n + NB + (m >= 11 && m <= 14 ? 'дней' : k === 1 ? 'день' : k >= 2 && k <= 4 ? 'дня' : 'дней'); }
  function cost(b, d) { // дольше никогда не дороже
    if (d >= 30) return b.pm / 30 * d;
    var c = d * (d >= 7 ? b.p7 : b.p1);
    if (d < 7 && b.p7 * 7 < c) c = b.p7 * 7;
    if (b.pm < c) c = b.pm;
    return c;
  }
  function data(el) { return { p1: +el.dataset.p1, p7: +el.dataset.p7, pm: +el.dataset.pm }; }
  function rangeFill(r) { r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); }

  // ---------- своя аналитика и заявки → база MYBIKE (Supabase); без базы — в браузер для демо-админки ----------
  var T = (function () {
    function store(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
    var sid;
    try { sid = sessionStorage.getItem('mb_sid'); if (!sid) { sid = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('mb_sid', sid); } } catch (e) { sid = Math.random().toString(36).slice(2, 10); }
    var q = new URLSearchParams(location.search), src = {}, ref = document.referrer, host = '';
    try { host = ref ? new URL(ref).host : ''; } catch (e) {}
    if (q.get('utm_source')) src = { source: q.get('utm_source'), medium: q.get('utm_medium') || 'utm', campaign: q.get('utm_campaign') || '' };
    else if (q.get('yclid')) src = { source: 'yandex', medium: 'cpc', campaign: q.get('utm_campaign') || '' };
    else if (q.get('gclid')) src = { source: 'google', medium: 'cpc', campaign: '' };
    else if (host && host !== location.host) src = {
      source: /yandex|ya\.ru/.test(host) ? 'yandex' : /google/.test(host) ? 'google' : /t\.me|telegram/.test(host) ? 'telegram' : /instagram/.test(host) ? 'instagram' : /vk\.com/.test(host) ? 'vk' : /2gis/.test(host) ? '2gis' : host.replace(/^www\./, ''),
      medium: /yandex|ya\.ru|google|bing|mail\.ru|duckduckgo/.test(host) ? 'organic' : 'referral', campaign: '', referrer: ref.slice(0, 300),
    };
    var saved = store('mb_src', null);
    if (src.source) { src.ts = Date.now(); try { localStorage.setItem('mb_src', JSON.stringify(src)); } catch (e) {} }
    else if (saved && Date.now() - saved.ts < 30 * 864e5) src = saved;   // источник помним 30 дней
    else src = { source: 'direct', medium: 'none', campaign: '' };
    var ua = navigator.userAgent, dev = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
    var base = CFG.base || '', path = location.pathname.indexOf(base) === 0 ? location.pathname.slice(base.length) || '/' : location.pathname;
    function send(table, row) {
      if (CFG.sb) {
        fetch(CFG.sb.url + '/rest/v1/' + table, { method: 'POST', keepalive: true, headers: { apikey: CFG.sb.key, Authorization: 'Bearer ' + CFG.sb.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) }).catch(function () {});
      } else {
        var k = table === 'leads' ? 'mybike_site_leads' : 'mybike_site_events', a = store(k, []);
        a.push(row); if (a.length > 3000) a = a.slice(-3000);
        try { localStorage.setItem(k, JSON.stringify(a)); } catch (e) {}
      }
    }
    return {
      path: path,
      ev: function (type, extra) {
        send('events', Object.assign({ ts: new Date().toISOString(), sid: sid, type: type, path: path, bike_id: null, source: src.source, medium: src.medium, campaign: src.campaign || '', referrer: src.referrer || '', device: dev, data: null }, extra || {}));
      },
      lead: function (row) {
        send('leads', Object.assign({ created_at: new Date().toISOString(), status: 'new', sid: sid, source: src.source, medium: src.medium, campaign: src.campaign || '', referrer: src.referrer || '', page: path, device: dev }, row));
      },
    };
  })();
  var prodEl = $('[data-product]');
  T.ev('page_view', prodEl ? { bike_id: prodEl.dataset.slug } : null);
  if (prodEl) T.ev('bike_view', { bike_id: prodEl.dataset.slug });

  // ---------- цели: Метрика / GA + своя аналитика ----------
  function goal(name) {
    try { if (window.ym && CFG.ym) window.ym(CFG.ym, 'reachGoal', name); } catch (e) {}
    try { if (window.gtag) window.gtag('event', name); } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-goal]');
    if (g) goal(g.dataset.goal);
    var a = e.target.closest('a[href]'); if (!a) return;
    var h = a.getAttribute('href');
    if (/^https:\/\/t\.me\//.test(h)) T.ev('tg_click');
    else if (/^https:\/\/wa\.me\//.test(h)) T.ev('wa_click');
    else if (/^tel:/.test(h)) T.ev('phone_click');
  });

  // ---------- шапка / меню ----------
  var header = $('[data-header]'), nav = $('[data-nav]'), burger = $('[data-burger]');
  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle('is-scrolled', y > 20);
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  if (burger) burger.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });
  if (nav) nav.addEventListener('click', function (e) { if (e.target.closest('a') && nav.classList.contains('is-open')) burger.click(); });

  // ---------- кнопка «Каталог»: меню по клику (и по наведению — в CSS) ----------
  var hcat = $('[data-hcat]'), hcatBtn = $('[data-hcat-btn]');
  function hcatSet(open) { hcat.classList.toggle('is-open', open); hcatBtn.setAttribute('aria-expanded', open); }
  if (hcat) {
    hcatBtn.addEventListener('click', function () { hcatSet(!hcat.classList.contains('is-open')); });
    document.addEventListener('click', function (e) { if (!hcat.contains(e.target)) hcatSet(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && hcat.classList.contains('is-open')) { hcatSet(false); hcatBtn.focus(); } });
  }

  // ---------- карточки: срок «− N дней +», цена за день и итого ----------
  var MAX_DAYS = 60;
  function updateCard(card, d) {
    d = Math.max(1, Math.min(MAX_DAYS, d));
    card.dataset.days = d;
    var t = cost(data(card), d);
    $('[data-days]', card).textContent = days(d);
    $('[data-perday]', card).textContent = vnd(Math.round(t / d / 100) * 100);   // цена за день — до сотен
    $('[data-sum-label]', card).textContent = 'Итого за ' + days(d);
    $('[data-total]', card).textContent = vnd(t);
    $('[data-rub]', card).textContent = rub(t);
    $$('[data-step]', card).forEach(function (s) { s.disabled = +s.dataset.step < 0 ? d <= 1 : d >= MAX_DAYS; });
  }
  $$('[data-bike]').forEach(function (card) { if ($('[data-perday]', card)) updateCard(card, +card.dataset.days || 7); });
  document.addEventListener('click', function (e) {
    var s = e.target.closest('[data-step]'), card = s && s.closest('[data-bike]');
    if (card) updateCard(card, +card.dataset.days + +s.dataset.step);
  });

  // ---------- каталог: фильтры ----------
  $$('[data-catalog]').forEach(function (cat) {
    var grid = $('[data-grid]', cat), empty = $('[data-empty]', cat);
    var cards = $$('[data-bike]', grid);
    var state = { lic: 'all', group: 'all', sort: 'rank', days: 3 };

    function apply() {
      var shown = 0;
      cards.forEach(function (c) {
        var ok = true;
        if (state.lic === 'none' && c.dataset.license !== 'none') ok = false;
        if (state.group !== 'all') {
          if (state.group === 'nolicense') { if (c.dataset.license !== 'none') ok = false; }
          else if (c.dataset.group !== state.group) ok = false;
        }
        c.hidden = !ok; if (ok) shown++;
      });
      var key = { rank: function (c) { return +c.dataset.rank * 1e7 + +c.dataset.p1; }, cheap: function (c) { return +c.dataset.p1; }, exp: function (c) { return -c.dataset.p1; }, cc: function (c) { return -(+c.dataset.cc || 0.5) * 1e7 - c.dataset.p1; } }[state.sort];
      cards.slice().sort(function (a, b) { return key(a) - key(b); }).forEach(function (c) { grid.appendChild(c); });
      if (empty) empty.hidden = shown > 0;
      // чипы: блокируем классы, которых нет без прав
      $$('[data-group-btn]', cat).forEach(function (b) {
        var g = b.dataset.groupBtn;
        b.classList.toggle('is-active', g === state.group);
        var has = g === 'all' || cards.some(function (c) { return c.dataset.group === g && (state.lic !== 'none' || c.dataset.license === 'none'); });
        b.disabled = !has; b.style.opacity = has ? '' : '.4';
      });
      $$('[data-lic-btn]', cat).forEach(function (b) { b.classList.toggle('is-active', b.dataset.licBtn === state.lic); });
    }
    function setDays(d) {
      state.days = d;
      var r = $('[data-range-all]', cat); if (r) { r.value = Math.min(d, +r.max); rangeFill(r); }
      var o = $('[data-days-all]', cat); if (o) o.textContent = days(d);
      cards.forEach(function (c) { updateCard(c, d); });
    }

    cat.addEventListener('click', function (e) {
      var g = e.target.closest('[data-group-btn]'), l = e.target.closest('[data-lic-btn]');
      if (g) { state.group = g.dataset.groupBtn; apply(); }
      if (l) { state.lic = l.dataset.licBtn; if (state.lic === 'none' && state.group !== 'all' && state.group !== '50' && state.group !== 'e') state.group = 'all'; apply(); }
      if (e.target.closest('[data-reset]')) { state.lic = 'all'; state.group = 'all'; apply(); }
      if (g || l) T.ev('filter', { data: { group: state.group, lic: state.lic } });
    });
    var sort = $('[data-sort]', cat);
    if (sort) sort.addEventListener('change', function () { state.sort = sort.value; apply(); });
    var ra = $('[data-range-all]', cat);
    if (ra) { rangeFill(ra); ra.addEventListener('input', function () { setDays(+ra.value); }); }

    cat._set = function (o) { if (o.group) state.group = o.group; if (o.lic) state.lic = o.lic; if (o.days) setDays(o.days); apply(); };

    // параметры из поиска (?from=&to=&type=)
    var q = new URLSearchParams(location.search);
    var d = diffDays(q.get('from'), q.get('to'));
    if (q.get('type')) state.group = q.get('type');
    if (q.get('type') === 'nolicense') state.lic = 'none';
    if (d) setDays(d);
    apply();
  });

  // ---------- лента «Популярные модели»: стрелки листают на одну карточку ----------
  $$('[data-rail]').forEach(function (rail) {
    var track = $('[data-rail-track]', rail), prev = $('[data-rail-prev]', rail), next = $('[data-rail-next]', rail);
    function step() { var c = track.firstElementChild; return c ? c.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0) : track.clientWidth; }
    function upd() {
      var end = track.scrollWidth - track.clientWidth - 2;
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= end;
    }
    function go(dir) {   // к точной позиции соседней карточки — так прокрутка не спорит со scroll-snap
      var s = step(), i = Math.round(track.scrollLeft / s) + dir;
      track.scrollTo({ left: Math.max(0, i * s), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    if (prev) prev.addEventListener('click', function () { go(-1); });
    if (next) next.addEventListener('click', function () { go(1); });
    track.addEventListener('scroll', upd, { passive: true });
    addEventListener('resize', upd);
    upd();
  });

  function diffDays(a, b) {
    if (!a || !b) return 0;
    var d = Math.round((new Date(b) - new Date(a)) / 864e5);
    return d > 0 ? Math.min(d, 365) : 0;
  }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return iso(d); }

  // ---------- поиск в hero ----------
  var search = $('[data-search]');
  if (search) {
    var f = $('[data-from]', search), t = $('[data-to]', search);
    f.value = addDays(1); t.value = addDays(4); f.min = addDays(0); t.min = addDays(1);
    f.addEventListener('change', function () { if (t.value <= f.value) { var d = new Date(f.value); d.setDate(d.getDate() + 3); t.value = iso(d); } t.min = f.value; });
    search.addEventListener('submit', function (e) {
      var cat = $('#catalog [data-catalog]');
      if (!cat) return;
      e.preventDefault();
      var type = search.elements.type.value;
      cat._set({ group: type, lic: type === 'nolicense' ? 'none' : 'all', days: diffDays(f.value, t.value) || 1 });
      $('#catalog').scrollIntoView({ behavior: 'smooth' });
      goal('search');
      T.ev('search', { data: { type: type, days: diffDays(f.value, t.value) || 1 } });
    });
  }

  // ---------- страница байка ----------
  var prod = $('[data-product]');
  if (prod) {
    var pf = $('[data-pfrom]'), pt = $('[data-pto]');
    pf.value = addDays(1); pt.value = addDays(4); pf.min = addDays(0); pt.min = addDays(1);
    var upd = function () {
      if (pt.value <= pf.value) { var d0 = new Date(pf.value); d0.setDate(d0.getDate() + 1); pt.value = iso(d0); }
      var d = diffDays(pf.value, pt.value) || 1, tt = cost(data(prod), d);
      $('[data-pdays]').textContent = days(d);
      $('[data-ptotal]').textContent = vnd(tt);
      $('[data-prub]').textContent = rub(tt) + ' · ' + vnd(tt / d) + '/день';
    };
    pf.addEventListener('change', upd); pt.addEventListener('change', upd); upd();
  }

  // ---------- модалка бронирования ----------
  var modal = $('[data-modal]'), form = $('[data-booking-form]'), toast = $('[data-toast]');
  var lastFocus;
  function showToast(msg) { toast.textContent = msg; toast.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { toast.hidden = true; }, 5000); }
  function modalTotal() {
    var opt = form.elements.bike.selectedOptions[0];
    var d = diffDays(form.elements.from.value, form.elements.to.value);
    var box = $('[data-modal-total]');
    if (!opt || !d) { box.innerHTML = ''; return; }
    var t = cost(data(opt), d);
    box.innerHTML = 'Итого за ' + days(d) + ': <b>' + vnd(t) + '</b> <span class="muted">' + rub(t) + '</span>';
  }
  function openModal(slug, cardDays) {
    lastFocus = document.activeElement;
    if (slug) form.elements.bike.value = slug;
    var pf2 = $('[data-pfrom]'), pt2 = $('[data-pto]'), sf = $('[data-from]'), st = $('[data-to]');
    form.elements.from.value = (pf2 && pf2.value) || (sf && sf.value) || form.elements.from.value || addDays(1);
    form.elements.to.value = (pt2 && pt2.value) || (st && st.value) || form.elements.to.value || addDays(4);
    if (cardDays) { var to = new Date(form.elements.from.value); to.setDate(to.getDate() + cardDays); form.elements.to.value = iso(to); }   // срок из карточки
    form.elements.from.min = addDays(0);
    modal.hidden = false; document.body.style.overflow = 'hidden';
    modalTotal();
    T.ev('book_open', { bike_id: form.elements.bike.value });
    setTimeout(function () { form.elements.from.focus(); }, 50);
  }
  function closeModal() { modal.hidden = true; document.body.style.overflow = ''; if (lastFocus) lastFocus.focus(); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-book]');
    if (b) { var card = b.closest('[data-bike]'); e.preventDefault(); openModal(b.dataset.book, card && +card.dataset.days); }
    if (e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal && !modal.hidden) closeModal(); });
  if (form) {
    ['change', 'input'].forEach(function (ev) { form.addEventListener(ev, modalTotal); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var via = (e.submitter && e.submitter.value) || 'tg';
      var el = form.elements, opt = el.bike.selectedOptions[0];
      var d = diffDays(el.from.value, el.to.value);
      if (!d) { showToast('Укажите даты получения и возврата'); el.to.focus(); return; }
      var name = opt.textContent.split(' — ')[0], total = cost(data(opt), d);
      var msg = 'Здравствуйте! Хочу забронировать байк.\n' +
        '🛵 ' + name + '\n' +
        '📅 ' + el.from.value.split('-').reverse().join('.') + ' — ' + el.to.value.split('-').reverse().join('.') + ' (' + d + ' дн.)\n' +
        '💰 ' + num(total) + ' ₫ (' + rub(total).replace(NB, ' ') + ')\n' +
        (el.place.value ? '📍 ' + el.place.value + '\n' : '') +
        (el.name.value ? '👤 ' + el.name.value + '\n' : '') +
        'Заявка с сайта ' + location.host;
      var url;
      if (via === 'wa') url = 'https://wa.me/' + CFG.wa + '?text=' + encodeURIComponent(msg);
      else {
        url = 'https://t.me/' + CFG.tg + '?text=' + encodeURIComponent(msg);
        var copied = function () { showToast('Текст заявки скопирован — если он не подставился, вставьте его в чат'); };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(msg).then(copied, function () {});
        } catch (err) {}
      }
      goal('booking_sent');
      T.lead({ bike_id: el.bike.value, date_from: el.from.value, date_to: el.to.value, days: d, total: Math.round(total), price_final: Math.round(total), name: el.name.value.trim() || null, contact: el.contact.value.trim() || null, place: el.place.value.trim() || null, via: via, history: [{ ts: new Date().toISOString(), who: 'сайт', text: 'Заявка с сайта' }] });
      T.ev('lead', { bike_id: el.bike.value, data: { via: via, days: d, total: Math.round(total) } });
      window.open(url, '_blank', 'noopener');
      closeModal();
    });
  }
})();
