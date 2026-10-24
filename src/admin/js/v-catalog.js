/* MYBIKE Admin — парк: модели и цены, карточка модели, конкретные байки */
(function () {
  'use strict';
  var V = A.views;
  var DONE = ['issued', 'returned'];

  function imgSrc(b) { var i = b.img || 'placeholder.png'; return /^(https?:|data:)/.test(i) ? i : A.siteUrl('/assets/img/bikes/' + i); }
  A.imgSrc = imgSrc;

  // ============================================================ МОДЕЛИ
  V.bikes = async function (root) {
    var d = await A.data();
    A.setTop('Модели и цены', (A.canWrite() ? '<button class="btn" id="bulk">Изменить цены массово</button><button class="btn btn--o" id="add">' + U.icon('plus') + 'Добавить модель</button>' : '') + '<button class="btn" id="csv">' + U.icon('dl') + 'CSV</button>');
    var since = U.daysAgo(29).toISOString();
    var ev = d.events.filter(function (e) { return e.ts >= since; });
    var views = U.groupBy(ev.filter(function (e) { return e.type === 'bike_view'; }), function (e) { return e.bike_id; });
    var opens = U.groupBy(ev.filter(function (e) { return e.type === 'book_open'; }), function (e) { return e.bike_id; });
    var leads = U.groupBy(d.leads.filter(function (l) { return l.created_at >= since; }), function (l) { return l.bike_id; });
    var rows = d.bikes.map(function (b) {
      var us = d.units.filter(function (u) { return u.bike_id === b.id && u.status !== 'sold'; });
      return { b: b, units: us.length, free: us.filter(function (u) { return u.status === 'free'; }).length, v: A.sessions(views[b.id] || []), o: A.sessions(opens[b.id] || []), l: (leads[b.id] || []).length };
    });
    root.innerHTML = '<p class="hint">Каждая модель — отдельная страница сайта <code>/arenda/адрес/</code>. Изменения цен и текстов попадают на сайт после публикации (раздел «Публикация и SEO»). Статистика — за 30 дней.</p>' +
      U.table([
        { t: '', v: function (r) { return '<img class="thumb" src="' + U.esc(imgSrc(r.b)) + '" alt="" loading="lazy">'; } },
        { t: 'Модель', v: function (r) { return '<b>' + U.esc(r.b.name) + '</b>' + (r.b.popular ? ' <span class="badge b-new">хит</span>' : '') + '<small>/arenda/' + U.esc(r.b.id) + '/</small>'; } },
        { t: 'Класс', v: function (r) { return U.GROUP[r.b.grp] + '<small>' + U.badge(r.b.license === 'none' ? 'none' : 'x', { none: 'Без прав', x: 'Права ' + U.LIC[r.b.license] }) + '</small>'; } },
        { t: '1–6 дн.', num: true, v: function (r) { return U.vnd(r.b.p1); } },
        { t: '7–29 дн.', num: true, v: function (r) { return U.vnd(r.b.p7); } },
        { t: 'Месяц', num: true, v: function (r) { return U.vnd(r.b.pm); } },
        { t: 'Свободно', num: true, v: function (r) { return '<b style="color:' + (r.free ? 'var(--green)' : 'var(--red)') + '">' + r.free + '</b> / ' + r.units; } },
        { t: 'Просмотры', num: true, v: function (r) { return U.num(r.v); } },
        { t: 'Открыли бронь', num: true, v: function (r) { return U.num(r.o); } },
        { t: 'Заявки', num: true, v: function (r) { return r.l; } },
        { t: 'Конверсия', num: true, v: function (r) { return U.pct(r.l, r.v); } },
        { t: 'На сайте', v: function (r) { return A.canWrite() ? '<label class="chk"><input type="checkbox" data-vis="' + r.b.id + '"' + (r.b.visible !== false ? ' checked' : '') + '></label>' : (r.b.visible !== false ? 'да' : 'скрыт'); } },
      ], rows, { rowAttr: function (r) { return 'class="click" data-href="#/bike/' + r.b.id + '"'; } });
    root.addEventListener('click', function (e) { if (e.target.closest('input,label')) return; var tr = e.target.closest('tr[data-href]'); if (tr) location.hash = tr.dataset.href; });
    root.addEventListener('change', async function (e) {
      var c = e.target.closest('[data-vis]'); if (!c) return;
      await A.DB.update('bikes', c.dataset.vis, { visible: c.checked }); d.bike[c.dataset.vis].visible = c.checked;
      A.log((c.checked ? 'Показана' : 'Скрыта') + ' модель', 'bike', c.dataset.vis); U.toast(c.checked ? 'Модель будет на сайте' : 'Модель скрыта с сайта', 'ok');
    });
    var add = document.getElementById('add'); if (add) add.onclick = function () { A.go('#/bike/new'); };
    var bulk = document.getElementById('bulk'); if (bulk) bulk.onclick = async function () {
      var r = await U.modal('Массовое изменение цен', '<div class="form"><label class="fld"><span>Класс</span><select class="select" id="g"><option value="">Все модели</option>' + Object.entries(U.GROUP).map(function (g) { return '<option value="' + g[0] + '">' + g[1] + '</option>'; }).join('') + '</select></label><label class="fld"><span>Изменение, %</span><input class="input" id="p" type="number" value="10" step="1"><small>Например 10 — поднять на 10%, -5 — снизить на 5%. Округление до 10 000 ₫.</small></label><label class="fld full"><span>Какие цены</span><select class="select" id="w"><option value="all">Все три тарифа</option><option value="p1">Только 1–6 дней</option><option value="p7">Только 7–29 дней</option><option value="pm">Только месяц</option></select></label></div>', {
        ok: 'Применить', onOk: async function (m) {
          var g = m.querySelector('#g').value, p = +m.querySelector('#p').value, w = m.querySelector('#w').value;
          if (!p) throw new Error('Укажите процент');
          var list = d.bikes.filter(function (b) { return !g || b.grp === g; });
          for (var i = 0; i < list.length; i++) {
            var b = list[i], patch = {};
            ['p1', 'p7', 'pm'].forEach(function (k) { if (w === 'all' || w === k) patch[k] = Math.round(b[k] * (1 + p / 100) / 10000) * 10000; });
            await A.DB.update('bikes', b.id, patch);
          }
          A.log('Массовое изменение цен ' + (p > 0 ? '+' : '') + p + '%', 'bike', g || 'all');
          return list.length;
        },
      });
      if (r) { U.toast('Обновлено моделей: ' + r, 'ok'); A.refresh(); }
    };
    document.getElementById('csv').onclick = function () { U.csv('modeli-' + U.today() + '.csv', [['Модель', function (r) { return r.b.name; }], ['Адрес', function (r) { return r.b.id; }], ['Класс', function (r) { return U.GROUP[r.b.grp]; }], ['1-6 дн', function (r) { return r.b.p1; }], ['7-29 дн', function (r) { return r.b.p7; }], ['Месяц', function (r) { return r.b.pm; }], ['Байков', function (r) { return r.units; }], ['Просмотры 30д', function (r) { return r.v; }], ['Заявки 30д', function (r) { return r.l; }]], rows); };
  };

  // ============================================================ КАРТОЧКА МОДЕЛИ
  var BF = [
    { k: 'name', label: 'Название', ph: 'Honda PCX 160' },
    { k: 'id', label: 'Адрес страницы', hint: 'латиница и дефисы: /arenda/<b>honda-pcx-160</b>/' },
    { k: 'brand', label: 'Бренд' },
    { k: 'type', label: 'Тип', ph: 'Скутер, Мотоцикл, Электроскутер…' },
    { k: 'grp', label: 'Класс (фильтр сайта)', type: 'select', opts: Object.entries(U.GROUP) },
    { k: 'license', label: 'Права', type: 'select', opts: [['none', 'Не нужны (до 50 см³ / до 50 км/ч)'], ['A1', 'A1 или A (до 125 см³)'], ['A', 'A (свыше 125 см³)']] },
    { k: 'cc', label: 'Объём, см³ (0 — электро)', type: 'number' }, { k: 'power', label: 'Мощность' },
    { k: 'year', label: 'Год', type: 'number' }, { k: 'seats', label: 'Мест', type: 'number' },
    { k: 'speed', label: 'Макс. скорость, км/ч', type: 'number' }, { k: 'gearbox', label: 'Коробка' },
    { k: 'tank', label: 'Бак / батарея' }, { k: 'fuel', label: 'Расход / запас хода' },
    { k: 'weight', label: 'Вес' }, { k: 'trunk', label: 'Багажник' },
    { k: 'rank', label: 'Порядок в каталоге', type: 'number', hint: '1 — выше всех' },
    { k: 'abs', label: 'Есть ABS', type: 'check' }, { k: 'popular', label: 'Хит (бейдж и выше в списках)', type: 'check' }, { k: 'visible', label: 'Показывать на сайте', type: 'check' },
  ];
  var PF = [{ k: 'p1', label: '1–6 дней, ₫ в день', type: 'number', step: 10000 }, { k: 'p7', label: '7–29 дней, ₫ в день', type: 'number', step: 10000 }, { k: 'pm', label: 'Месяц (30 дней), ₫', type: 'number', step: 100000 }];
  var TF = [
    { k: 'short', label: 'Короткое описание (под заголовком и в description)', type: 'textarea', full: true, rows: 2 },
    { k: 'about', label: 'Описание — абзацы, каждый с новой строки', type: 'lines', full: true, rows: 6 },
    { k: 'suits', label: 'Кому подойдёт', type: 'textarea', full: true, rows: 2 },
    { k: 'pros', label: 'Преимущества — по одному в строке', type: 'lines', full: true, rows: 4 },
    { k: 'tags', label: 'Теги на карточке — по одному в строке', type: 'lines', full: true, rows: 3 },
  ];
  var ALL = BF.concat(PF, TF);

  V.bike = async function (root, p) {
    var d = await A.data(true), isNew = p[0] === 'new';
    var b = isNew ? { id: '', name: '', brand: '', grp: '125', license: 'A1', type: 'Скутер', cc: 125, year: new Date().getFullYear(), seats: 2, abs: false, popular: false, visible: true, rank: 50, p1: 200000, p7: 160000, pm: 3000000, tags: [], about: [], pros: [] } : d.bike[p[0]];
    if (!b) { root.innerHTML = '<div class="card empty">Модель не найдена</div>'; return; }
    A.setTop(isNew ? 'Новая модель' : b.name, '<a class="btn" href="#/bikes">← К моделям</a>' + (!isNew ? '<a class="btn" target="_blank" rel="noopener" href="' + A.siteUrl('/arenda/' + b.id + '/') + '">' + U.icon('ext') + 'На сайте</a>' + (A.canWrite() ? '<button class="btn" id="dup">' + U.icon('copy') + 'Дублировать</button><button class="btn btn--r" id="del">' + U.icon('trash') + 'Удалить</button>' : '') : ''));
    var units = d.units.filter(function (u) { return u.bike_id === b.id; });
    var bl = d.leads.filter(function (l) { return l.bike_id === b.id; });
    var rev90 = U.sum(bl.filter(function (l) { return DONE.indexOf(l.status) >= 0 && l.date_from >= U.iso(U.daysAgo(90)); }), A.val);
    root.innerHTML = '<div class="grid g-2-1"><div class="stack">' +
      '<div class="card"><div class="card__h"><h2>Основное</h2></div><div id="f1">' + U.form(BF, b) + '</div></div>' +
      '<div class="card"><div class="card__h"><h2>Цены</h2><small>Скидка за срок применяется автоматически</small></div><div id="f2">' + U.form(PF, b, 'form-3') + '</div><div id="calc" style="margin-top:14px"></div></div>' +
      '<div class="card"><div class="card__h"><h2>Тексты страницы</h2><small>Уникальный текст = выше в поиске</small></div><div id="f3">' + U.form(TF, b) + '</div></div>' +
      (A.canWrite() ? '<div class="row"><button class="btn btn--o" id="save">' + (isNew ? 'Создать модель' : 'Сохранить') + '</button><span class="hint">На сайте изменения появятся после публикации.</span></div>' : '') + '</div>' +
      '<div class="stack"><div class="card"><div class="card__h"><h2>Фото</h2></div><div class="stack"><img id="pimg" src="' + U.esc(imgSrc(b)) + '" alt="" style="width:100%;border-radius:12px;background:var(--grey-l)">' +
      (A.canWrite() ? '<label class="btn">' + U.icon('plus') + 'Загрузить фото<input type="file" accept="image/*" id="file" hidden></label><input class="input" id="imgurl" placeholder="или ссылка на фото / имя файла" value="' + U.esc(b.img || '') + '">' : '') + '<p class="hint">Лучше всего: 1200×900, светлый фон, байк целиком сбоку. JPG/WebP до 300 КБ.</p></div></div>' +
      '<div class="card"><div class="card__h"><h2>Так страница выглядит в поиске</h2></div><div id="serp"></div></div>' +
      (!isNew ? '<div class="card"><div class="card__h"><h2>Показатели</h2></div><div class="stack" style="gap:6px">' +
        '<div class="row between"><span class="muted">Байков этой модели</span><b>' + units.length + '</b></div>' +
        '<div class="row between"><span class="muted">Заявок всего</span><b>' + bl.length + '</b></div>' +
        '<div class="row between"><span class="muted">Выручка за 90 дней</span><b>' + U.vnd(rev90) + '</b></div>' +
        '<div class="row between"><span class="muted">На один байк</span><b>' + U.vnd(units.length ? rev90 / units.length : 0) + '</b></div>' +
        '<a class="btn btn--s" href="#/units">Байки парка →</a></div></div>' : '') + '</div></div>';

    function cur() { return Object.assign({}, b, U.read(root, ALL), { img: (root.querySelector('#imgurl') || {}).value || b.img }); }
    function preview() {
      var v = cur();
      var t = 'Аренда ' + v.name + ' в Нячанге — от ' + U.vnd(v.p7) + '/день, с доставкой';
      var ds = 'Аренда ' + v.name + ' в Нячанге: ' + U.vnd(v.p1) + ' в день, ' + U.vnd(v.pm) + ' в месяц. ' + ({ none: 'Без прав', A1: 'Права A1 / A', A: 'Права A' }[v.license]) + '. Бесплатная доставка в отель, без залога паспорта, 2 шлема в комплекте.';
      root.querySelector('#serp').innerHTML = '<div style="font-family:arial,sans-serif"><div style="font-size:12px;color:#202124">mybike · /arenda/' + U.esc(v.id || '…') + '/</div><div style="color:#1a0dab;font-size:18px;line-height:1.3;margin:2px 0">' + U.esc(t.length > 65 ? t.slice(0, 62) + '…' : t) + '</div><div style="font-size:13px;color:#4d5156">' + U.esc(ds.length > 160 ? ds.slice(0, 157) + '…' : ds) + '</div></div>' +
        '<p class="hint" style="margin-top:8px">Title: ' + t.length + ' симв. · Description: ' + ds.length + ' симв. · Текст страницы: ' + (v.about || []).join(' ').split(/\s+/).filter(Boolean).length + ' слов' + ((v.about || []).join(' ').split(/\s+/).length < 60 ? ' <b style="color:var(--yellow)">— мало, добавьте 1–2 абзаца</b>' : '') + '</p>';
      var rows = [1, 3, 7, 14, 30, 60].map(function (n) { var c = U.cost(v, n); return '<tr><td>' + n + ' дн.</td><td class="num">' + U.vnd(c) + '</td><td class="num muted">' + U.vnd(c / n) + '/день</td></tr>'; }).join('');
      root.querySelector('#calc').innerHTML = '<table class="tbl"><thead><tr><th>Срок</th><th class="num">Итого клиенту</th><th class="num">За день</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        (v.p7 > v.p1 || v.pm > v.p7 * 30 ? '<p class="note note--red" style="margin-top:8px">Проверьте цены: тариф на 7+ дней должен быть не дороже 1–6 дней, а месяц — не дороже 30 × тариф 7+.</p>' : '');
    }
    root.addEventListener('input', U.debounce(preview, 150)); preview();
    var nm = root.querySelector('[name=name]'), idf = root.querySelector('[name=id]');
    if (!isNew) idf.readOnly = true;
    else nm.addEventListener('input', function () { idf.value = translit(nm.value); });
    var file = root.querySelector('#file');
    if (file) file.onchange = async function () {
      var f = file.files[0]; if (!f) return;
      try { U.toast('Загружаю…'); var url = await A.DB.upload(f); root.querySelector('#imgurl').value = url; root.querySelector('#pimg').src = url; U.toast('Фото загружено — не забудьте сохранить', 'ok'); }
      catch (e) { U.toast(e.message, 'err'); }
    };
    var iu = root.querySelector('#imgurl'); if (iu) iu.onchange = function () { root.querySelector('#pimg').src = imgSrc({ img: iu.value }); };
    var sv = root.querySelector('#save'); if (sv) sv.onclick = async function () {
      try {
        var v = cur();
        if (!v.name) throw new Error('Укажите название');
        if (!/^[a-z0-9-]+$/.test(v.id)) throw new Error('Адрес страницы: только латиница, цифры и дефисы');
        if (!(v.p1 > 0 && v.p7 > 0 && v.pm > 0)) throw new Error('Заполните все три цены');
        delete v.updated_at;
        if (isNew) { await A.DB.insert('bikes', v); A.log('Добавлена модель', 'bike', v.id); }
        else { var patch = Object.assign({}, v); delete patch.id; await A.DB.update('bikes', b.id, patch); A.log('Изменена модель', 'bike', b.id); }
        U.toast('Сохранено. На сайте — после публикации.', 'ok'); A.invalidate(); A.go('#/bike/' + v.id);
      } catch (e) { U.toast(e.message, 'err'); }
    };
    var del = document.getElementById('del'); if (del) del.onclick = async function () {
      if (units.length) return U.toast('Сначала удалите или перенесите байки этой модели (раздел «Байки парка»)', 'err');
      if (!(await U.confirm('Удалить модель «' + b.name + '»? Страница исчезнет с сайта после публикации.'))) return;
      await A.DB.remove('bikes', b.id); A.log('Удалена модель', 'bike', b.id); A.invalidate(); A.go('#/bikes');
    };
    var dup = document.getElementById('dup'); if (dup) dup.onclick = async function () {
      var c = Object.assign({}, b, { id: b.id + '-2', name: b.name + ' (копия)', visible: false }); delete c.updated_at;
      try { await A.DB.insert('bikes', c); A.invalidate(); A.go('#/bike/' + c.id); U.toast('Копия создана и скрыта с сайта', 'ok'); } catch (e) { U.toast(e.message, 'err'); }
    };
  };
  function translit(s) {
    var m = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };
    return s.toLowerCase().split('').map(function (c) { return m[c] !== undefined ? m[c] : c; }).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // ============================================================ БАЙКИ ПАРКА
  var UF_ST = '';
  V.units = async function (root) {
    var d = await A.data();
    A.setTop('Байки парка', (A.canWrite() ? '<button class="btn btn--o" id="add">' + U.icon('plus') + 'Добавить байк</button>' : '') + '<button class="btn" id="csv">' + U.icon('dl') + 'CSV</button>');
    var since90 = U.iso(U.daysAgo(89)), since30 = U.iso(U.daysAgo(29)), today = U.today();
    var rows = d.units.map(function (u) {
      var ls = d.leads.filter(function (l) { return l.unit_id === u.id; });
      var done = ls.filter(function (l) { return DONE.indexOf(l.status) >= 0; });
      var rev = U.sum(done.filter(function (l) { return l.date_from >= since90; }), A.val);
      var exp = U.sum(d.expenses.filter(function (e) { return e.unit_id === u.id && e.date >= since90; }), function (e) { return e.amount; });
      var busy = 0; done.forEach(function (l) { var a = l.date_from > since30 ? l.date_from : since30, b = l.date_to < today ? l.date_to : today; if (b >= a) busy += U.diffDays(a, b) + 1; });
      var cur = ls.find(function (l) { return l.status === 'issued'; });
      return { u: u, rev: rev, exp: exp, load: Math.min(100, Math.round(busy / 30 * 100)), cur: cur, toService: (u.next_service_km || 0) - (u.mileage || 0) };
    });
    var cnt = U.groupBy(d.units, function (u) { return u.status; });
    root.innerHTML = '<div class="kpis">' + ['free', 'rented', 'service', 'sold'].map(function (s) { return '<div class="kpi"><span>' + U.UNIT[s] + '</span><b>' + (cnt[s] || []).length + '</b></div>'; }).join('') +
      '<div class="kpi"><span>Средняя загрузка за 30 дней</span><b>' + Math.round(U.sum(rows, function (r) { return r.load; }) / Math.max(1, rows.length)) + '%</b></div></div>' +
      '<div class="toolbar"><div class="seg" id="st"><button data-s="" class="' + (!UF_ST ? 'is-active' : '') + '">Все</button>' + ['free', 'rented', 'service', 'sold'].map(function (s) { return '<button data-s="' + s + '" class="' + (UF_ST === s ? 'is-active' : '') + '">' + U.UNIT[s] + '</button>'; }).join('') + '</div></div><div id="list"></div>';
    function draw() {
      var list = rows.filter(function (r) { return !UF_ST || r.u.status === UF_ST; }).sort(function (a, b) { return A.bikeName(d, a.u.bike_id).localeCompare(A.bikeName(d, b.u.bike_id)); });
      root.querySelector('#list').innerHTML = U.table([
        { t: 'Номер', v: function (r) { return '<b>' + U.esc(r.u.plate || '—') + '</b><small>' + U.esc([r.u.color, r.u.year].filter(Boolean).join(', ')) + '</small>'; } },
        { t: 'Модель', v: function (r) { return U.esc(A.bikeName(d, r.u.bike_id)); } },
        { t: 'Статус', v: function (r) { return U.badge(r.u.status, U.UNIT) + (r.cur ? '<small><a href="#/lead/' + r.cur.id + '">' + U.esc(r.cur.name || 'клиент') + ' до ' + U.date(r.cur.date_to) + '</a></small>' : ''); } },
        { t: 'Пробег', num: true, v: function (r) { return U.num(r.u.mileage) + ' км'; } },
        { t: 'До ТО', num: true, v: function (r) { return r.u.next_service_km ? '<b style="color:' + (r.toService <= 200 ? 'var(--red)' : r.toService <= 500 ? 'var(--yellow)' : 'inherit') + '">' + U.num(r.toService) + ' км</b>' : '—'; } },
        { t: 'Загрузка 30д', num: true, v: function (r) { return r.load + '%'; } },
        { t: 'Выручка 90д', num: true, v: function (r) { return U.vnd(r.rev); } },
        { t: 'Расходы 90д', num: true, v: function (r) { return U.vnd(r.exp); } },
        { t: 'Прибыль 90д', num: true, v: function (r) { return '<b style="color:' + (r.rev - r.exp >= 0 ? 'var(--green)' : 'var(--red)') + '">' + U.vnd(r.rev - r.exp) + '</b>'; } },
      ], list, { rowAttr: function (r) { return 'class="click" data-u="' + r.u.id + '"'; }, empty: 'Байков пока нет — добавьте первый' });
    }
    draw();
    root.querySelector('#st').onclick = function (e) { var b = e.target.closest('[data-s]'); if (b) { UF_ST = b.dataset.s; root.querySelectorAll('#st button').forEach(function (x) { x.classList.toggle('is-active', x === b); }); draw(); } };
    root.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-u]'); if (tr && !e.target.closest('a')) edit(d.unit[tr.dataset.u]); });
    var add = document.getElementById('add'); if (add) add.onclick = function () { edit(null); };
    document.getElementById('csv').onclick = function () { U.csv('park-' + U.today() + '.csv', [['Номер', function (r) { return r.u.plate; }], ['Модель', function (r) { return A.bikeName(d, r.u.bike_id); }], ['Статус', function (r) { return U.UNIT[r.u.status]; }], ['Пробег', function (r) { return r.u.mileage; }], ['ТО на км', function (r) { return r.u.next_service_km; }], ['Загрузка 30д %', function (r) { return r.load; }], ['Выручка 90д', function (r) { return r.rev; }], ['Расходы 90д', function (r) { return r.exp; }]], rows); };

    async function edit(u) {
      var F = [
        { k: 'bike_id', label: 'Модель', type: 'select', opts: d.bikes.map(function (b) { return [b.id, b.name]; }) },
        { k: 'plate', label: 'Госномер', ph: '79-H1 123.45' }, { k: 'color', label: 'Цвет' }, { k: 'year', label: 'Год', type: 'number' },
        { k: 'status', label: 'Статус', type: 'select', opts: Object.entries(U.UNIT) },
        { k: 'mileage', label: 'Пробег, км', type: 'number' }, { k: 'next_service_km', label: 'Следующее ТО на, км', type: 'number' },
        { k: 'purchase_price', label: 'Цена покупки, ₫', type: 'number' }, { k: 'purchased_at', label: 'Дата покупки', type: 'date' },
        { k: 'notes', label: 'Заметки', type: 'textarea', full: true, rows: 2 },
      ];
      var base = u || { bike_id: d.bikes[0] && d.bikes[0].id, status: 'free', mileage: 0, next_service_km: 1000, year: new Date().getFullYear() };
      var r = await U.modal(u ? 'Байк ' + (u.plate || '') : 'Новый байк в парк', U.form(F, base), {
        ok: u ? 'Сохранить' : 'Добавить', extra: u && A.canWrite() ? '<button class="btn btn--r" data-delu style="margin-right:auto">Удалить</button>' : '',
        onOpen: function (m) {
          var b = m.querySelector('[data-delu]'); if (b) b.onclick = async function () {
            if (d.leads.some(function (l) { return l.unit_id === u.id && ['confirmed', 'issued'].indexOf(l.status) >= 0; })) return U.toast('У байка есть активные брони', 'err');
            if (!(await U.confirm('Удалить байк ' + (u.plate || '') + '? Лучше поставить статус «Продан» — тогда сохранится история.'))) return;
            await A.DB.remove('units', u.id); A.log('Удалён байк', 'unit', u.id); m.remove(); A.refresh();
          };
        },
        onOk: async function (m) {
          if (!A.canWrite()) throw new Error('Нет прав на изменение');
          var v = U.read(m, F);
          if (u) await A.DB.update('units', u.id, v); else await A.DB.insert('units', v);
          A.log(u ? 'Изменён байк' : 'Добавлен байк', 'unit', u ? u.id : v.plate);
        },
      });
      if (r) { U.toast('Сохранено', 'ok'); A.refresh(); }
    }
  };
})();
