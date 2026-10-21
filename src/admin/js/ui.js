/* MYBIKE Admin — общие помощники интерфейса */
(function () {
  'use strict';
  var NB = ' ';
  var U = {};

  U.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  U.num = function (n) { return String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, NB); };
  U.vnd = function (n) { return U.num(n) + NB + '₫'; };
  U.short = function (n) { n = +n || 0; var a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(1).replace('.0', '') + NB + 'млрд' : a >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + NB + 'млн' : a >= 1e4 ? Math.round(n / 1e3) + NB + 'тыс' : U.num(n); };
  U.pct = function (a, b) { return b ? (a / b * 100).toFixed(a / b < 0.1 ? 1 : 0).replace('.0', '') + '%' : '—'; };
  U.iso = function (d) { var x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  U.today = function () { return U.iso(new Date()); };
  U.addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  U.daysAgo = function (n) { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; };
  U.date = function (s) { if (!s) return '—'; var d = new Date(s.length === 10 ? s + 'T00:00:00' : s); return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: d.getFullYear() === new Date().getFullYear() ? undefined : '2-digit' }); };
  U.dt = function (s) { if (!s) return '—'; var d = new Date(s); return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); };
  U.ago = function (s) {
    var m = Math.round((Date.now() - new Date(s)) / 60000);
    if (m < 1) return 'только что'; if (m < 60) return m + ' мин назад';
    var h = Math.round(m / 60); if (h < 24) return h + ' ч назад';
    var d = Math.round(h / 24); return d + ' дн назад';
  };
  U.diffDays = function (a, b) { if (!a || !b) return 0; return Math.round((new Date(b) - new Date(a)) / 864e5); };
  U.debounce = function (f, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { f.apply(s, a); }, ms); }; };
  U.groupBy = function (arr, fn) { var o = {}; arr.forEach(function (x) { var k = fn(x); (o[k] = o[k] || []).push(x); }); return o; };
  U.sum = function (arr, fn) { return arr.reduce(function (s, x) { return s + (+(fn ? fn(x) : x) || 0); }, 0); };
  U.uniq = function (arr) { return Array.from(new Set(arr)); };
  U.cost = function (b, d) { return window.MBCost(b, d); };

  U.STATUS = { new: 'Новая', confirmed: 'Подтверждена', issued: 'Выдан', returned: 'Возвращён', cancelled: 'Отменена', lost: 'Потеряна' };
  U.STATUS_ORDER = ['new', 'confirmed', 'issued', 'returned', 'cancelled', 'lost'];
  U.UNIT = { free: 'Свободен', rented: 'В аренде', service: 'На ТО / ремонте', sold: 'Продан' };
  U.GROUP = { '50': '50 см³', e: 'Электро', '125': '110–125 см³', '150': '150–160 см³', '300': '300+ см³', moto: 'Мотоциклы' };
  U.LIC = { none: 'Без прав', A1: 'A1 / A', A: 'A' };
  U.VIA = { tg: 'Telegram', wa: 'WhatsApp', phone: 'Телефон', site: 'Сайт', walk: 'Пришёл сам' };
  U.EXP = { service: 'ТО', repair: 'Ремонт', fuel: 'Бензин', ads: 'Реклама', salary: 'Зарплата', rent: 'Аренда помещения', purchase: 'Покупка байка', other: 'Прочее' };
  U.EV = { page_view: 'Просмотр страницы', bike_view: 'Просмотр байка', search: 'Поиск', filter: 'Фильтр', book_open: 'Открыл бронь', lead: 'Заявка', tg_click: 'Клик Telegram', wa_click: 'Клик WhatsApp', phone_click: 'Клик телефон' };
  U.SRC = function (s, m) {
    if (!s || s === 'direct') return 'Прямые заходы';
    var n = { yandex: 'Яндекс', google: 'Google', telegram: 'Telegram', instagram: 'Instagram', vk: 'ВКонтакте', '2gis': '2ГИС', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' }[s] || s;
    if (m === 'cpc') return n + ' · реклама'; if (m === 'organic') return n + ' · поиск';
    return n;
  };
  U.badge = function (st, map) { return '<span class="badge b-' + U.esc(st) + '">' + U.esc((map || U.STATUS)[st] || st) + '</span>'; };

  // ------- иконки
  var IC = {
    dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    leads: '<path d="M4 4h16v12H7l-3 3z"/><path d="M8 9h8M8 12h5"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    bike: '<circle cx="5.5" cy="17.5" r="2.5"/><circle cx="18.5" cy="17.5" r="2.5"/><path d="M8 17.5h7.5l2.5-7h-3M14 5h2.5l1.5 5.5M5.5 15l2-4H13"/>',
    units: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M14 4c3-1 6-1 6-1s0 3-1 6l-6 6-5-5z"/><path d="m9 10-3 1-2 3 4 1M14 15l-1 3-3 2-1-4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    dl: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    ext: '<path d="M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    tg: '<path d="M21 4 3 11l6 2 2 6 3-4 5 4z"/><path d="m9 13 8-6"/>',
    wa: '<path d="M3 21l1.7-5A9 9 0 1 1 8 19.4z"/><path d="M9 10c0 3 2 5 5 5l1-1.5-2-1-1 .8c-1-.3-1.8-1.1-2.1-2.1l.8-1-1-2z"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    seo: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6M11 8v6"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    log: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  };
  U.icon = function (n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>'; };

  // ------- toast / modal
  U.toast = function (msg, type) {
    var t = document.createElement('div'); t.className = 'toast' + (type ? ' toast--' + type : ''); t.textContent = msg;
    document.getElementById('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, type === 'err' ? 6000 : 3000);
  };
  U.modal = function (title, body, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = '<div class="modal__box' + (opts.large ? ' modal__box--l' : '') + '" role="dialog" aria-modal="true"><div class="modal__h"><h3>' + U.esc(title) + '</h3><button class="btn btn--i" data-x aria-label="Закрыть">' + U.icon('x') + '</button></div><div class="modal__b">' + body + '</div>' +
        '<div class="modal__f">' + (opts.extra || '') + '<button class="btn" data-x>' + (opts.cancel || 'Отмена') + '</button>' + (opts.ok === false ? '' : '<button class="btn btn--o" data-ok>' + (opts.ok || 'Сохранить') + '</button>') + '</div></div>';
      document.body.appendChild(m);
      function close(v) { m.remove(); document.removeEventListener('keydown', key); resolve(v); }
      function key(e) { if (e.key === 'Escape') close(null); }
      document.addEventListener('keydown', key);
      m.addEventListener('click', async function (e) {
        if (e.target === m || e.target.closest('[data-x]')) close(null);
        if (e.target.closest('[data-ok]')) {
          if (opts.onOk) { try { var r = await opts.onOk(m); if (r === false) return; close(r === undefined ? true : r); } catch (err) { U.toast(err.message, 'err'); } }
          else close(m);
        }
      });
      if (opts.onOpen) opts.onOpen(m);
      var f = m.querySelector('input,select,textarea'); if (f) setTimeout(function () { f.focus(); }, 30);
    });
  };
  U.confirm = function (text, ok) { return U.modal('Подтвердите', '<p>' + U.esc(text) + '</p>', { ok: ok || 'Удалить' }).then(function (r) { return !!r; }); };

  // ------- формы: поля из схемы
  // field: {k, label, type: text|number|select|textarea|check|date|lines|json, opts:[[v,l]], full, hint}
  U.form = function (fields, data, cls) {
    return '<div class="form ' + (cls || '') + '">' + fields.map(function (f) {
      var v = data[f.k], id = 'f_' + f.k, inner;
      if (f.type === 'select') inner = '<select class="select" name="' + f.k + '" id="' + id + '">' + f.opts.map(function (o) { return '<option value="' + U.esc(o[0]) + '"' + (String(o[0]) === String(v == null ? '' : v) ? ' selected' : '') + '>' + U.esc(o[1]) + '</option>'; }).join('') + '</select>';
      else if (f.type === 'textarea' || f.type === 'lines' || f.type === 'json') inner = '<textarea class="textarea" name="' + f.k + '" id="' + id + '" rows="' + (f.rows || 4) + '">' + U.esc(f.type === 'lines' ? (v || []).join('\n') : f.type === 'json' ? JSON.stringify(v || [], null, 2) : (v == null ? '' : v)) + '</textarea>';
      else if (f.type === 'check') return '<label class="chk' + (f.full ? ' full' : '') + '"><input type="checkbox" name="' + f.k + '"' + (v ? ' checked' : '') + '> ' + U.esc(f.label) + '</label>';
      else inner = '<input class="input" type="' + (f.type || 'text') + '" name="' + f.k + '" id="' + id + '" value="' + U.esc(v == null ? '' : v) + '"' + (f.ph ? ' placeholder="' + U.esc(f.ph) + '"' : '') + (f.step ? ' step="' + f.step + '"' : '') + '>';
      return '<label class="fld' + (f.full ? ' full' : '') + '" for="' + id + '"><span>' + U.esc(f.label) + '</span>' + inner + (f.hint ? '<small>' + f.hint + '</small>' : '') + '</label>';
    }).join('') + '</div>';
  };
  U.read = function (root, fields) {
    var o = {};
    fields.forEach(function (f) {
      var el = root.querySelector('[name="' + f.k + '"]'); if (!el) return;
      if (f.type === 'check') o[f.k] = el.checked;
      else if (f.type === 'number') o[f.k] = el.value === '' ? null : +el.value;
      else if (f.type === 'lines') o[f.k] = el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      else if (f.type === 'json') { try { o[f.k] = JSON.parse(el.value || '[]'); } catch (e) { throw new Error('Поле «' + f.label + '»: неверный JSON'); } }
      else o[f.k] = el.value.trim();
    });
    return o;
  };

  // ------- таблица с сортировкой
  U.table = function (cols, rows, opts) {
    opts = opts || {};
    if (!rows.length) return '<div class="tbl-wrap"><div class="empty">' + (opts.empty || 'Нет данных') + '</div></div>';
    return '<div class="tbl-wrap"' + (opts.max ? ' style="max-height:' + opts.max + 'px"' : '') + '><table class="tbl"><thead><tr>' + cols.map(function (c) { return '<th class="' + (c.num ? 'num' : '') + '">' + U.esc(c.t) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr' + (opts.rowAttr ? ' ' + opts.rowAttr(r) : '') + '>' + cols.map(function (c) { return '<td class="' + (c.num ? 'num' : '') + (c.cls ? ' ' + c.cls : '') + '">' + c.v(r) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
  };

  // ------- графики (Chart.js)
  var charts = [];
  U.destroyCharts = function () { charts.forEach(function (c) { c.destroy(); }); charts = []; };
  U.PAL = ['#FF6B2C', '#1E1E1E', '#2F6FEB', '#1F9D55', '#C98A00', '#9B59B6', '#D93838', '#14A3B8', '#8D6E63', '#9AA1A9'];
  U.chart = function (el, cfg) {
    if (!window.Chart || !el) { if (el) el.innerHTML = '<div class="empty">График недоступен (нет связи с CDN)</div>'; return; }
    var cv = document.createElement('canvas'); el.innerHTML = ''; el.appendChild(cv);
    Chart.defaults.font.family = "'Manrope', system-ui, sans-serif"; Chart.defaults.color = '#7C7C7C';
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8 } } } }, cfg.options || {});
    var c = new Chart(cv, cfg); charts.push(c); return c;
  };
  U.lineChart = function (el, labels, sets, opts) {
    return U.chart(el, { type: 'line', data: { labels: labels, datasets: sets.map(function (s, i) { return Object.assign({ borderColor: U.PAL[i], backgroundColor: i === 0 ? 'rgba(255,107,44,.12)' : 'transparent', fill: i === 0, tension: .35, pointRadius: 0, borderWidth: 2 }, s); }) },
      options: Object.assign({ scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }, y: { beginAtZero: true, grid: { color: '#f0f0f0' } } } }, opts || {}) });
  };
  U.barChart = function (el, labels, sets, opts) {
    return U.chart(el, { type: 'bar', data: { labels: labels, datasets: sets.map(function (s, i) { return Object.assign({ backgroundColor: U.PAL[i], borderRadius: 6, maxBarThickness: 36 }, s); }) },
      options: Object.assign({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#f0f0f0' } } } }, opts || {}) });
  };
  U.doughnut = function (el, labels, data) {
    return U.chart(el, { type: 'doughnut', data: { labels: labels, datasets: [{ data: data, backgroundColor: U.PAL, borderWidth: 0 }] }, options: { cutout: '68%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } } }, interaction: { mode: 'nearest' } } });
  };
  U.hbars = function (items, fmt) { // [[label, value, sub]]
    var max = Math.max.apply(null, items.map(function (i) { return i[1]; }).concat([1]));
    if (!items.length) return '<div class="empty">Нет данных</div>';
    return '<div class="hbars">' + items.map(function (i) { return '<div class="hbar"><span>' + i[0] + '</span><b>' + (fmt ? fmt(i[1]) : U.num(i[1])) + (i[2] ? ' <small class="muted">' + i[2] + '</small>' : '') + '</b><div class="hbar__t"><div style="width:' + (i[1] / max * 100) + '%"></div></div></div>'; }).join('') + '</div>';
  };
  U.funnel = function (steps) { // [[label, value]]
    var top = steps[0][1] || 1;
    return '<div class="funnel">' + steps.map(function (s, i) {
      var prev = i ? steps[i - 1][1] : s[1];
      return '<div class="funnel__r"><span>' + s[0] + '</span><div class="funnel__bar"><div style="width:' + (s[1] / top * 100) + '%"></div></div><span><b>' + U.num(s[1]) + '</b> <small>' + (i ? U.pct(s[1], prev) + ' от пред.' : '') + '</small></span></div>';
    }).join('') + '</div>';
  };

  // ------- выгрузка
  U.download = function (name, text, type) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' })); a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  };
  U.csv = function (name, cols, rows) {
    var q = function (v) { v = v == null ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var text = '﻿' + cols.map(function (c) { return q(c[0]); }).join(';') + '\n' + rows.map(function (r) { return cols.map(function (c) { return q(c[1](r)); }).join(';'); }).join('\n');
    U.download(name, text, 'text/csv;charset=utf-8');
  };

  // ------- ссылки на мессенджеры
  U.contactLink = function (lead) {
    var c = (lead.contact || '').trim();
    if (!c) return '';
    if (c[0] === '@') return 'https://t.me/' + c.slice(1);
    var d = c.replace(/\D/g, '');
    if (lead.via === 'wa' && d) return 'https://wa.me/' + d;
    if (lead.via === 'tg' && d) return 'https://t.me/+' + d;
    return d ? 'tel:+' + d : '';
  };

  window.U = U;
})();
