/* MYBIKE Admin — генератор демо-данных (только для демо-режима, в базу не попадает) */
(function () {
  'use strict';
  var rnd = mulberry(20261021);
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function wpick(items) { var s = 0, i; for (i = 0; i < items.length; i++) s += items[i][1]; var r = rnd() * s; for (i = 0; i < items.length; i++) { r -= items[i][1]; if (r <= 0) return items[i][0]; } return items[0][0]; }
  function int(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  function day(d) { var x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + d); return x; }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function sid() { return Math.random().toString(36).slice(2, 10); }

  window.MBCost = function (b, d) {
    if (d >= 30) return Math.round(b.pm / 30 * d / 1000) * 1000;
    var c = d * (d >= 7 ? b.p7 : b.p1);
    if (d < 7 && b.p7 * 7 < c) c = b.p7 * 7;
    if (b.pm < c) c = b.pm;
    return c;
  };

  var NAMES = ['Алексей', 'Мария', 'Дмитрий', 'Анна', 'Сергей', 'Екатерина', 'Иван', 'Ольга', 'Никита', 'Татьяна', 'Артём', 'Наталья', 'Павел', 'Юлия', 'Максим', 'Ирина', 'Андрей', 'Светлана', 'Егор', 'Дарья', 'Роман', 'Ксения', 'Виктор', 'Полина'];
  var HOTELS = ['Hotel Novotel', 'Sheraton', 'Muong Thanh Luxury', 'Panorama', 'Liberty Central', 'Citadines Bayfront', 'Havana Hotel', 'Green World', 'Апартаменты Scenia Bay', 'Ocean Gate', 'Мелиа Винперл', 'Вокзал Нячанга', 'Аэропорт Камрань', 'ЖК Oceanus OC2', 'Gold Coast'];
  var SOURCES = [[['yandex', 'organic', ''], 34], [['google', 'organic', ''], 22], [['direct', 'none', ''], 15], [['yandex', 'cpc', 'nhatrang_bikes'], 10], [['telegram', 'social', ''], 8], [['instagram', 'social', 'stories'], 5], [['2gis', 'referral', ''], 3], [['vk', 'social', ''], 3]];
  var DEV = [['mobile', 74], ['desktop', 22], ['tablet', 4]];
  var DAYS = [[1, 6], [2, 7], [3, 12], [4, 7], [5, 10], [7, 14], [10, 9], [14, 11], [21, 6], [30, 10], [45, 3], [60, 3]];

  window.MBDemo = {
    generate: function (seed) {
      var bikes = seed.bikes.map(function (b) { return Object.assign({ visible: true, updated_at: new Date().toISOString() }, b); });
      var bw = bikes.map(function (b) { return [b, Math.max(1, 20 - b.rank) + (b.popular ? 6 : 0)]; });
      var cats = (seed.content.categories || []).map(function (c) { return '/' + c.slug + '/'; });
      var infos = (seed.content.pages || []).map(function (p) { return '/' + p.slug + '/'; });
      var plateN = 10000;

      // --- парк
      var units = [];
      bikes.forEach(function (b) {
        var n = b.grp === 'moto' || b.grp === '300' ? 1 : Math.max(1, Math.round((22 - b.rank) / 4));
        for (var i = 0; i < n; i++) units.push({
          id: MBDB.uuid(), bike_id: b.id, plate: '79-' + pick(['H1', 'K1', 'D1', 'G1', 'B2']) + ' ' + String(plateN += int(37, 900)).replace(/(\d{3})(\d+)/, '$1.$2'),
          color: pick(['белый', 'чёрный', 'серый', 'красный', 'синий', 'матовый чёрный']), year: b.year - int(0, 1),
          mileage: int(3000, 24000), status: 'free', next_service_km: 0, purchase_price: Math.round(b.pm * int(9, 13) / 100000) * 100000,
          purchased_at: iso(day(-int(120, 700))), notes: '', created_at: day(-200).toISOString(),
        });
      });
      units.forEach(function (u) { u.next_service_km = Math.ceil((u.mileage + 1) / 1000) * 1000 + (rnd() < .15 ? -200 : 0); });

      // --- заявки
      var leads = [], busy = {}, today = day(0);
      function free(unit, a, b) { return !(busy[unit.id] || []).some(function (r) { return a <= r[1] && b >= r[0]; }); }
      for (var d = -75; d <= 0; d++) {
        var trend = 1 + (d + 75) / 75 * 0.6, n = Math.round((1 + rnd() * 3) * trend * (new Date(day(d)).getDay() % 6 === 0 ? 1.3 : 1));
        for (var k = 0; k < n; k++) {
          var b = wpick(bw), dd = wpick(DAYS), created = day(d); created.setHours(int(7, 23), int(0, 59));
          if (created > new Date()) created = new Date(Date.now() - int(5, 300) * 60000);
          var from = day(d + wpick([[0, 25], [1, 30], [2, 15], [3, 10], [5, 8], [7, 7], [14, 5]])), to = new Date(from); to.setDate(to.getDate() + dd);
          var src = wpick(SOURCES), total = MBCost(b, dd), st;
          if (to < today) st = wpick([['returned', 78], ['cancelled', 8], ['lost', 14]]);
          else if (from <= today) st = wpick([['issued', 92], ['cancelled', 8]]);
          else st = (Date.now() - created) < 36e5 * 20 ? wpick([['new', 70], ['confirmed', 30]]) : wpick([['confirmed', 80], ['lost', 10], ['cancelled', 10]]);
          var lead = {
            id: MBDB.uuid(), created_at: created.toISOString(), bike_id: b.id, unit_id: null,
            date_from: iso(from), date_to: iso(to), days: dd, total: total,
            name: pick(NAMES), contact: rnd() < .6 ? '@' + pick(['alex', 'masha', 'dima', 'anna', 'travel', 'nt', 'sun', 'sea']) + int(10, 999) : '+7 9' + int(10, 99) + ' ' + int(100, 999) + '-' + int(10, 99) + '-' + int(10, 99),
            place: pick(HOTELS), via: wpick([['tg', 55], ['wa', 35], ['phone', 10]]),
            status: st, price_final: total - (dd >= 14 && rnd() < .3 ? Math.round(total * .05 / 1000) * 1000 : 0), paid: 0, comment: rnd() < .15 ? pick(['Нужен детский шлем', 'Встретить в аэропорту', 'Просит белый цвет', 'Продлит на неделю, если понравится', 'Нужен багажник']) : '',
            source: src[0], medium: src[1], campaign: src[2], referrer: '', page: '/arenda/' + b.id + '/', device: wpick(DEV), sid: sid(), history: [],
          };
          lead.history.push({ ts: lead.created_at, who: 'сайт', text: 'Заявка с сайта' });
          if (['confirmed', 'issued', 'returned'].indexOf(st) >= 0) {
            var cand = units.filter(function (u) { return u.bike_id === b.id && free(u, lead.date_from, lead.date_to); });
            if (cand.length) { var u = pick(cand); lead.unit_id = u.id; (busy[u.id] = busy[u.id] || []).push([lead.date_from, lead.date_to]); if (st === 'issued') u.status = 'rented'; }
            else if (st !== 'confirmed') { lead.status = 'lost'; st = 'lost'; }
            lead.history.push({ ts: new Date(created.getTime() + int(3, 40) * 60000).toISOString(), who: 'Менеджер', text: 'Статус: Подтверждена' });
          }
          if (st === 'issued' || st === 'returned') { lead.paid = st === 'issued' && rnd() < .25 ? 0 : lead.price_final; lead.history.push({ ts: from.toISOString(), who: 'Курьер', text: 'Статус: Выдан' }); }
          if (st === 'returned') lead.history.push({ ts: to.toISOString(), who: 'Курьер', text: 'Статус: Возвращён' });
          if (st === 'cancelled' || st === 'lost') lead.history.push({ ts: new Date(created.getTime() + 36e5 * int(1, 30)).toISOString(), who: 'Менеджер', text: 'Статус: ' + (st === 'lost' ? 'Не дозвонились / потеряна' : 'Отменена клиентом') });
          leads.push(lead);
        }
      }
      units.forEach(function (u) { if (u.status === 'free' && rnd() < .06) u.status = 'service'; });

      // --- события сайта
      var events = [], id = 0;
      function ev(ts, s, type, path, extra) { var e = Object.assign({ id: ++id, ts: ts.toISOString(), sid: s.sid, type: type, path: path, source: s.src[0], medium: s.src[1], device: s.dev }, extra || {}); if (s.src[2]) e.campaign = s.src[2]; events.push(e); }
      for (d = -60; d <= 0; d++) {
        var sessions = Math.round((17 + rnd() * 14) * (1 + (d + 60) / 60 * 0.7));
        for (var i = 0; i < sessions; i++) {
          var t = day(d); t.setHours(wpick([[8, 3], [10, 5], [12, 6], [14, 6], [16, 7], [18, 9], [20, 10], [21, 9], [22, 7], [23, 4], [1, 2]]), int(0, 59), int(0, 59));
          if (t > new Date()) continue;
          var s = { sid: sid(), src: wpick(SOURCES), dev: wpick(DEV) };
          var land = wpick([['/', 35], ['cat', 30], ['bike', 25], ['info', 10]]), pages = wpick([[1, 38], [2, 25], [3, 18], [4, 10], [6, 9]]);
          for (var p = 0; p < pages; p++) {
            var kind = p === 0 ? land : wpick([['bike', 50], ['cat', 25], ['/', 10], ['info', 15]]), path, bk = null;
            if (kind === 'bike') { bk = wpick(bw); path = '/arenda/' + bk.id + '/'; } else if (kind === 'cat') path = pick(cats.concat(['/katalog/'])); else if (kind === 'info') path = pick(infos); else path = '/';
            ev(t, s, 'page_view', path, bk ? { bike_id: bk.id } : null);
            if (bk) ev(t, s, 'bike_view', path, { bike_id: bk.id });
            if (path === '/' && rnd() < .12) ev(t, s, 'search', path, { data: { type: pick(['all', 'nolicense', '125', '150', '50', '300']), days: wpick(DAYS) } });
            if ((path === '/' || path === '/katalog/') && rnd() < .25) ev(t, s, 'filter', path, { data: { group: pick(['50', 'e', '125', '150', '300', 'moto']), lic: pick(['all', 'none', 'yes']) } });
            if (rnd() < .1) ev(t, s, 'book_open', path, { bike_id: bk ? bk.id : wpick(bw).id });
            if (rnd() < .045) ev(t, s, pick(['tg_click', 'wa_click', 'tg_click', 'phone_click']), path);
            t = new Date(t.getTime() + int(20, 240) * 1000);
          }
        }
      }
      leads.forEach(function (l) {
        if (l.created_at < day(-60).toISOString()) return;
        var s = { sid: l.sid, src: [l.source, l.medium, l.campaign], dev: l.device }, tt = new Date(new Date(l.created_at).getTime() - 240000);
        ev(tt, s, 'page_view', l.page, { bike_id: l.bike_id }); ev(tt, s, 'bike_view', l.page, { bike_id: l.bike_id });
        ev(new Date(tt.getTime() + 120000), s, 'book_open', l.page, { bike_id: l.bike_id });
        ev(new Date(l.created_at), s, 'lead', l.page, { bike_id: l.bike_id, data: { via: l.via, days: l.days, total: l.total } });
      });
      events.sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });

      // --- расходы
      var exp = [];
      for (var m = 0; m < 3; m++) {
        var md = day(-m * 30);
        exp.push({ id: MBDB.uuid(), date: iso(new Date(md.getFullYear(), md.getMonth(), 1)), category: 'rent', amount: 15000000, note: 'Аренда точки выдачи' });
        exp.push({ id: MBDB.uuid(), date: iso(new Date(md.getFullYear(), md.getMonth(), 3)), category: 'ads', amount: int(60, 110) * 100000, note: 'Яндекс Директ' });
        exp.push({ id: MBDB.uuid(), date: iso(new Date(md.getFullYear(), md.getMonth(), 5)), category: 'salary', amount: 24000000, note: 'Курьер + менеджер' });
        exp.push({ id: MBDB.uuid(), date: iso(new Date(md.getFullYear(), md.getMonth(), 10)), category: 'fuel', amount: int(12, 20) * 100000, note: 'Бензин на доставку' });
      }
      units.forEach(function (u) {
        var k = int(0, 3);
        for (var j = 0; j < k; j++) exp.push({ id: MBDB.uuid(), date: iso(day(-int(1, 85))), unit_id: u.id, category: pick(['service', 'service', 'repair']), amount: int(15, 60) * 10000, note: pick(['Замена масла', 'Тормозные колодки', 'Ремень вариатора', 'Прокол шины', 'Аккумулятор', 'ТО 1000 км']) });
      });
      exp.forEach(function (e) { e.created_at = e.date + 'T10:00:00Z'; e.unit_id = e.unit_id || null; });

      return {
        bikes: bikes, units: units, leads: leads, expenses: exp, events: events,
        audit: [{ id: 1, ts: new Date().toISOString(), actor: 'система', action: 'Создан демо-набор данных', entity: '', entity_id: '' }],
        content: seed.content, contentUpdated: {}, secrets: {},
        admins: [{ user_id: 'demo', email: 'demo@mybike', name: 'Демо-владелец', role: 'owner' }, { user_id: 'm1', email: 'manager@mybike', name: 'Менеджер', role: 'manager' }],
        demo: true, builtAt: new Date().toISOString(),
      };
    },
  };
})();
