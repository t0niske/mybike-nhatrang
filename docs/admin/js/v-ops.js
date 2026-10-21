/* MYBIKE Admin — работа: дашборд, заявки, карточка заявки, календарь, клиенты */
(function () {
  'use strict';
  var V = A.views;
  var ACTIVE = ['new', 'confirmed', 'issued'];
  var DONE = ['issued', 'returned'];

  function periodSel(cur, id) {
    return '<div class="seg" id="' + (id || 'per') + '">' + [[7, '7 дней'], [30, '30 дней'], [90, '90 дней']].map(function (p) { return '<button data-p="' + p[0] + '" class="' + (p[0] === cur ? 'is-active' : '') + '">' + p[1] + '</button>'; }).join('') + '</div>';
  }
  A.periodSel = periodSel;
  function sessions(evs) { return U.uniq(evs.map(function (e) { return e.sid; })).length; }
  A.sessions = sessions;
  function inRange(s, from, to) { return s >= from && (!to || s < to); }

  // ============================================================ ДАШБОРД
  var dashP = 30;
  V.dashboard = async function (root) {
    var d = await A.data();
    A.setTop('Дашборд', periodSel(dashP));
    document.getElementById('per').onclick = function (e) { var b = e.target.closest('[data-p]'); if (b) { dashP = +b.dataset.p; A.rerender(); } };
    var from = U.daysAgo(dashP - 1).toISOString(), prevFrom = U.daysAgo(dashP * 2 - 1).toISOString();
    var ev = d.events.filter(function (e) { return e.ts >= from; }), evPrev = d.events.filter(function (e) { return inRange(e.ts, prevFrom, from); });
    var leads = d.leads.filter(function (l) { return l.created_at >= from; }), leadsPrev = d.leads.filter(function (l) { return inRange(l.created_at, prevFrom, from); });
    var s = sessions(ev), sPrev = sessions(evPrev);
    var fromD = from.slice(0, 10), prevD = prevFrom.slice(0, 10);
    var rev = U.sum(d.leads.filter(function (l) { return DONE.indexOf(l.status) >= 0 && l.date_from >= fromD; }), A.val);
    var revPrev = U.sum(d.leads.filter(function (l) { return DONE.indexOf(l.status) >= 0 && inRange(l.date_from, prevD, fromD); }), A.val);
    var deals = d.leads.filter(function (l) { return DONE.indexOf(l.status) >= 0 && l.date_from >= fromD; });
    var active = d.units.filter(function (u) { return u.status !== 'sold'; }), rented = active.filter(function (u) { return u.status === 'rented'; });
    var newL = d.leads.filter(function (l) { return l.status === 'new'; });
    function delta(a, b) { if (!b) return ''; var p = Math.round((a - b) / b * 100); return '<small class="' + (p >= 0 ? 'up' : 'down') + '">' + (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '% к пред. периоду</small>'; }

    var today = U.today(), tomorrow = U.iso(U.addDays(new Date(), 1));
    var issueToday = d.leads.filter(function (l) { return l.status === 'confirmed' && (l.date_from === today || l.date_from === tomorrow); });
    var returnToday = d.leads.filter(function (l) { return l.status === 'issued' && (l.date_to === today || l.date_to === tomorrow); });
    var overdue = d.leads.filter(function (l) { return l.status === 'issued' && l.date_to < today; });
    var noUnit = d.leads.filter(function (l) { return l.status === 'confirmed' && !l.unit_id; });
    var service = d.units.filter(function (u) { return u.status !== 'sold' && u.next_service_km && u.mileage >= u.next_service_km - 200; });
    var debts = d.leads.filter(function (l) { return DONE.indexOf(l.status) >= 0 && A.val(l) - (l.paid || 0) > 0; });

    function lrow(l, extra) { return '<a class="li row between" style="text-decoration:none" href="#/lead/' + l.id + '"><span><b>' + U.esc(l.name || 'Без имени') + '</b> · ' + U.esc(A.bikeName(d, l.bike_id)) + '<br><small class="muted">' + U.date(l.date_from) + ' — ' + U.date(l.date_to) + ' · ' + U.esc(l.place || '') + '</small></span><span>' + (extra || U.badge(l.status)) + '</span></a>'; }
    var attention = [];
    newL.slice().reverse().slice(0, 6).forEach(function (l) { attention.push(lrow(l, '<span class="badge b-new">Новая · ' + U.ago(l.created_at) + '</span>')); });
    overdue.forEach(function (l) { attention.push(lrow(l, '<span class="badge b-lost">Просрочен возврат</span>')); });
    issueToday.forEach(function (l) { attention.push(lrow(l, '<span class="badge b-confirmed">Выдача ' + (l.date_from === today ? 'сегодня' : 'завтра') + '</span>')); });
    returnToday.forEach(function (l) { attention.push(lrow(l, '<span class="badge b-issued">Возврат ' + (l.date_to === today ? 'сегодня' : 'завтра') + '</span>')); });
    noUnit.slice(0, 5).forEach(function (l) { attention.push(lrow(l, '<span class="badge b-service">Не назначен байк</span>')); });
    service.forEach(function (u) { attention.push('<a class="li row between" style="text-decoration:none" href="#/units"><span><b>' + U.esc(u.plate) + '</b> · ' + U.esc(A.bikeName(d, u.bike_id)) + '<br><small class="muted">Пробег ' + U.num(u.mileage) + ' км, ТО на ' + U.num(u.next_service_km) + ' км</small></span><span class="badge b-service">Пора на ТО</span></a>'); });

    var bv = sessions(ev.filter(function (e) { return e.type === 'bike_view'; }));
    var bo = sessions(ev.filter(function (e) { return e.type === 'book_open'; }));
    var conf = leads.filter(function (l) { return ['confirmed', 'issued', 'returned'].indexOf(l.status) >= 0; }).length;
    var issued = leads.filter(function (l) { return DONE.indexOf(l.status) >= 0; }).length;

    root.innerHTML =
      '<div class="kpis">' +
      '<a class="kpi kpi--accent" href="#/leads"><span>Новые заявки</span><b>' + newL.length + '</b><small>ждут ответа</small></a>' +
      '<div class="kpi"><span>Посетители</span><b>' + U.num(s) + '</b>' + delta(s, sPrev) + '</div>' +
      '<div class="kpi"><span>Заявки</span><b>' + leads.length + '</b>' + delta(leads.length, leadsPrev.length) + '</div>' +
      '<div class="kpi"><span>Конверсия в заявку</span><b>' + U.pct(leads.length, s) + '</b><small class="muted">заявки / посетители</small></div>' +
      '<div class="kpi"><span>Выручка</span><b>' + U.short(rev) + ' ₫</b>' + delta(rev, revPrev) + '</div>' +
      '<div class="kpi"><span>Средний чек</span><b>' + U.short(deals.length ? rev / deals.length : 0) + ' ₫</b><small class="muted">' + deals.length + ' аренд</small></div>' +
      '<div class="kpi"><span>Загрузка парка</span><b>' + U.pct(rented.length, active.length) + '</b><small class="muted">' + rented.length + ' из ' + active.length + ' в аренде</small></div>' +
      '<div class="kpi"><span>Долги клиентов</span><b>' + U.short(U.sum(debts, function (l) { return A.val(l) - (l.paid || 0); })) + ' ₫</b><small class="muted">' + debts.length + ' аренд</small></div>' +
      '</div>' +
      '<div class="grid g-2-1"><div class="card"><div class="card__h"><h2>Посетители и заявки по дням</h2></div><div class="chart" id="c1"></div></div>' +
      '<div class="card"><div class="card__h"><h2>Требует внимания</h2><small>' + attention.length + '</small></div><div class="list-items" style="max-height:290px;overflow:auto">' + (attention.join('') || '<div class="empty">Всё под контролем 👍</div>') + '</div></div></div>' +
      '<div class="grid g3"><div class="card"><div class="card__h"><h2>Воронка</h2></div>' + U.funnel([['Посетители', s], ['Смотрели байк', bv], ['Открыли бронь', bo], ['Оставили заявку', leads.length], ['Подтверждено', conf], ['Выдано', issued]]) + '</div>' +
      '<div class="card"><div class="card__h"><h2>Источники посетителей</h2></div><div class="chart chart--s" id="c2"></div></div>' +
      '<div class="card"><div class="card__h"><h2>Популярные байки</h2><small>по заявкам</small></div>' + U.hbars(Object.entries(U.groupBy(leads, function (l) { return l.bike_id; })).map(function (e) { return [U.esc(A.bikeName(d, e[0])), e[1].length]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 7)) + '</div></div>' +
      '<div class="card"><div class="card__h"><h2>Последние заявки</h2><a class="btn btn--s" href="#/leads">Все заявки</a></div>' + leadsTable(d, d.leads.slice(0, 8)) + '</div>';

    var days = [], i;
    for (i = dashP - 1; i >= 0; i--) days.push(U.iso(U.daysAgo(i)));
    var sByDay = U.groupBy(ev, function (e) { return U.iso(e.ts); }), lByDay = U.groupBy(leads, function (l) { return U.iso(l.created_at); });
    U.lineChart(document.getElementById('c1'), days.map(function (x) { return U.date(x); }),
      [{ label: 'Посетители', data: days.map(function (x) { return sessions(sByDay[x] || []); }) }, { label: 'Заявки', data: days.map(function (x) { return (lByDay[x] || []).length; }), yAxisID: 'y1', borderColor: '#1E1E1E' }],
      { scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { beginAtZero: true, grid: { color: '#f0f0f0' } }, y1: { beginAtZero: true, position: 'right', grid: { display: false } } } });
    var src = Object.entries(U.groupBy(ev.filter(function (e) { return e.type === 'page_view'; }), function (e) { return U.SRC(e.source, e.medium); })).map(function (e) { return [e[0], sessions(e[1])]; }).sort(function (a, b) { return b[1] - a[1]; });
    U.doughnut(document.getElementById('c2'), src.map(function (x) { return x[0]; }), src.map(function (x) { return x[1]; }));
    bindLeadsTable(root);
  };

  // ============================================================ ТАБЛИЦА ЗАЯВОК
  function leadsTable(d, rows, opts) {
    return U.table([
      { t: 'Создана', v: function (l) { return '<span class="nowrap">' + U.dt(l.created_at) + '</span><small>' + U.ago(l.created_at) + '</small>'; } },
      { t: 'Клиент', v: function (l) { return '<b>' + U.esc(l.name || 'Без имени') + '</b><small>' + U.esc(l.contact || '—') + ' · ' + (U.VIA[l.via] || U.esc(l.via || '')) + '</small>'; } },
      { t: 'Байк', v: function (l) { var u = d.unit[l.unit_id]; return U.esc(A.bikeName(d, l.bike_id)) + '<small>' + (u ? U.esc(u.plate) : (ACTIVE.indexOf(l.status) >= 0 ? '<span style="color:var(--yellow)">байк не назначен</span>' : '')) + '</small>'; } },
      { t: 'Даты', v: function (l) { return '<span class="nowrap">' + U.date(l.date_from) + ' — ' + U.date(l.date_to) + '</span><small>' + (l.days || U.diffDays(l.date_from, l.date_to)) + ' дн.</small>'; } },
      { t: 'Сумма', num: true, v: function (l) { var debt = DONE.indexOf(l.status) >= 0 ? A.val(l) - (l.paid || 0) : 0; return U.vnd(A.val(l)) + (debt > 0 ? '<small style="color:var(--red)">долг ' + U.vnd(debt) + '</small>' : ''); } },
      { t: 'Источник', v: function (l) { return '<span class="nowrap">' + U.esc(U.SRC(l.source, l.medium)) + '</span>' + (l.campaign ? '<small>' + U.esc(l.campaign) + '</small>' : ''); } },
      { t: 'Статус', v: function (l) { return A.canWrite() ? '<select class="select-inline badge b-' + l.status + '" data-st="' + l.id + '">' + U.STATUS_ORDER.map(function (s) { return '<option value="' + s + '"' + (s === l.status ? ' selected' : '') + '>' + U.STATUS[s] + '</option>'; }).join('') + '</select>' : U.badge(l.status); } },
    ], rows, Object.assign({ rowAttr: function (l) { return 'class="click" data-href="#/lead/' + l.id + '"'; }, empty: 'Заявок нет' }, opts || {}));
  }
  A.leadsTable = leadsTable;
  function bindLeadsTable(root) {
    root.addEventListener('click', function (e) {
      if (e.target.closest('select,a,button,input')) return;
      var tr = e.target.closest('tr[data-href]'); if (tr) location.hash = tr.dataset.href;
    });
    root.addEventListener('change', async function (e) {
      var s = e.target.closest('[data-st]'); if (!s) return;
      try { await setStatus(s.dataset.st, s.value); s.className = 'select-inline badge b-' + s.value; U.toast('Статус: ' + U.STATUS[s.value], 'ok'); }
      catch (err) { U.toast(err.message, 'err'); }
    });
  }
  A.bindLeadsTable = bindLeadsTable;

  async function setStatus(id, st, extra) {
    var d = await A.data(), l = d.leads.find(function (x) { return x.id === id; });
    var hist = (l.history || []).concat([{ ts: new Date().toISOString(), who: A.ME.name || A.ME.email, text: 'Статус: ' + U.STATUS[st] }]);
    var patch = Object.assign({ status: st, history: hist }, extra || {});
    if (st === 'issued' && !(l.paid > 0) && !(extra && 'paid' in extra)) { /* оплата отмечается вручную */ }
    var upd = await A.DB.update('leads', id, patch);
    Object.assign(l, upd);
    var u = d.unit[l.unit_id];
    if (u) {
      var us = st === 'issued' ? 'rented' : (['returned', 'cancelled', 'lost'].indexOf(st) >= 0 && u.status === 'rented' ? 'free' : null);
      if (us) { Object.assign(u, await A.DB.update('units', u.id, { status: us })); }
    }
    A.log('Статус заявки → ' + U.STATUS[st], 'lead', id);
    return l;
  }

  // ============================================================ ЗАЯВКИ
  var LF = { tab: 'active', q: '', per: 'all', bike: '', src: '' };
  A.leadFilter = LF;
  V.leads = async function (root) {
    var d = await A.data();
    A.setTop('Заявки', (A.canWrite() ? '<button class="btn btn--o" id="nl">' + U.icon('plus') + 'Новая заявка</button>' : '') + '<button class="btn" id="csv">' + U.icon('dl') + 'CSV</button>');
    var srcs = U.uniq(d.leads.map(function (l) { return U.SRC(l.source, l.medium); })).sort();
    root.innerHTML = '<div class="card" style="padding:0"><div class="tabs" id="tabs" style="padding:0 12px"></div><div class="toolbar" style="padding:14px 16px">' +
      '<input class="input grow" id="q" placeholder="Поиск: имя, контакт, отель, комментарий" value="' + U.esc(LF.q) + '">' +
      '<select class="select" id="per" style="width:auto"><option value="all">За всё время</option><option value="1">Сегодня</option><option value="7">7 дней</option><option value="30">30 дней</option><option value="90">90 дней</option></select>' +
      '<select class="select" id="bk" style="width:auto"><option value="">Все байки</option>' + d.bikes.map(function (b) { return '<option value="' + b.id + '">' + U.esc(b.name) + '</option>'; }).join('') + '</select>' +
      '<select class="select" id="sr" style="width:auto"><option value="">Все источники</option>' + srcs.map(function (s) { return '<option>' + U.esc(s) + '</option>'; }).join('') + '</select></div></div><div id="list"></div>';
    root.querySelector('#per').value = LF.per; root.querySelector('#bk').value = LF.bike; root.querySelector('#sr').value = LF.src;

    function filtered(skipTab) {
      var q = LF.q.toLowerCase(), since = LF.per === 'all' ? '' : U.daysAgo(+LF.per - 1).toISOString();
      return d.leads.filter(function (l) {
        if (!skipTab) { if (LF.tab === 'active' ? ACTIVE.indexOf(l.status) < 0 : LF.tab !== 'all' && l.status !== LF.tab) return false; }
        if (since && l.created_at < since) return false;
        if (LF.bike && l.bike_id !== LF.bike) return false;
        if (LF.src && U.SRC(l.source, l.medium) !== LF.src) return false;
        if (q && [l.name, l.contact, l.place, l.comment, A.bikeName(d, l.bike_id)].join(' ').toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
    }
    function draw() {
      var base = filtered(true), cnt = U.groupBy(base, function (l) { return l.status; });
      var tabs = [['active', 'Активные', base.filter(function (l) { return ACTIVE.indexOf(l.status) >= 0; }).length]].concat(U.STATUS_ORDER.map(function (s) { return [s, U.STATUS[s], (cnt[s] || []).length]; })).concat([['all', 'Все', base.length]]);
      root.querySelector('#tabs').innerHTML = tabs.map(function (t) { return '<button data-tab="' + t[0] + '" class="' + (LF.tab === t[0] ? 'is-active' : '') + '">' + t[1] + '<i>' + t[2] + '</i></button>'; }).join('');
      var rows = filtered();
      if (LF.tab === 'active') rows.sort(function (a, b) { var o = { new: 0, confirmed: 1, issued: 2 }; return o[a.status] - o[b.status] || (a.status === 'new' ? (a.created_at < b.created_at ? -1 : 1) : (a.date_from < b.date_from ? -1 : 1)); });
      root.querySelector('#list').innerHTML = '<p class="hint" style="margin-bottom:8px">Показано: ' + rows.length + ' · на сумму ' + U.vnd(U.sum(rows, A.val)) + '</p>' + leadsTable(d, rows.slice(0, 500));
    }
    root.querySelector('#tabs').onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) { LF.tab = b.dataset.tab; draw(); } };
    root.querySelector('#q').oninput = U.debounce(function (e) { LF.q = e.target.value; draw(); }, 200);
    root.querySelector('#per').onchange = function (e) { LF.per = e.target.value; draw(); };
    root.querySelector('#bk').onchange = function (e) { LF.bike = e.target.value; draw(); };
    root.querySelector('#sr').onchange = function (e) { LF.src = e.target.value; draw(); };
    bindLeadsTable(root);
    draw();
    var nl = document.getElementById('nl'); if (nl) nl.onclick = function () { newLead(d); };
    document.getElementById('csv').onclick = function () {
      U.csv('zayavki-' + U.today() + '.csv', [['Создана', function (l) { return U.dt(l.created_at); }], ['Статус', function (l) { return U.STATUS[l.status]; }], ['Имя', function (l) { return l.name; }], ['Контакт', function (l) { return l.contact; }], ['Канал', function (l) { return U.VIA[l.via] || l.via; }], ['Байк', function (l) { return A.bikeName(d, l.bike_id); }], ['Номер', function (l) { return (d.unit[l.unit_id] || {}).plate; }], ['С', function (l) { return l.date_from; }], ['По', function (l) { return l.date_to; }], ['Дней', function (l) { return l.days; }], ['Сумма', A.val], ['Оплачено', function (l) { return l.paid; }], ['Место', function (l) { return l.place; }], ['Источник', function (l) { return U.SRC(l.source, l.medium); }], ['Кампания', function (l) { return l.campaign; }], ['Комментарий', function (l) { return l.comment; }]], filtered());
    };
  };

  async function newLead(d) {
    var f = [
      { k: 'name', label: 'Имя клиента' }, { k: 'contact', label: 'Контакт', ph: '@username или +7…' },
      { k: 'via', label: 'Канал', type: 'select', opts: Object.entries(U.VIA) },
      { k: 'bike_id', label: 'Байк', type: 'select', opts: d.bikes.map(function (b) { return [b.id, b.name]; }) },
      { k: 'date_from', label: 'Получение', type: 'date' }, { k: 'date_to', label: 'Возврат', type: 'date' },
      { k: 'place', label: 'Куда привезти', full: true }, { k: 'comment', label: 'Комментарий', type: 'textarea', full: true, rows: 2 },
    ];
    var id = await U.modal('Новая заявка', U.form(f, { via: 'phone', date_from: U.iso(U.addDays(new Date(), 1)), date_to: U.iso(U.addDays(new Date(), 4)), bike_id: d.bikes[0] && d.bikes[0].id }), {
      ok: 'Создать', onOk: async function (m) {
        var v = U.read(m, f), days = U.diffDays(v.date_from, v.date_to);
        if (days < 1) throw new Error('Дата возврата должна быть позже даты получения');
        var total = U.cost(d.bike[v.bike_id], days);
        var row = await A.DB.insert('leads', Object.assign(v, { days: days, total: total, price_final: total, status: 'new', source: 'manual', medium: 'none', history: [{ ts: new Date().toISOString(), who: A.ME.name || A.ME.email, text: 'Заявка создана вручную' }] }));
        A.log('Создана заявка', 'lead', row.id);
        return row.id;
      },
    });
    if (id) { A.invalidate(); A.go('#/lead/' + id); }
  }

  // ============================================================ КАРТОЧКА ЗАЯВКИ
  V.lead = async function (root, p) {
    var d = await A.data(true), l = d.leads.find(function (x) { return x.id === p[0]; });
    if (!l) { root.innerHTML = '<div class="card empty">Заявка не найдена. <a href="#/leads">К списку</a></div>'; A.setTop('Заявка'); return; }
    var b = d.bike[l.bike_id];
    A.setTop('Заявка · ' + (l.name || 'без имени'), '<a class="btn" href="#/leads">← К заявкам</a>' + (A.canWrite() ? '<button class="btn btn--r" id="del">' + U.icon('trash') + 'Удалить</button>' : ''));
    function unitOpts(bikeId, from, to) {
      return [['', '— не назначен —']].concat(d.units.filter(function (u) { return u.bike_id === bikeId && u.status !== 'sold'; }).map(function (u) {
        var busy = A.unitBusy(d, u.id, from, to, l.id).length; return [u.id, u.plate + ' · ' + (u.color || '') + (busy ? ' · ⚠ занят' : u.status === 'service' ? ' · на ТО' : ' · свободен')];
      }));
    }
    var F = function () { return [
      { k: 'name', label: 'Имя' }, { k: 'contact', label: 'Контакт' },
      { k: 'via', label: 'Канал связи', type: 'select', opts: Object.entries(U.VIA) }, { k: 'place', label: 'Адрес доставки' },
      { k: 'bike_id', label: 'Модель', type: 'select', opts: d.bikes.map(function (x) { return [x.id, x.name]; }) },
      { k: 'unit_id', label: 'Конкретный байк', type: 'select', opts: unitOpts(l.bike_id, l.date_from, l.date_to) },
      { k: 'date_from', label: 'Получение', type: 'date' }, { k: 'date_to', label: 'Возврат', type: 'date' },
      { k: 'total', label: 'Сумма по прайсу, ₫', type: 'number', hint: 'Считается автоматически по датам' }, { k: 'price_final', label: 'Итоговая цена, ₫', type: 'number', hint: 'Со скидкой, если была' },
      { k: 'paid', label: 'Оплачено, ₫', type: 'number' }, { k: 'status', label: 'Статус', type: 'select', opts: U.STATUS_ORDER.map(function (s) { return [s, U.STATUS[s]]; }) },
      { k: 'comment', label: 'Комментарий', type: 'textarea', full: true, rows: 3 },
    ]; };
    var link = U.contactLink(l);
    var confirmMsg = 'Здравствуйте' + (l.name ? ', ' + l.name : '') + '! Бронь подтверждена ✅\n🛵 ' + A.bikeName(d, l.bike_id) + '\n📅 ' + U.date(l.date_from) + ' — ' + U.date(l.date_to) + ' (' + l.days + ' дн.)\n💰 ' + U.vnd(A.val(l)) + '\n📍 ' + (l.place || 'адрес уточним') + '\nОплата при получении, депозит не нужен. Курьер напишет за 30 минут до приезда. MYBIKE';
    var evs = d.events.filter(function (e) { return l.sid && e.sid === l.sid; });
    root.innerHTML = '<div class="grid g-2-1"><div class="stack"><div class="card"><div class="card__h"><h2>Данные заявки</h2>' + U.badge(l.status) + '</div><div id="frm">' + U.form(F(), l) + '</div><div id="warn"></div>' +
      (A.canWrite() ? '<div class="row" style="margin-top:16px"><button class="btn btn--o" id="save">Сохранить</button><button class="btn" id="recalc">Пересчитать по прайсу</button>' +
        (l.status === 'new' ? '<button class="btn btn--d" data-quick="confirmed">✓ Подтвердить</button>' : '') + (l.status === 'confirmed' ? '<button class="btn btn--d" data-quick="issued">Выдан клиенту</button>' : '') + (l.status === 'issued' ? '<button class="btn btn--d" data-quick="returned">Байк возвращён</button>' : '') + '</div>' : '') + '</div>' +
      (evs.length ? '<div class="card"><div class="card__h"><h2>Путь клиента на сайте</h2><small>' + evs.length + ' событий</small></div>' + U.table([{ t: 'Время', v: function (e) { return U.dt(e.ts); } }, { t: 'Событие', v: function (e) { return U.EV[e.type] || e.type; } }, { t: 'Страница', v: function (e) { return '<code>' + U.esc(e.path) + '</code>'; } }], evs.slice(0, 40)) + '</div>' : '') +
      '</div><div class="stack"><div class="card"><div class="card__h"><h2>Связаться</h2></div><div class="stack">' +
      (link ? '<a class="btn btn--o" href="' + U.esc(link) + '" target="_blank" rel="noopener">' + U.icon(l.via === 'wa' ? 'wa' : l.via === 'phone' ? 'phone' : 'tg') + 'Написать / позвонить: ' + U.esc(l.contact) + '</a>' : '<p class="hint">Контакт не указан</p>') +
      '<button class="btn" id="cpy">' + U.icon('copy') + 'Скопировать подтверждение брони</button><pre class="code" style="font-size:12px">' + U.esc(confirmMsg) + '</pre></div></div>' +
      '<div class="card"><div class="card__h"><h2>Сводка</h2></div><div class="stack" style="gap:6px;font-size:13px">' +
      '<div class="row between"><span class="muted">Создана</span><b>' + U.dt(l.created_at) + '</b></div>' +
      '<div class="row between"><span class="muted">Источник</span><b>' + U.esc(U.SRC(l.source, l.medium)) + (l.campaign ? ' · ' + U.esc(l.campaign) : '') + '</b></div>' +
      '<div class="row between"><span class="muted">Страница</span><b><code>' + U.esc(l.page || '—') + '</code></b></div>' +
      '<div class="row between"><span class="muted">Устройство</span><b>' + U.esc(l.device || '—') + '</b></div>' +
      '<div class="row between"><span class="muted">Цена за день</span><b>' + (l.days ? U.vnd(A.val(l) / l.days) : '—') + '</b></div>' +
      '<div class="row between"><span class="muted">Остаток к оплате</span><b style="color:' + (A.val(l) - (l.paid || 0) > 0 ? 'var(--red)' : 'var(--green)') + '">' + U.vnd(A.val(l) - (l.paid || 0)) + '</b></div>' +
      (b ? '<a href="' + A.siteUrl('/arenda/' + b.id + '/') + '" target="_blank" rel="noopener">Страница байка на сайте ↗</a>' : '') + '</div></div>' +
      '<div class="card"><div class="card__h"><h2>История</h2></div><div class="tl">' + (l.history || []).slice().reverse().map(function (h) { return '<div class="tl__i"><span class="tl__d"></span><div>' + U.esc(h.text) + '<br><small>' + U.dt(h.ts) + ' · ' + U.esc(h.who || '') + '</small></div></div>'; }).join('') + '</div>' +
      (A.canWrite() ? '<div class="row" style="margin-top:10px"><input class="input grow" id="note" placeholder="Заметка: перезвонить вечером…"><button class="btn" id="addnote">Добавить</button></div>' : '') + '</div></div></div>';

    var frm = root.querySelector('#frm');
    function checkConflict() {
      var v = U.read(frm, F()), w = root.querySelector('#warn');
      var days = U.diffDays(v.date_from, v.date_to);
      var msgs = [];
      if (days < 1) msgs.push('Дата возврата раньше даты получения');
      if (v.unit_id) { var c = A.unitBusy(d, v.unit_id, v.date_from, v.date_to, l.id); if (c.length) msgs.push('Этот байк уже занят: ' + c.map(function (x) { return (x.name || 'клиент') + ' ' + U.date(x.date_from) + '–' + U.date(x.date_to); }).join(', ')); }
      w.innerHTML = msgs.length ? '<p class="note note--red" style="margin-top:12px">⚠ ' + msgs.map(U.esc).join('<br>') + '</p>' : '';
    }
    frm.addEventListener('change', function (e) {
      if (e.target.name === 'bike_id' || e.target.name === 'date_from' || e.target.name === 'date_to') {
        var v = U.read(frm, F()); var sel = frm.querySelector('[name=unit_id]'), cur = sel.value;
        sel.innerHTML = unitOpts(v.bike_id, v.date_from, v.date_to).map(function (o) { return '<option value="' + o[0] + '">' + U.esc(o[1]) + '</option>'; }).join('');
        if (e.target.name !== 'bike_id') sel.value = cur;
      }
      checkConflict();
    });
    checkConflict();
    async function save(extraStatus) {
      var v = U.read(frm, F());
      v.days = U.diffDays(v.date_from, v.date_to); if (v.days < 1) throw new Error('Проверьте даты');
      v.unit_id = v.unit_id || null;
      if (extraStatus) v.status = extraStatus;
      var oldSt = l.status, oldUnit = l.unit_id;
      var hist = (l.history || []).slice();
      if (v.status !== oldSt) hist.push({ ts: new Date().toISOString(), who: A.ME.name || A.ME.email, text: 'Статус: ' + U.STATUS[v.status] });
      if (v.unit_id !== oldUnit && v.unit_id) hist.push({ ts: new Date().toISOString(), who: A.ME.name || A.ME.email, text: 'Назначен байк ' + d.unit[v.unit_id].plate });
      if (v.status === 'issued' && extraStatus && !(v.paid > 0)) v.paid = v.price_final || v.total;
      v.history = hist;
      await A.DB.update('leads', l.id, v);
      var u = d.unit[v.unit_id];
      if (u && v.status === 'issued' && u.status !== 'rented') await A.DB.update('units', u.id, { status: 'rented' });
      if (u && ['returned', 'cancelled', 'lost'].indexOf(v.status) >= 0 && u.status === 'rented' && v.status !== oldSt) await A.DB.update('units', u.id, { status: 'free' });
      if (oldUnit && oldUnit !== v.unit_id && d.unit[oldUnit] && d.unit[oldUnit].status === 'rented' && oldSt === 'issued') await A.DB.update('units', oldUnit, { status: 'free' });
      A.log('Изменена заявка', 'lead', l.id, { status: v.status });
      U.toast('Сохранено', 'ok'); A.invalidate(); A.rerender();
    }
    var sv = root.querySelector('#save'); if (sv) sv.onclick = function () { save().catch(function (e) { U.toast(e.message, 'err'); }); };
    root.querySelectorAll('[data-quick]').forEach(function (bt) { bt.onclick = function () { save(bt.dataset.quick).catch(function (e) { U.toast(e.message, 'err'); }); }; });
    var rc = root.querySelector('#recalc'); if (rc) rc.onclick = function () {
      var v = U.read(frm, F()), days = U.diffDays(v.date_from, v.date_to), t = U.cost(d.bike[v.bike_id], days);
      frm.querySelector('[name=total]').value = t; frm.querySelector('[name=price_final]').value = t; U.toast('По прайсу: ' + U.vnd(t) + ' за ' + days + ' дн.');
    };
    root.querySelector('#cpy').onclick = function () { navigator.clipboard.writeText(confirmMsg).then(function () { U.toast('Скопировано', 'ok'); }, function () { U.toast('Не удалось скопировать', 'err'); }); };
    var an = root.querySelector('#addnote'); if (an) an.onclick = async function () {
      var t = root.querySelector('#note').value.trim(); if (!t) return;
      await A.DB.update('leads', l.id, { history: (l.history || []).concat([{ ts: new Date().toISOString(), who: A.ME.name || A.ME.email, text: '💬 ' + t }]) });
      A.invalidate(); A.rerender();
    };
    var del = document.getElementById('del'); if (del) del.onclick = async function () {
      if (!(await U.confirm('Удалить заявку безвозвратно?'))) return;
      await A.DB.remove('leads', l.id); A.log('Удалена заявка', 'lead', l.id); A.invalidate(); A.go('#/leads');
    };
  };

  // ============================================================ КАЛЕНДАРЬ
  var calStart = null;
  V.calendar = async function (root) {
    var d = await A.data();
    if (!calStart) calStart = U.addDays(new Date(new Date().toDateString()), -3);
    var N = 35, days = [];
    for (var i = 0; i < N; i++) days.push(U.iso(U.addDays(calStart, i)));
    var first = days[0], last = days[N - 1], today = U.today();
    A.setTop('Календарь брони', '<button class="btn" id="prev">← 2 недели</button><button class="btn" id="tod">Сегодня</button><button class="btn" id="next">2 недели →</button>');
    var show = ['new', 'confirmed', 'issued', 'returned'];
    var byUnit = U.groupBy(d.leads.filter(function (l) { return l.unit_id && show.indexOf(l.status) >= 0 && A.overlap(l.date_from, l.date_to, first, last); }), function (l) { return l.unit_id; });
    var unassigned = d.leads.filter(function (l) { return !l.unit_id && ['new', 'confirmed'].indexOf(l.status) >= 0 && l.date_to >= today; });
    var head = '<tr><th class="unit">Байк</th>' + days.map(function (x) { var dt = new Date(x + 'T00:00'); var we = dt.getDay() === 0 || dt.getDay() === 6; return '<th class="' + (we ? 'we ' : '') + (x === today ? 'today' : '') + '">' + dt.getDate() + '<br><small>' + ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][dt.getDay()] + '</small></th>'; }).join('') + '</tr>';
    var body = '';
    d.bikes.forEach(function (b) {
      var us = d.units.filter(function (u) { return u.bike_id === b.id && u.status !== 'sold'; });
      if (!us.length) return;
      body += '<tr class="grp"><td class="unit">' + U.esc(b.name) + '</td>' + days.map(function (x) {
        var busy = us.filter(function (u) { return (byUnit[u.id] || []).some(function (l) { return l.status !== 'returned' && x >= l.date_from && x <= l.date_to; }) || u.status === 'service' && x === today; }).length;
        var free = us.length - busy; return '<td title="Свободно ' + free + ' из ' + us.length + '" style="color:' + (free ? 'var(--green)' : 'var(--red)') + ';font-weight:800;text-align:center">' + free + '</td>';
      }).join('') + '</tr>';
      us.forEach(function (u) {
        var ls = byUnit[u.id] || [];
        body += '<tr><td class="unit"><b>' + U.esc(u.plate) + '</b><small>' + U.esc(u.color || '') + ' · ' + U.UNIT[u.status] + '</small></td>' + days.map(function (x, idx) {
          var bars = ls.filter(function (l) { return (l.date_from === x) || (idx === 0 && l.date_from < x && l.date_to >= x); }).map(function (l) {
            var st = l.date_from < first ? first : l.date_from, en = l.date_to > last ? last : l.date_to, w = (U.diffDays(st, en) + 1) * 34 - 4;
            return '<a class="bar bar--' + l.status + '" style="width:' + w + 'px" href="#/lead/' + l.id + '" title="' + U.esc((l.name || '') + ' · ' + U.date(l.date_from) + '–' + U.date(l.date_to) + ' · ' + U.STATUS[l.status]) + '">' + U.esc(l.name || '') + '</a>';
          }).join('');
          return '<td class="cell' + (x === today ? ' today' : '') + '">' + bars + '</td>';
        }).join('') + '</tr>';
      });
    });
    root.innerHTML = (unassigned.length ? '<div class="card"><div class="card__h"><h2>Без назначенного байка</h2><small>' + unassigned.length + '</small></div><div class="list-items">' + unassigned.map(function (l) {
      return '<div class="li row between"><span><b>' + U.esc(l.name || 'Без имени') + '</b> · ' + U.esc(A.bikeName(d, l.bike_id)) + ' · ' + U.date(l.date_from) + '–' + U.date(l.date_to) + ' ' + U.badge(l.status) + '</span><span class="row">' + (A.canWrite() ? '<button class="btn btn--s btn--o" data-assign="' + l.id + '">Назначить байк</button>' : '') + '<a class="btn btn--s" href="#/lead/' + l.id + '">Открыть</a></span></div>';
    }).join('') + '</div></div>' : '') +
      '<div class="legend"><span><i style="background:var(--orange)"></i>Новая</span><span><i style="background:var(--blue)"></i>Подтверждена</span><span><i style="background:var(--green)"></i>Выдан</span><span><i style="background:#9aa1a9"></i>Возвращён</span><span>Цифра в строке модели — сколько байков свободно в этот день</span></div>' +
      '<div class="gantt"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    document.getElementById('prev').onclick = function () { calStart = U.addDays(calStart, -14); A.rerender(); };
    document.getElementById('next').onclick = function () { calStart = U.addDays(calStart, 14); A.rerender(); };
    document.getElementById('tod').onclick = function () { calStart = null; A.rerender(); };
    root.querySelectorAll('[data-assign]').forEach(function (bt) {
      bt.onclick = async function () {
        var l = d.leads.find(function (x) { return x.id === bt.dataset.assign; });
        var free = d.units.filter(function (u) { return u.bike_id === l.bike_id && u.status !== 'sold' && !A.unitBusy(d, u.id, l.date_from, l.date_to, l.id).length; });
        if (!free.length) { U.toast('Нет свободных ' + A.bikeName(d, l.bike_id) + ' на эти даты. Откройте заявку и предложите другую модель.', 'err'); return; }
        var r = await U.modal('Назначить байк', '<p class="hint" style="margin-bottom:10px">' + U.esc(A.bikeName(d, l.bike_id)) + ', ' + U.date(l.date_from) + '–' + U.date(l.date_to) + '</p><select class="select" id="u">' + free.map(function (u) { return '<option value="' + u.id + '">' + U.esc(u.plate + ' · ' + (u.color || '') + ' · ' + U.num(u.mileage) + ' км') + '</option>'; }).join('') + '</select><label class="chk" style="margin-top:10px"><input type="checkbox" id="cf" checked> Сразу подтвердить заявку</label>', {
          ok: 'Назначить', onOk: async function (m) {
            var uid = m.querySelector('#u').value, cf = m.querySelector('#cf').checked;
            var hist = (l.history || []).concat([{ ts: new Date().toISOString(), who: A.ME.name || A.ME.email, text: 'Назначен байк ' + d.unit[uid].plate }]);
            if (cf && l.status === 'new') hist.push({ ts: new Date().toISOString(), who: A.ME.name || A.ME.email, text: 'Статус: Подтверждена' });
            await A.DB.update('leads', l.id, { unit_id: uid, history: hist, status: cf ? 'confirmed' : l.status });
            A.log('Назначен байк', 'lead', l.id);
          },
        });
        if (r) { A.invalidate(); A.rerender(); U.toast('Байк назначен', 'ok'); }
      };
    });
  };

  // ============================================================ КЛИЕНТЫ
  V.clients = async function (root) {
    var d = await A.data();
    function key(l) { var c = (l.contact || '').toLowerCase().trim(); var dg = c.replace(/\D/g, ''); return c[0] === '@' ? c : (dg.length >= 7 ? dg : c || ('id:' + l.id)); }
    var groups = Object.values(U.groupBy(d.leads, key)).map(function (ls) {
      ls.sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
      var ok = ls.filter(function (l) { return DONE.indexOf(l.status) >= 0; });
      return { name: ls[ls.length - 1].name, contact: ls[0].contact, via: ls[0].via, n: ls.length, ok: ok.length, sum: U.sum(ok, A.val), days: U.sum(ok, function (l) { return l.days; }), last: ls[ls.length - 1].created_at, first: ls[0], bikes: U.uniq(ls.map(function (l) { return A.bikeName(d, l.bike_id); })) };
    });
    var rep = groups.filter(function (g) { return g.ok > 1; }).length;
    A.setTop('Клиенты', '<button class="btn" id="csv">' + U.icon('dl') + 'CSV</button>');
    root.innerHTML = '<div class="kpis"><div class="kpi"><span>Всего клиентов</span><b>' + groups.length + '</b></div><div class="kpi"><span>Арендовали хотя бы раз</span><b>' + groups.filter(function (g) { return g.ok; }).length + '</b></div><div class="kpi"><span>Повторные клиенты</span><b>' + rep + '</b><small class="muted">' + U.pct(rep, groups.filter(function (g) { return g.ok; }).length) + '</small></div><div class="kpi"><span>Средний LTV</span><b>' + U.short(U.sum(groups, function (g) { return g.sum; }) / Math.max(1, groups.filter(function (g) { return g.ok; }).length)) + ' ₫</b></div></div>' +
      '<div class="toolbar"><input class="input grow" id="q" placeholder="Поиск по имени или контакту"><select class="select" id="srt" style="width:auto"><option value="sum">По сумме</option><option value="last">По последней заявке</option><option value="n">По числу заявок</option></select></div><div id="list"></div>';
    function draw() {
      var q = root.querySelector('#q').value.toLowerCase(), s = root.querySelector('#srt').value;
      var rows = groups.filter(function (g) { return !q || ((g.name || '') + ' ' + (g.contact || '')).toLowerCase().indexOf(q) >= 0; });
      rows.sort(function (a, b) { return s === 'last' ? (a.last < b.last ? 1 : -1) : b[s] - a[s]; });
      root.querySelector('#list').innerHTML = U.table([
        { t: 'Клиент', v: function (g) { return '<b>' + U.esc(g.name || 'Без имени') + '</b><small>' + U.esc(g.contact || '—') + ' · ' + (U.VIA[g.via] || '') + '</small>'; } },
        { t: 'Заявок', num: true, v: function (g) { return g.n; } }, { t: 'Аренд', num: true, v: function (g) { return g.ok; } },
        { t: 'Дней', num: true, v: function (g) { return g.days; } }, { t: 'Сумма', num: true, v: function (g) { return U.vnd(g.sum); } },
        { t: 'Байки', v: function (g) { return '<small>' + U.esc(g.bikes.join(', ')) + '</small>'; } },
        { t: 'Первый источник', v: function (g) { return U.esc(U.SRC(g.first.source, g.first.medium)); } },
        { t: 'Последняя заявка', v: function (g) { return U.dt(g.last); } },
      ], rows.slice(0, 500), { rowAttr: function (g) { return 'class="click" data-c="' + U.esc(g.contact || g.name || '') + '"'; } });
    }
    root.querySelector('#q').oninput = U.debounce(draw, 200); root.querySelector('#srt').onchange = draw;
    root.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-c]'); if (tr) { A.leadFilter.q = tr.dataset.c; A.leadFilter.tab = 'all'; A.leadFilter.per = 'all'; location.hash = '#/leads'; } });
    document.getElementById('csv').onclick = function () { U.csv('klienty-' + U.today() + '.csv', [['Имя', function (g) { return g.name; }], ['Контакт', function (g) { return g.contact; }], ['Заявок', function (g) { return g.n; }], ['Аренд', function (g) { return g.ok; }], ['Сумма', function (g) { return g.sum; }], ['Последняя', function (g) { return g.last; }]], groups); };
    draw();
  };
})();
