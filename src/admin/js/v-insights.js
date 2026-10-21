/* MYBIKE Admin — цифры: аналитика сайта и финансы */
(function () {
  'use strict';
  var V = A.views;
  var DONE = ['issued', 'returned'];

  // ============================================================ АНАЛИТИКА
  var anP = 30;
  V.analytics = async function (root) {
    var d = await A.data();
    A.setTop('Аналитика', A.periodSel(anP) + '<button class="btn" id="csv">' + U.icon('dl') + 'События CSV</button>');
    document.getElementById('per').onclick = function (e) { var b = e.target.closest('[data-p]'); if (b) { anP = +b.dataset.p; A.rerender(); } };
    var from = U.daysAgo(anP - 1).toISOString();
    var ev = d.events.filter(function (e) { return e.ts >= from; });
    var leads = d.leads.filter(function (l) { return l.created_at >= from; });
    var pv = ev.filter(function (e) { return e.type === 'page_view'; });
    var bySid = U.groupBy(ev, function (e) { return e.sid; });
    var sids = Object.keys(bySid), S = sids.length;
    var bounce = sids.filter(function (s) { var x = bySid[s]; return x.filter(function (e) { return e.type === 'page_view'; }).length <= 1 && !x.some(function (e) { return ['book_open', 'lead', 'tg_click', 'wa_click', 'phone_click', 'filter', 'search'].indexOf(e.type) >= 0; }); }).length;
    var clicks = ev.filter(function (e) { return /_click$/.test(e.type); });
    var leadSids = {}; ev.filter(function (e) { return e.type === 'lead'; }).forEach(function (e) { leadSids[e.sid] = 1; });
    leads.forEach(function (l) { if (l.sid) leadSids[l.sid] = 1; });

    // источники: сессия → источник первого события
    var srcOf = {}; sids.forEach(function (s) { var e = bySid[s][0]; srcOf[s] = U.SRC(e.source, e.medium); });
    var srcRows = Object.entries(U.groupBy(sids, function (s) { return srcOf[s]; })).map(function (x) {
      var name = x[0], ss = x[1];
      var ls = leads.filter(function (l) { return U.SRC(l.source, l.medium) === name; });
      return { name: name, s: ss.length, l: ls.length, rev: U.sum(ls.filter(function (l) { return DONE.indexOf(l.status) >= 0; }), A.val), b: ss.filter(function (s) { return bySid[s].length <= 1; }).length };
    }).sort(function (a, b) { return b.s - a.s; });
    var camp = Object.entries(U.groupBy(leads.filter(function (l) { return l.campaign; }), function (l) { return (l.source || '') + ' / ' + l.campaign; })).map(function (x) { return { name: x[0], l: x[1].length, ok: x[1].filter(function (l) { return DONE.indexOf(l.status) >= 0; }).length, rev: U.sum(x[1].filter(function (l) { return DONE.indexOf(l.status) >= 0; }), A.val) }; });
    var campS = U.groupBy(sids.filter(function (s) { return bySid[s][0].campaign; }), function (s) { return (bySid[s][0].source || '') + ' / ' + bySid[s][0].campaign; });
    camp.forEach(function (c) { c.s = (campS[c.name] || []).length; });
    Object.keys(campS).forEach(function (k) { if (!camp.some(function (c) { return c.name === k; })) camp.push({ name: k, s: campS[k].length, l: 0, ok: 0, rev: 0 }); });

    // страницы
    var pages = Object.entries(U.groupBy(pv, function (e) { return e.path; })).map(function (x) {
      var p = x[0], ss = U.uniq(x[1].map(function (e) { return e.sid; }));
      var bo = ev.filter(function (e) { return e.type === 'book_open' && e.path === p; }).length;
      var ld = leads.filter(function (l) { return l.page === p; }).length;
      var land = sids.filter(function (s) { var f = bySid[s].find(function (e) { return e.type === 'page_view'; }); return f && f.path === p; }).length;
      return { p: p, v: x[1].length, s: ss.length, land: land, bo: bo, l: ld };
    }).sort(function (a, b) { return b.v - a.v; });
    // байки
    var bikes = d.bikes.map(function (b) {
      var v = A.sessions(ev.filter(function (e) { return e.type === 'bike_view' && e.bike_id === b.id; }));
      var o = A.sessions(ev.filter(function (e) { return e.type === 'book_open' && e.bike_id === b.id; }));
      var l = leads.filter(function (x) { return x.bike_id === b.id; }).length;
      return { b: b, v: v, o: o, l: l };
    }).sort(function (a, b) { return b.v - a.v; });
    // спрос по датам
    var weeks = []; for (var w = 0; w < 10; w++) weeks.push(U.iso(U.addDays(new Date(), w * 7)));
    var futureLeads = d.leads.filter(function (l) { return l.date_from >= U.today() && ['cancelled', 'lost'].indexOf(l.status) < 0; });
    var wk = weeks.map(function (s, i) { var e = weeks[i + 1] || '9999'; return futureLeads.filter(function (l) { return l.date_from >= s && l.date_from < e; }).length; });
    // длительность
    var bucket = [['1–2 дня', 1, 2], ['3–6 дней', 3, 6], ['7–13 дней', 7, 13], ['14–29 дней', 14, 29], ['30+ дней', 30, 9999]];
    var dur = bucket.map(function (b) { return leads.filter(function (l) { return l.days >= b[1] && l.days <= b[2]; }).length; });
    // фильтры и поиск
    var filt = ev.filter(function (e) { return e.type === 'filter' && e.data; }), srch = ev.filter(function (e) { return e.type === 'search' && e.data; });
    var noLic = filt.filter(function (e) { return e.data.lic === 'none'; }).length + srch.filter(function (e) { return e.data.type === 'nolicense'; }).length;
    var grpCnt = Object.entries(U.groupBy(filt.concat(srch), function (e) { return e.data.group || e.data.type; })).map(function (x) { return [U.GROUP[x[0]] || ({ nolicense: 'Без прав', all: 'Любой' }[x[0]] || x[0]), x[1].length]; }).sort(function (a, b) { return b[1] - a[1]; });
    // скорость ответа
    var resp = leads.map(function (l) { var h = (l.history || []).find(function (x) { return x.who && x.who !== 'сайт'; }); return h ? (new Date(h.ts) - new Date(l.created_at)) / 60000 : null; }).filter(function (x) { return x != null && x >= 0 && x < 60 * 24 * 3; });
    resp.sort(function (a, b) { return a - b; });
    var med = resp.length ? resp[Math.floor(resp.length / 2)] : 0;
    var dev = Object.entries(U.groupBy(sids, function (s) { return bySid[s][0].device || 'unknown'; })).map(function (x) { return [{ mobile: 'Телефон', desktop: 'Компьютер', tablet: 'Планшет' }[x[0]] || x[0], x[1].length]; });

    root.innerHTML = '<div class="kpis">' +
      '<div class="kpi"><span>Посетители (сессии)</span><b>' + U.num(S) + '</b></div>' +
      '<div class="kpi"><span>Просмотры страниц</span><b>' + U.num(pv.length) + '</b><small class="muted">' + (S ? (pv.length / S).toFixed(1) : 0) + ' на посетителя</small></div>' +
      '<div class="kpi"><span>Отказы</span><b>' + U.pct(bounce, S) + '</b><small class="muted">1 страница и без действий</small></div>' +
      '<div class="kpi"><span>Заявки</span><b>' + leads.length + '</b><small class="muted">конверсия ' + U.pct(leads.length, S) + '</small></div>' +
      '<div class="kpi"><span>Клики в мессенджеры</span><b>' + clicks.length + '</b><small class="muted">TG ' + clicks.filter(function (e) { return e.type === 'tg_click'; }).length + ' · WA ' + clicks.filter(function (e) { return e.type === 'wa_click'; }).length + ' · тел ' + clicks.filter(function (e) { return e.type === 'phone_click'; }).length + '</small></div>' +
      '<div class="kpi"><span>Ищут «без прав»</span><b>' + U.pct(noLic, filt.length + srch.length) + '</b><small class="muted">от всех фильтров и поисков</small></div>' +
      '<div class="kpi"><span>Ответ менеджера</span><b>' + (med ? (med < 60 ? Math.round(med) + ' мин' : (med / 60).toFixed(1) + ' ч') : '—') + '</b><small class="muted">медиана до первого действия</small></div>' +
      '</div>' +
      '<div class="card"><div class="card__h"><h2>Посещаемость</h2></div><div class="chart" id="c1"></div></div>' +
      '<div class="grid g2"><div class="card"><div class="card__h"><h2>Источники трафика</h2><small>какой канал приносит заявки и деньги</small></div><div class="tbl-wrap">' + U.table([
        { t: 'Источник', v: function (r) { return '<b>' + U.esc(r.name) + '</b>'; } }, { t: 'Посетители', num: true, v: function (r) { return U.num(r.s); } },
        { t: 'Заявки', num: true, v: function (r) { return r.l; } }, { t: 'Конверсия', num: true, v: function (r) { return U.pct(r.l, r.s); } }, { t: 'Выручка', num: true, v: function (r) { return U.short(r.rev) + ' ₫'; } },
      ], srcRows) + '</div></div>' +
      '<div class="card"><div class="card__h"><h2>Рекламные кампании (UTM)</h2><small>?utm_source=…&utm_campaign=…</small></div>' + U.table([
        { t: 'Кампания', v: function (r) { return U.esc(r.name); } }, { t: 'Посетители', num: true, v: function (r) { return U.num(r.s); } }, { t: 'Заявки', num: true, v: function (r) { return r.l; } },
        { t: 'Аренды', num: true, v: function (r) { return r.ok; } }, { t: 'Выручка', num: true, v: function (r) { return U.short(r.rev) + ' ₫'; } },
      ], camp, { empty: 'Нет переходов с UTM-метками. Добавляйте метки к ссылкам в рекламе и соцсетях.' }) + '</div></div>' +
      '<div class="grid g3"><div class="card"><div class="card__h"><h2>Воронка</h2></div>' + U.funnel([['Посетители', S], ['Смотрели байк', A.sessions(ev.filter(function (e) { return e.type === 'bike_view'; }))], ['Открыли бронь', A.sessions(ev.filter(function (e) { return e.type === 'book_open'; }))], ['Заявка', leads.length], ['Аренда', leads.filter(function (l) { return DONE.indexOf(l.status) >= 0; }).length]]) + '</div>' +
      '<div class="card"><div class="card__h"><h2>Устройства</h2></div><div class="chart chart--s" id="c2"></div></div>' +
      '<div class="card"><div class="card__h"><h2>Что ищут в фильтрах</h2></div>' + U.hbars(grpCnt.slice(0, 8)) + '</div></div>' +
      '<div class="grid g2"><div class="card"><div class="card__h"><h2>Спрос по датам начала аренды</h2><small>активные брони на ближайшие 10 недель</small></div><div class="chart chart--s" id="c3"></div></div>' +
      '<div class="card"><div class="card__h"><h2>Срок аренды</h2><small>помогает планировать скидки</small></div><div class="chart chart--s" id="c4"></div></div></div>' +
      '<div class="card"><div class="card__h"><h2>Байки: интерес и конверсия</h2><small>много просмотров и мало заявок → проверьте цену, фото и текст</small></div>' + U.table([
        { t: 'Модель', v: function (r) { return '<a href="#/bike/' + r.b.id + '"><b>' + U.esc(r.b.name) + '</b></a>'; } }, { t: 'Просмотры', num: true, v: function (r) { return U.num(r.v); } },
        { t: 'Открыли бронь', num: true, v: function (r) { return U.num(r.o); } }, { t: 'Заявки', num: true, v: function (r) { return r.l; } },
        { t: 'Просмотр → заявка', num: true, v: function (r) { var c = r.v ? r.l / r.v : 0; return '<b style="color:' + (r.v > 20 && c < 0.02 ? 'var(--red)' : c > 0.06 ? 'var(--green)' : 'inherit') + '">' + U.pct(r.l, r.v) + '</b>'; } },
        { t: 'Цена 7+ дн.', num: true, v: function (r) { return U.vnd(r.b.p7); } },
      ], bikes) + '</div>' +
      '<div class="card"><div class="card__h"><h2>Страницы сайта</h2><small>входы — с какой страницы начали визит</small></div>' + U.table([
        { t: 'Страница', v: function (r) { return '<a href="' + A.siteUrl(r.p) + '" target="_blank" rel="noopener"><code>' + U.esc(r.p) + '</code></a>'; } }, { t: 'Просмотры', num: true, v: function (r) { return U.num(r.v); } },
        { t: 'Посетители', num: true, v: function (r) { return U.num(r.s); } }, { t: 'Входы', num: true, v: function (r) { return U.num(r.land); } },
        { t: 'Открыли бронь', num: true, v: function (r) { return r.bo; } }, { t: 'Заявки', num: true, v: function (r) { return r.l; } }, { t: 'Конверсия', num: true, v: function (r) { return U.pct(r.l, r.s); } },
      ], pages, { max: 520 }) + '</div>' +
      '<div class="card"><div class="card__h"><h2>Когда заходят на сайт</h2><small>день недели × час — для рекламы и смен менеджеров</small></div><div id="heat"></div></div>';

    var days = []; for (var i = anP - 1; i >= 0; i--) days.push(U.iso(U.daysAgo(i)));
    var byDay = U.groupBy(ev, function (e) { return U.iso(e.ts); }), pvDay = U.groupBy(pv, function (e) { return U.iso(e.ts); }), lDay = U.groupBy(leads, function (l) { return U.iso(l.created_at); });
    U.lineChart(document.getElementById('c1'), days.map(function (x) { return U.date(x); }), [
      { label: 'Посетители', data: days.map(function (x) { return A.sessions(byDay[x] || []); }) },
      { label: 'Просмотры', data: days.map(function (x) { return (pvDay[x] || []).length; }), borderColor: '#9AA1A9' },
      { label: 'Заявки', data: days.map(function (x) { return (lDay[x] || []).length; }), yAxisID: 'y1', borderColor: '#1E1E1E' },
    ], { scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }, y: { beginAtZero: true, grid: { color: '#f0f0f0' } }, y1: { beginAtZero: true, position: 'right', grid: { display: false } } } });
    U.doughnut(document.getElementById('c2'), dev.map(function (x) { return x[0]; }), dev.map(function (x) { return x[1]; }));
    U.barChart(document.getElementById('c3'), weeks.map(function (x) { return 'с ' + U.date(x); }), [{ label: 'Начало аренды', data: wk }], { plugins: { legend: { display: false } } });
    U.barChart(document.getElementById('c4'), bucket.map(function (b) { return b[0]; }), [{ label: 'Заявки', data: dur, backgroundColor: '#1E1E1E' }], { plugins: { legend: { display: false } } });
    // heatmap
    var grid = []; for (var dw = 0; dw < 7; dw++) { grid.push([]); for (var h = 0; h < 24; h++) grid[dw].push(0); }
    sids.forEach(function (s) { var t = new Date(bySid[s][0].ts); grid[(t.getDay() + 6) % 7][t.getHours()]++; });
    var mx = Math.max.apply(null, grid.map(function (r) { return Math.max.apply(null, r); }).concat([1]));
    var hm = '<div class="heat"><div class="lbl"></div>' + Array.from({ length: 24 }, function (_, h) { return '<div class="lbl" style="justify-content:center">' + (h % 3 === 0 ? h : '') + '</div>'; }).join('');
    ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(function (n, r) { hm += '<div class="lbl">' + n + '</div>' + grid[r].map(function (v, h) { return '<div title="' + n + ' ' + h + ':00 — ' + v + '" style="background:rgba(255,107,44,' + (0.06 + v / mx * 0.94).toFixed(2) + ')"></div>'; }).join(''); });
    root.querySelector('#heat').innerHTML = hm + '</div>';
    document.getElementById('csv').onclick = function () { U.csv('sobytiya-' + U.today() + '.csv', [['Время', function (e) { return e.ts; }], ['Сессия', function (e) { return e.sid; }], ['Событие', function (e) { return U.EV[e.type] || e.type; }], ['Страница', function (e) { return e.path; }], ['Байк', function (e) { return e.bike_id; }], ['Источник', function (e) { return e.source; }], ['Канал', function (e) { return e.medium; }], ['Кампания', function (e) { return e.campaign; }], ['Устройство', function (e) { return e.device; }]], ev); };
  };

  // ============================================================ ФИНАНСЫ
  var finP = 'm0';
  V.finance = async function (root) {
    var d = await A.data();
    var now = new Date(), y = now.getFullYear(), m = now.getMonth();
    var P = { m0: [new Date(y, m, 1), new Date(y, m + 1, 1), 'Этот месяц'], m1: [new Date(y, m - 1, 1), new Date(y, m, 1), 'Прошлый месяц'], d90: [U.daysAgo(89), U.addDays(new Date(), 1), '90 дней'], y0: [new Date(y, 0, 1), new Date(y + 1, 0, 1), 'Этот год'] };
    var per = P[finP], from = U.iso(per[0]), to = U.iso(per[1]);
    A.setTop('Финансы', '<div class="seg" id="fp">' + Object.keys(P).map(function (k) { return '<button data-k="' + k + '" class="' + (k === finP ? 'is-active' : '') + '">' + P[k][2] + '</button>'; }).join('') + '</div>' + (A.canWrite() ? '<button class="btn btn--o" id="addx">' + U.icon('plus') + 'Расход</button>' : ''));
    document.getElementById('fp').onclick = function (e) { var b = e.target.closest('[data-k]'); if (b) { finP = b.dataset.k; A.rerender(); } };
    var deals = d.leads.filter(function (l) { return DONE.indexOf(l.status) >= 0 && l.date_from >= from && l.date_from < to; });
    var future = d.leads.filter(function (l) { return l.status === 'confirmed' && l.date_from >= from && l.date_from < to; });
    var exps = d.expenses.filter(function (e) { return e.date >= from && e.date < to; });
    var rev = U.sum(deals, A.val), paid = U.sum(deals, function (l) { return l.paid; }), ex = U.sum(exps, function (e) { return e.amount; });
    var debts = d.leads.filter(function (l) { return DONE.indexOf(l.status) >= 0 && A.val(l) - (l.paid || 0) > 0; });
    var byCat = Object.entries(U.groupBy(exps, function (e) { return e.category; })).map(function (x) { return [U.EXP[x[0]] || x[0], U.sum(x[1], function (e) { return e.amount; })]; }).sort(function (a, b) { return b[1] - a[1]; });
    // помесячно 6 мес
    var months = []; for (var i = 5; i >= 0; i--) months.push(new Date(y, m - i, 1));
    var mRev = months.map(function (s, i) { var e = i < 5 ? months[i + 1] : new Date(y, m + 1, 1); var a = U.iso(s), b = U.iso(e); return U.sum(d.leads.filter(function (l) { return DONE.indexOf(l.status) >= 0 && l.date_from >= a && l.date_from < b; }), A.val); });
    var mExp = months.map(function (s, i) { var e = i < 5 ? months[i + 1] : new Date(y, m + 1, 1); var a = U.iso(s), b = U.iso(e); return U.sum(d.expenses.filter(function (x) { return x.date >= a && x.date < b; }), function (x) { return x.amount; }); });
    // по моделям
    var models = d.bikes.map(function (b) {
      var us = d.units.filter(function (u) { return u.bike_id === b.id && u.status !== 'sold'; });
      var r = U.sum(deals.filter(function (l) { return l.bike_id === b.id; }), A.val);
      var e = U.sum(exps.filter(function (x) { return x.unit_id && us.some(function (u) { return u.id === x.unit_id; }); }), function (x) { return x.amount; });
      var inv = U.sum(us, function (u) { return u.purchase_price; });
      return { b: b, n: us.length, r: r, e: e, p: r - e, per: us.length ? (r - e) / us.length : 0, inv: inv };
    }).filter(function (x) { return x.n || x.r; }).sort(function (a, b) { return b.p - a.p; });
    var daysInP = Math.max(1, U.diffDays(from, U.iso(per[1] > new Date() ? new Date() : per[1])));

    root.innerHTML = '<div class="kpis">' +
      '<div class="kpi kpi--accent"><span>Выручка</span><b>' + U.short(rev) + ' ₫</b><small>' + deals.length + ' аренд · ' + P[finP][2].toLowerCase() + '</small></div>' +
      '<div class="kpi"><span>Получено денег</span><b>' + U.short(paid) + ' ₫</b><small class="muted">' + U.pct(paid, rev) + ' от выручки</small></div>' +
      '<div class="kpi"><span>Расходы</span><b>' + U.short(ex) + ' ₫</b></div>' +
      '<div class="kpi"><span>Прибыль</span><b style="color:' + (rev - ex >= 0 ? 'var(--green)' : 'var(--red)') + '">' + U.short(rev - ex) + ' ₫</b><small class="muted">маржа ' + U.pct(rev - ex, rev) + '</small></div>' +
      '<div class="kpi"><span>Ожидается (подтверждённые)</span><b>' + U.short(U.sum(future, A.val)) + ' ₫</b><small class="muted">' + future.length + ' брони</small></div>' +
      '<div class="kpi"><span>В среднем в день</span><b>' + U.short(rev / daysInP) + ' ₫</b></div>' +
      '<div class="kpi"><span>Долги клиентов</span><b style="color:var(--red)">' + U.short(U.sum(debts, function (l) { return A.val(l) - (l.paid || 0); })) + ' ₫</b><small class="muted">' + debts.length + ' аренд, за всё время</small></div></div>' +
      '<div class="grid g-2-1"><div class="card"><div class="card__h"><h2>Выручка и расходы по месяцам</h2></div><div class="chart" id="c1"></div></div>' +
      '<div class="card"><div class="card__h"><h2>Расходы по статьям</h2></div>' + U.hbars(byCat, function (v) { return U.short(v) + ' ₫'; }) + '</div></div>' +
      '<div class="card"><div class="card__h"><h2>Доходность моделей</h2><small>за выбранный период; расходы — ТО и ремонт конкретных байков</small></div>' + U.table([
        { t: 'Модель', v: function (r) { return '<b>' + U.esc(r.b.name) + '</b>'; } }, { t: 'Байков', num: true, v: function (r) { return r.n; } },
        { t: 'Выручка', num: true, v: function (r) { return U.vnd(r.r); } }, { t: 'Расходы', num: true, v: function (r) { return U.vnd(r.e); } },
        { t: 'Прибыль', num: true, v: function (r) { return '<b style="color:' + (r.p >= 0 ? 'var(--green)' : 'var(--red)') + '">' + U.vnd(r.p) + '</b>'; } },
        { t: 'На 1 байк', num: true, v: function (r) { return U.vnd(r.per); } },
        { t: 'Окупаемость', num: true, v: function (r) { if (!r.inv || r.p <= 0) return '—'; var monthly = r.p / daysInP * 30; return (r.inv / monthly).toFixed(1).replace('.0', '') + ' мес.'; } },
      ], models) + '</div>' +
      (debts.length ? '<div class="card"><div class="card__h"><h2>Неоплаченные аренды</h2></div>' + A.leadsTable(d, debts) + '</div>' : '') +
      '<div class="card"><div class="card__h"><h2>Расходы</h2><button class="btn btn--s" id="xcsv">' + U.icon('dl') + 'CSV</button></div>' + U.table([
        { t: 'Дата', v: function (e) { return U.date(e.date); } }, { t: 'Статья', v: function (e) { return U.EXP[e.category] || e.category; } },
        { t: 'Байк', v: function (e) { var u = d.unit[e.unit_id]; return u ? U.esc(u.plate + ' · ' + A.bikeName(d, u.bike_id)) : '<span class="muted">общий</span>'; } },
        { t: 'Комментарий', v: function (e) { return U.esc(e.note || ''); } }, { t: 'Сумма', num: true, v: function (e) { return U.vnd(e.amount); } },
      ], exps.sort(function (a, b) { return a.date < b.date ? 1 : -1; }), { rowAttr: function (e) { return 'class="click" data-x="' + e.id + '"'; }, empty: 'Расходов за период нет' }) + '</div>';
    U.barChart(document.getElementById('c1'), months.map(function (x) { return x.toLocaleDateString('ru-RU', { month: 'short' }); }), [{ label: 'Выручка', data: mRev }, { label: 'Расходы', data: mExp, backgroundColor: '#1E1E1E' }, { label: 'Прибыль', data: mRev.map(function (r, i) { return r - mExp[i]; }), backgroundColor: '#1F9D55' }],
      { scales: { y: { ticks: { callback: function (v) { return U.short(v); } }, grid: { color: '#f0f0f0' } }, x: { grid: { display: false } } } });
    root.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-x]'); if (tr) editExp(d, d.expenses.find(function (x) { return x.id === tr.dataset.x; })); });
    A.bindLeadsTable(root);
    var ax = document.getElementById('addx'); if (ax) ax.onclick = function () { editExp(d, null); };
    root.querySelector('#xcsv').onclick = function () { U.csv('rashody-' + from + '.csv', [['Дата', function (e) { return e.date; }], ['Статья', function (e) { return U.EXP[e.category]; }], ['Байк', function (e) { return (d.unit[e.unit_id] || {}).plate; }], ['Комментарий', function (e) { return e.note; }], ['Сумма', function (e) { return e.amount; }]], exps); };
  };
  async function editExp(d, x) {
    var F = [
      { k: 'date', label: 'Дата', type: 'date' }, { k: 'category', label: 'Статья', type: 'select', opts: Object.entries(U.EXP) },
      { k: 'amount', label: 'Сумма, ₫', type: 'number' },
      { k: 'unit_id', label: 'Байк (если расход на конкретный байк)', type: 'select', opts: [['', '— общий расход —']].concat(d.units.map(function (u) { return [u.id, u.plate + ' · ' + A.bikeName(d, u.bike_id)]; })) },
      { k: 'note', label: 'Комментарий', full: true },
    ];
    var r = await U.modal(x ? 'Расход' : 'Новый расход', U.form(F, x || { date: U.today(), category: 'service' }), {
      ok: 'Сохранить', extra: x && A.canWrite() ? '<button class="btn btn--r" data-dx style="margin-right:auto">Удалить</button>' : '',
      onOpen: function (m) { var b = m.querySelector('[data-dx]'); if (b) b.onclick = async function () { await A.DB.remove('expenses', x.id); A.log('Удалён расход', 'expense', x.id); m.remove(); A.refresh(); }; },
      onOk: async function (m) {
        var v = U.read(m, F); if (!(v.amount > 0)) throw new Error('Укажите сумму'); v.unit_id = v.unit_id || null;
        if (x) await A.DB.update('expenses', x.id, v); else await A.DB.insert('expenses', v);
        A.log(x ? 'Изменён расход' : 'Добавлен расход', 'expense', x ? x.id : '', { amount: v.amount });
      },
    });
    if (r) { U.toast('Сохранено', 'ok'); A.refresh(); }
  }
})();
