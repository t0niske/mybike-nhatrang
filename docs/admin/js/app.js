/* MYBIKE Admin — ядро: вход, меню, роутер, данные */
(function () {
  'use strict';
  var A = window.A = { views: {}, cache: null };
  var app = document.getElementById('app');
  var CFG = window.MYBIKE_ADMIN || {};

  var NAV = [
    ['Работа', null],
    ['dash', 'Дашборд', '#/'],
    ['leads', 'Заявки', '#/leads', 'newCount'],
    ['cal', 'Календарь брони', '#/calendar'],
    ['users', 'Клиенты', '#/clients'],
    ['Парк', null],
    ['bike', 'Модели и цены', '#/bikes'],
    ['units', 'Байки парка', '#/units'],
    ['Цифры', null],
    ['chart', 'Аналитика', '#/analytics'],
    ['money', 'Финансы', '#/finance'],
    ['Сайт', null],
    ['doc', 'Контент сайта', '#/content'],
    ['rocket', 'Публикация и SEO', '#/publish'],
    ['gear', 'Настройки', '#/settings'],
  ];

  // ------------------------------------------------------------ данные
  A.data = async function (force) {
    if (A.cache && !force) return A.cache;
    var since = U.iso(U.daysAgo(120));
    var r = await Promise.all([A.DB.list('bikes'), A.DB.list('units'), A.DB.list('leads'), A.DB.list('expenses'), A.DB.list('events', { since: since })]);
    var d = { bikes: r[0], units: r[1], leads: r[2], expenses: r[3], events: r[4] };
    d.bikes.sort(function (a, b) { return (a.rank || 0) - (b.rank || 0) || a.p1 - b.p1; });
    d.bike = {}; d.bikes.forEach(function (b) { d.bike[b.id] = b; });
    d.unit = {}; d.units.forEach(function (u) { d.unit[u.id] = u; });
    d.leads.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
    A.cache = d;
    return d;
  };
  A.invalidate = function () { A.cache = null; };
  A.val = function (l) { return +(l.price_final || l.total || 0); };
  A.bikeName = function (d, id) { return d.bike[id] ? d.bike[id].name : (id || '—'); };
  A.log = function (action, entity, id, data) {
    A.DB.insert('audit', { actor: A.ME.email, action: action, entity: entity || '', entity_id: id ? String(id) : '', data: data || null }).catch(function () {});
  };
  A.canWrite = function () { return A.ME.role === 'owner' || A.ME.role === 'manager'; };
  A.isOwner = function () { return A.ME.role === 'owner'; };
  A.siteUrl = function (path) { return (CFG.site_base || '..') + (path || '/'); };

  // активна ли бронь на дату / пересечение
  A.overlap = function (a1, a2, b1, b2) { return a1 <= b2 && b1 <= a2; };
  A.unitBusy = function (d, unitId, from, to, exceptId) {
    return d.leads.filter(function (l) { return l.unit_id === unitId && l.id !== exceptId && ['confirmed', 'issued', 'new'].indexOf(l.status) >= 0 && A.overlap(l.date_from, l.date_to, from, to); });
  };

  // ------------------------------------------------------------ вход
  function loginView(msg) {
    var demo = A.DB.mode === 'demo';
    app.className = '';
    app.innerHTML = '<div class="login"><form class="login__box" id="lf">' +
      '<div class="row"><span class="brand__m">' + U.icon('bike') + '</span><h1>MYBIKE · админка</h1></div>' +
      (demo
        ? '<p class="note">Демо-режим: база ещё не подключена. Данные — пример, хранятся только в этом браузере. Подключить базу можно в «Настройки → Подключение».</p><button class="btn btn--o" type="submit">Войти в демо</button>'
        : '<label class="fld"><span>Email</span><input class="input" name="email" type="email" autocomplete="username" required></label>' +
          '<label class="fld"><span>Пароль</span><input class="input" name="pw" type="password" autocomplete="current-password" required minlength="6"></label>' +
          '<button class="btn btn--o" type="submit">Войти</button><button class="btn" type="button" id="su">Создать аккаунт сотрудника</button>' +
          '<p class="hint">Владельцем становится аккаунт с email, заданным при настройке базы. Остальных сотрудников владелец добавляет в «Настройки → Сотрудники».</p>') +
      (msg ? '<p class="note note--red">' + U.esc(msg) + '</p>' : '') + '</form></div>';
    var f = document.getElementById('lf');
    async function go(signup) {
      try {
        A.ME = signup ? await A.DB.signup(f.email.value, f.pw.value) : await A.DB.login(f.email && f.email.value, f.pw && f.pw.value);
        start();
      } catch (e) { loginView(e.message); }
    }
    f.addEventListener('submit', function (e) { e.preventDefault(); go(false); });
    var su = document.getElementById('su'); if (su) su.addEventListener('click', function () { if (f.reportValidity()) go(true); });
  }
  function noAccess() {
    app.innerHTML = '<div class="login"><div class="login__box"><h1>Нет доступа</h1><p>Аккаунт <b>' + U.esc(A.ME.email) + '</b> создан, но ещё не добавлен в сотрудники. Попросите владельца добавить вас в «Настройки → Сотрудники», затем обновите страницу.</p><button class="btn" id="lo">Выйти</button></div></div>';
    document.getElementById('lo').onclick = async function () { await A.DB.logout(); location.reload(); };
  }

  // ------------------------------------------------------------ каркас
  function shell() {
    app.className = '';
    var nav = NAV.map(function (n) {
      if (n[1] === null) return '<div class="snav__h">' + n[0] + '</div>';
      return '<a href="' + n[2] + '" data-nav="' + n[2] + '">' + U.icon(n[0]) + '<span>' + n[1] + '</span>' + (n[3] ? '<i data-badge="' + n[3] + '" hidden></i>' : '') + '</a>';
    }).join('');
    app.innerHTML = '<div class="layout"><aside class="side" id="side"><a class="brand" href="#/"><span class="brand__m">' + U.icon('bike') + '</span><span><b>MYBIKE</b><small>админка</small></span></a><nav class="snav">' + nav + '</nav>' +
      '<div class="side__foot"><span class="mode' + (A.DB.mode === 'supabase' ? ' mode--live' : '') + '">' + (A.DB.mode === 'supabase' ? 'База подключена' : 'Демо-режим') + '</span><span>' + U.esc(A.ME.name || A.ME.email) + ' · ' + ({ owner: 'владелец', manager: 'менеджер', viewer: 'наблюдатель' }[A.ME.role] || '') + '</span><a href="' + A.siteUrl('/') + '" target="_blank" rel="noopener">Открыть сайт ↗</a><a href="#" id="logout">Выйти</a></div></aside>' +
      '<div class="main">' + (A.DB.mode === 'demo' ? '<div class="demo-bar"><b>Демо-режим.</b> Показаны примерные данные, они хранятся только в этом браузере. Ваши клики и заявки с сайта на этом устройстве тоже попадают сюда. <a href="#/settings">Подключить базу →</a></div>' : '') +
      '<header class="top"><button class="burger" id="burger" aria-label="Меню">' + U.icon('menu') + '</button><h1 id="title"></h1><div class="top__r" id="actions"></div></header><section class="view" id="view"></section></div></div>';
    document.getElementById('logout').onclick = async function (e) { e.preventDefault(); await A.DB.logout(); location.hash = '#/'; location.reload(); };
    document.getElementById('burger').onclick = function () { document.getElementById('side').classList.toggle('is-open'); };
    document.getElementById('side').addEventListener('click', function (e) { if (e.target.closest('a') && innerWidth < 960) this.classList.remove('is-open'); });
  }
  A.setTop = function (title, actions) {
    document.getElementById('title').textContent = title;
    document.getElementById('actions').innerHTML = actions || '';
    document.title = title + ' — MYBIKE админка';
  };
  async function badges() {
    try {
      var d = await A.data();
      var n = d.leads.filter(function (l) { return l.status === 'new'; }).length;
      var b = document.querySelector('[data-badge=newCount]'); if (b) { b.textContent = n; b.hidden = !n; }
    } catch (e) {}
  }

  // ------------------------------------------------------------ роутер
  var ROUTES = [
    [/^#?\/?$/, 'dashboard'], [/^#\/leads$/, 'leads'], [/^#\/lead\/(.+)$/, 'lead'], [/^#\/calendar$/, 'calendar'], [/^#\/clients$/, 'clients'],
    [/^#\/bikes$/, 'bikes'], [/^#\/bike\/(.+)$/, 'bike'], [/^#\/units$/, 'units'], [/^#\/analytics$/, 'analytics'], [/^#\/finance$/, 'finance'],
    [/^#\/content$/, 'content'], [/^#\/publish$/, 'publish'], [/^#\/settings$/, 'settings'],
  ];
  async function route() {
    var h = location.hash || '#/', old = document.getElementById('view');
    if (!old) return;
    var view = old.cloneNode(false); old.replaceWith(view); // сбрасываем обработчики прошлого экрана
    U.destroyCharts();
    var name = 'dashboard', params = [];
    for (var i = 0; i < ROUTES.length; i++) { var m = h.match(ROUTES[i][0]); if (m) { name = ROUTES[i][1]; params = m.slice(1).map(decodeURIComponent); break; } }
    var navKey = { lead: '#/leads', bike: '#/bikes', dashboard: '#/' }[name] || h;
    document.querySelectorAll('[data-nav]').forEach(function (a) { a.classList.toggle('is-active', a.dataset.nav === navKey); });
    view.innerHTML = '<div class="boot" style="height:50vh"><div class="spin"></div></div>';
    try { await A.views[name](view, params); }
    catch (e) { console.error(e); view.innerHTML = '<div class="card note--red"><b>Ошибка:</b> ' + U.esc(e.message) + '</div>'; }
    badges();
    scrollTo(0, 0);
  }
  A.rerender = route;
  A.go = function (h) { if (location.hash === h) route(); else location.hash = h; };
  A.refresh = function () { A.invalidate(); route(); };
  addEventListener('hashchange', route);

  // ------------------------------------------------------------ старт
  async function start() {
    if (A.DB.mode === 'supabase' && !A.ME.role) return noAccess();
    shell(); route();
  }
  // старт после загрузки всех скриптов разделов (v-*.js)
  document.addEventListener('DOMContentLoaded', async function boot() {
    try {
      A.DB = await MBDB.create();
      A.ME = await A.DB.session();
      if (!A.ME) return loginView();
      start();
    } catch (e) {
      console.error(e);
      app.className = '';
      app.innerHTML = '<div class="login"><div class="login__box"><h1>Ошибка запуска</h1><p>' + U.esc(e.message) + '</p><p class="hint">Если вы меняли подключение к базе — можно вернуться в демо-режим.</p><button class="btn" id="rd">Вернуться в демо-режим</button></div></div>';
      document.getElementById('rd').onclick = function () { MBDB.setConn(null); location.reload(); };
    }
  });
})();
