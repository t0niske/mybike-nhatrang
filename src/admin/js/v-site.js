/* MYBIKE Admin — сайт: контент, публикация и SEO, настройки */
(function () {
  'use strict';
  var V = A.views;
  var CFG = window.MYBIKE_ADMIN || {};

  // ------------------------------------------------------------ повторяющиеся блоки (отзывы, FAQ, разделы…)
  function repeater(id, items, fields, title) {
    return '<div class="list-items" data-rep="' + id + '">' + (items || []).map(function (it, i) { return repItem(it, fields, i, title); }).join('') + '</div>' +
      (A.canWrite() ? '<button class="btn btn--s" data-rep-add="' + id + '" style="margin-top:10px">' + U.icon('plus') + 'Добавить</button>' : '');
  }
  function repItem(it, fields, i, title) {
    return '<div class="li" data-ri><div class="li__h"><b>' + U.esc(title || 'Элемент') + ' ' + (i + 1) + '</b><span class="row">' +
      (A.canWrite() ? '<button class="btn btn--s btn--i" data-up title="Выше">↑</button><button class="btn btn--s btn--i" data-down title="Ниже">↓</button><button class="btn btn--s btn--i btn--r" data-rm title="Удалить">' + U.icon('trash') + '</button>' : '') + '</span></div>' +
      U.form(fields, it) + '</div>';
  }
  function bindRepeaters(root, defs) { // defs: {id: [fields, title]}
    root.addEventListener('click', function (e) {
      var add = e.target.closest('[data-rep-add]');
      if (add) { var id = add.dataset.repAdd, box = root.querySelector('[data-rep="' + id + '"]'); box.insertAdjacentHTML('beforeend', repItem({}, defs[id][0], box.children.length, defs[id][1])); return; }
      var it = e.target.closest('[data-ri]'); if (!it) return;
      if (e.target.closest('[data-rm]')) it.remove();
      else if (e.target.closest('[data-up]') && it.previousElementSibling) it.parentNode.insertBefore(it, it.previousElementSibling);
      else if (e.target.closest('[data-down]') && it.nextElementSibling) it.parentNode.insertBefore(it.nextElementSibling, it);
    });
  }
  function readRep(root, id, fields) { return Array.prototype.map.call(root.querySelectorAll('[data-rep="' + id + '"] > [data-ri]'), function (el) { return U.read(el, fields); }).filter(function (o) { return Object.values(o).some(function (v) { return v !== '' && v != null; }); }); }
  function counter(root) {
    root.querySelectorAll('[name=title],[name=desc]').forEach(function (el) {
      var lim = el.name === 'title' ? [30, 70] : [100, 170];
      var s = document.createElement('small'); el.after(s);
      var upd = function () { var n = el.value.length; s.innerHTML = n + ' символов · рекомендуем ' + lim[0] + '–' + lim[1] + (n < lim[0] || n > lim[1] ? ' <b style="color:var(--yellow)">⚠</b>' : ' <b style="color:var(--green)">✓</b>'); };
      el.addEventListener('input', upd); upd();
    });
  }

  var SITE_F = [
    { k: 'name', label: 'Название' }, { k: 'url', label: 'Домен сайта', hint: 'https://ваш-домен.ru, без слеша в конце' },
    { k: 'phone', label: 'Телефон (как показывать)' }, { k: 'phone_raw', label: 'Телефон для ссылки', ph: '+84123456789' },
    { k: 'whatsapp', label: 'WhatsApp — номер без +' }, { k: 'telegram', label: 'Telegram — username без @' },
    { k: 'vk', label: 'ВКонтакте — ссылка' }, { k: 'email', label: 'Email' },
    { k: 'address', label: 'Адрес точки выдачи', full: true }, { k: 'street', label: 'Улица (для разметки)' },
    { k: 'lat', label: 'Широта' }, { k: 'lng', label: 'Долгота' },
    { k: 'rub_rate', label: 'Курс: донгов за 1 ₽', type: 'number' }, { k: 'usd_rate', label: 'Курс: донгов за 1 $', type: 'number' },
    { k: 'founded', label: 'Год основания', type: 'number' }, { k: 'clients', label: 'Клиентов (для блока «Почему мы»)' }, { k: 'fleet_size', label: 'Байков в парке (для блока «Почему мы»)' },
    { k: 'ym', label: 'ID счётчика Яндекс Метрики', hint: 'только цифры, например 98765432' }, { k: 'ga', label: 'ID Google Analytics 4', hint: 'G-XXXXXXX' },
    { k: 'yandex_verification', label: 'Код Яндекс.Вебмастера' }, { k: 'google_verification', label: 'Код Google Search Console' },
  ];
  var REP = {
    reviews: [[{ k: 'name', label: 'Имя' }, { k: 'city', label: 'Город' }, { k: 'text', label: 'Отзыв', type: 'textarea', full: true, rows: 3 }], 'Отзыв', 'Отзывы на главной. Только реальные отзывы клиентов с их согласия.'],
    faq_main: [[{ k: 'q', label: 'Вопрос', full: true }, { k: 'a', label: 'Ответ (можно HTML-ссылки)', type: 'textarea', full: true, rows: 3 }], 'Вопрос', 'Частые вопросы на главной — попадают в разметку FAQ для Google и Яндекса.'],
    included: [[{ k: 'icon', label: 'Иконка', type: 'select', opts: [['shield', 'Щит'], ['passport', 'Документ'], ['truck', 'Доставка'], ['helmet', 'Шлем'], ['rain', 'Зонт'], ['wrench', 'Ключ'], ['chat', 'Чат'], ['card', 'Карта'], ['bolt', 'Молния'], ['coin', 'Монета'], ['clock', 'Часы'], ['pin', 'Метка']] }, { k: 'title', label: 'Заголовок' }, { k: 'text', label: 'Текст', type: 'textarea', full: true, rows: 2 }], 'Пункт', 'Блок «Всё включено» на главной и страницах.'],
    compare: [[{ k: 'row', label: 'Параметр' }, { k: 'us', label: 'У нас' }, { k: 'them', label: 'У других' }], 'Строка', 'Таблица «MYBIKE против обычного проката».'],
    delivery: [[{ k: 'place', label: 'Куда' }, { k: 'price', label: 'Стоимость' }, { k: 'time', label: 'Время' }], 'Зона', 'Зоны доставки на странице «Доставка».'],
    steps: [[{ k: 'title', label: 'Шаг' }, { k: 'text', label: 'Описание', type: 'textarea', full: true, rows: 2 }], 'Шаг', 'Блок «Как арендовать» — 4 шага.'],
  };
  var CAT_F = [
    { k: 'chip', label: 'Название на плитке' }, { k: 'short', label: 'Подпись на плитке' },
    { k: 'h1', label: 'Заголовок H1', full: true }, { k: 'title', label: 'Title (заголовок во вкладке и в поиске)', full: true },
    { k: 'desc', label: 'Description (описание в поиске)', type: 'textarea', full: true, rows: 2 },
    { k: 'lead', label: 'Вступление под заголовком', type: 'textarea', full: true, rows: 3 },
    { k: 'filter', label: 'Какие байки показывать (JSON)', type: 'json', full: true, rows: 3, hint: '{"license":"none"} — без прав · {"groups":["150"]} — класс · {"maxp1":200000} — до цены · {"sort":"pm"} — по цене месяца' },
  ];
  var SEC_F = [{ k: 'h2', label: 'Подзаголовок H2', full: true }, { k: 'html', label: 'Текст (HTML: <p>, <b>, <a href>)', type: 'textarea', full: true, rows: 5 }];
  var QA_F = [{ k: 'q', label: 'Вопрос', full: true }, { k: 'a', label: 'Ответ', type: 'textarea', full: true, rows: 2 }];
  var PAGE_F = [
    { k: 'nav', label: 'Название в меню' }, { k: 'noindex', label: 'Скрыть от поисковиков', type: 'check' },
    { k: 'h1', label: 'Заголовок H1', full: true }, { k: 'title', label: 'Title', full: true },
    { k: 'desc', label: 'Description', type: 'textarea', full: true, rows: 2 }, { k: 'lead', label: 'Вступление', type: 'textarea', full: true, rows: 2 },
    { k: 'body', label: 'Текст страницы (HTML)', type: 'textarea', full: true, rows: 16, hint: 'Плейсхолдеры: {base} — адрес сайта, {phone} {telegram} {whatsapp} {email} {address}, {table:delivery} — таблица доставки' },
  ];

  // ============================================================ КОНТЕНТ
  var cTab = 'site';
  V.content = async function (root) {
    var C = await A.DB.allContent();
    A.setTop('Контент сайта', '<a class="btn" href="#/publish">Публикация →</a>');
    var tabs = [['site', 'Контакты и настройки'], ['categories', 'Подборки (SEO-страницы)'], ['pages', 'Страницы'], ['reviews', 'Отзывы'], ['faq_main', 'FAQ главной'], ['included', 'Что включено'], ['compare', 'Сравнение'], ['delivery', 'Доставка'], ['steps', 'Шаги']];
    root.innerHTML = '<div class="card" style="padding:0"><div class="tabs" id="tabs" style="padding:0 12px">' + tabs.map(function (t) { return '<button data-t="' + t[0] + '" class="' + (cTab === t[0] ? 'is-active' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="pane" style="padding:20px"></div></div>';
    root.querySelector('#tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) { cTab = b.dataset.t; A.rerender(); } };
    var pane = root.querySelector('#pane'), save = A.canWrite() ? '<div class="row" style="margin-top:16px"><button class="btn btn--o" id="sv">Сохранить</button><span class="hint">Изменения появятся на сайте после публикации.</span></div>' : '';

    async function put(key, val) { await A.DB.setContent(key, val); A.log('Изменён контент: ' + key, 'content', key); U.toast('Сохранено. На сайте — после публикации.', 'ok'); }

    if (cTab === 'site') {
      pane.innerHTML = U.form(SITE_F, C.site || {}) + save;
      if (A.canWrite()) pane.querySelector('#sv').onclick = function () { put('site', Object.assign({}, C.site, U.read(pane, SITE_F))).catch(function (e) { U.toast(e.message, 'err'); }); };
    } else if (REP[cTab]) {
      var def = {}; def[cTab] = [REP[cTab][0], REP[cTab][1]];
      pane.innerHTML = '<p class="hint" style="margin-bottom:12px">' + REP[cTab][2] + '</p>' + repeater(cTab, C[cTab] || [], REP[cTab][0], REP[cTab][1]) + save;
      bindRepeaters(pane, def);
      if (A.canWrite()) pane.querySelector('#sv').onclick = function () { put(cTab, readRep(pane, cTab, REP[cTab][0])).catch(function (e) { U.toast(e.message, 'err'); }); };
    } else if (cTab === 'categories' || cTab === 'pages') {
      var list = C[cTab] || [];
      pane.innerHTML = '<p class="hint" style="margin-bottom:12px">' + (cTab === 'categories' ? 'Посадочные страницы под поисковые запросы: «байк без прав Нячанг», «аренда PCX» и т. д. У каждой — свой уникальный текст и FAQ.' : 'Информационные страницы сайта.') + '</p>' +
        U.table([
          { t: 'Страница', v: function (c) { return '<b>' + U.esc(c.h1) + '</b><small><code>/' + U.esc(c.slug) + '/</code></small>'; } },
          { t: 'Title', v: function (c) { return U.esc(c.title) + '<small>' + (c.title || '').length + ' симв.</small>'; } },
          { t: 'Текст', num: true, v: function (c) { return words(c) + ' слов'; } },
          { t: 'FAQ', num: true, v: function (c) { return (c.faq || []).length; } },
          { t: '', v: function (c) { return '<a class="btn btn--s" target="_blank" rel="noopener" href="' + A.siteUrl('/' + c.slug + '/') + '">' + U.icon('ext') + '</a>'; } },
        ], list, { rowAttr: function (c) { return 'class="click" data-slug="' + U.esc(c.slug) + '"'; } });
      pane.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-slug]'); if (tr && !e.target.closest('a')) editPage(cTab, list, tr.dataset.slug); });
    }
    counter(pane);
  };
  function words(c) { var t = (c.lead || '') + ' ' + (c.body || '') + ' ' + (c.sections || []).map(function (s) { return s.h2 + ' ' + s.html; }).join(' ') + ' ' + (c.faq || []).map(function (f) { return f.q + ' ' + f.a; }).join(' '); return t.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length; }
  async function editPage(key, list, slug) {
    var c = list.find(function (x) { return x.slug === slug; }), isCat = key === 'categories';
    var F = isCat ? CAT_F : PAGE_F;
    var body = U.form(F, c) + (isCat ? '<h3 style="margin:18px 0 10px">Разделы текста</h3>' + repeater('sections', c.sections, SEC_F, 'Раздел') : '') + '<h3 style="margin:18px 0 10px">Вопросы и ответы</h3>' + repeater('faq', c.faq, QA_F, 'Вопрос');
    var r = await U.modal((isCat ? 'Подборка ' : 'Страница ') + '/' + slug + '/', body, {
      large: true, ok: A.canWrite() ? 'Сохранить' : false,
      onOpen: function (m) { bindRepeaters(m, { sections: [SEC_F, 'Раздел'], faq: [QA_F, 'Вопрос'] }); counter(m); },
      onOk: async function (m) {
        var v = U.read(m.querySelector('.modal__b > .form'), F);
        if (isCat) v.sections = readRep(m, 'sections', SEC_F);
        v.faq = readRep(m, 'faq', QA_F);
        Object.assign(c, v);
        await A.DB.setContent(key, list); A.log('Изменена страница /' + slug + '/', 'content', key);
      },
    });
    if (r) { U.toast('Сохранено. На сайте — после публикации.', 'ok'); A.rerender(); }
  }

  // ============================================================ ПУБЛИКАЦИЯ И SEO
  V.publish = async function (root) {
    var d = await A.data(true), C = await A.DB.allContent(), upd = await A.DB.contentUpdatedAt();
    var build = null; try { build = await (await fetch(A.siteUrl('/build.json'), { cache: 'no-store' })).json(); } catch (e) {}
    A.setTop('Публикация и SEO');
    var bt = build ? build.built_at : '';
    var changedB = d.bikes.filter(function (b) { return b.updated_at && b.updated_at > bt; });
    var changedC = Object.keys(upd).filter(function (k) { return upd[k] > bt; });
    var pending = bt ? changedB.length + changedC.length : 0;
    var live = A.DB.mode === 'supabase';
    var repo = CFG.repo || '';

    // SEO-аудит
    var audit = [];
    function chk(page, url, title, desc, textWords, faq, extra) {
      var iss = [];
      if (title.length < 30 || title.length > 75) iss.push('title ' + title.length + ' симв.');
      if (desc.length < 100 || desc.length > 190) iss.push('description ' + desc.length + ' симв.');
      if (textWords < 120) iss.push('мало текста (' + textWords + ' слов)');
      if (faq < 2) iss.push('мало FAQ');
      (extra || []).forEach(function (x) { iss.push(x); });
      audit.push({ page: page, url: url, iss: iss, score: Math.max(0, 100 - iss.length * 20) });
    }
    d.bikes.filter(function (b) { return b.visible !== false; }).forEach(function (b) {
      var t = 'Аренда ' + b.name + ' в Нячанге — от ' + U.vnd(b.p7) + '/день, без депозита';
      var ds = 'Аренда ' + b.name + ' в Нячанге: ' + U.vnd(b.p1) + ' в день, ' + U.vnd(b.pm) + ' в месяц. ' + U.LIC[b.license] + '. Бесплатная доставка в отель, без депозита и залога паспорта, 2 шлема в комплекте.';
      var w = ((b.about || []).join(' ') + ' ' + (b.suits || '') + ' ' + (b.pros || []).join(' ') + ' ' + (b.short || '')).split(/\s+/).filter(Boolean).length + 120;
      var extra = []; if (!b.img || /placeholder/.test(b.img)) extra.push('нет своего фото');
      chk(b.name, '/arenda/' + b.id + '/', t, ds, w, 5, extra);
    });
    (C.categories || []).forEach(function (c) { chk(c.h1, '/' + c.slug + '/', c.title || '', c.desc || '', words(c), (c.faq || []).length); });
    (C.pages || []).filter(function (p) { return !p.noindex; }).forEach(function (p) { chk(p.h1, '/' + p.slug + '/', p.title || '', p.desc || '', words(p), (p.faq || []).length || 2); });
    var titles = U.groupBy(audit, function (a) { return a.page; });
    var avg = Math.round(U.sum(audit, function (a) { return a.score; }) / Math.max(1, audit.length));
    var site = C.site || {};
    var global = [];
    if (!site.url || /mybike-nhatrang\.ru/.test(site.url)) global.push(['bad', 'Не указан реальный домен (Контент → Контакты и настройки). Пока сайт на github.io и закрыт от индексации.']);
    if (!site.phone || /000 000/.test(site.phone)) global.push(['bad', 'Не указаны реальные контакты — телефон, Telegram, WhatsApp.']);
    if (!(C.reviews || []).length || (C.reviews || []).some(function (r) { return /Имя клиента|Здесь будет/.test(r.name + r.text); })) global.push(['warn', 'Отзывы — заглушки. Добавьте 3–6 реальных отзывов.']);
    if (!site.ym) global.push(['warn', 'Не подключена Яндекс Метрика — без неё нет данных о поисковых запросах и вебвизора.']);
    if (!site.yandex_verification) global.push(['warn', 'Сайт не подтверждён в Яндекс.Вебмастере — добавьте код и отправьте sitemap.xml.']);
    if (!site.google_verification) global.push(['warn', 'Сайт не подтверждён в Google Search Console.']);
    var noPhoto = d.bikes.filter(function (b) { return !b.img || /placeholder/.test(b.img); }).length;
    if (noPhoto) global.push(['warn', 'У ' + noPhoto + ' моделей нет своего фото — фото повышают кликабельность в поиске и конверсию.']);
    if (!global.length) global.push(['ok', 'Базовые настройки SEO в порядке.']);

    var siteUrl = site.url || '';
    root.innerHTML = '<div class="grid g2"><div class="card"><div class="card__h"><h2>Состояние сайта</h2></div><div class="stack">' +
      (build ? '<div class="row between"><span class="muted">Последняя сборка</span><b>' + U.dt(build.built_at) + ' (' + U.ago(build.built_at) + ')</b></div><div class="row between"><span class="muted">Страниц в sitemap</span><b>' + build.pages + '</b></div>' : '<p class="hint">Нет данных о сборке (build.json).</p>') +
      '<div class="row between"><span class="muted">Неопубликованные изменения</span><b style="color:' + (pending ? 'var(--orange-d)' : 'var(--green)') + '">' + (pending ? pending + ' ' + [changedB.length ? 'моделей: ' + changedB.length : '', changedC.length ? 'разделов: ' + changedC.join(', ') : ''].filter(Boolean).join(' · ') : 'нет') + '</b></div>' +
      (live ? '<p class="note note--green">Сайт пересобирается автоматически каждые 15 минут: GitHub Actions забирает изменения из базы и публикует их. Нужно быстрее — запустите сборку вручную.</p>' + (repo ? '<a class="btn btn--o" target="_blank" rel="noopener" href="https://github.com/' + U.esc(repo) + '/actions/workflows/publish.yml">' + U.icon('rocket') + 'Опубликовать сейчас (GitHub Actions)</a><p class="hint">Откроется страница сборки → кнопка «Run workflow».</p>' : '')
        : '<p class="note">В демо-режиме правки хранятся в этом браузере. Чтобы перенести их на сайт: скачайте файл ниже, положите его в проект как <code>data/remote.json</code> и запустите сборку. После подключения базы это будет происходить автоматически.</p><button class="btn btn--o" id="dl">' + U.icon('dl') + 'Скачать remote.json</button>') +
      '</div></div>' +
      '<div class="card"><div class="card__h"><h2>SEO: общие задачи</h2><span class="score score--' + (avg >= 80 ? 'ok' : avg >= 60 ? 'warn' : 'bad') + '">' + avg + ' / 100</span></div><ul class="check-list" style="padding-left:18px;margin:0">' + global.map(function (g) { return '<li style="color:' + (g[0] === 'bad' ? 'var(--red)' : g[0] === 'warn' ? '#8a6200' : 'var(--green)') + '">' + U.esc(g[1]) + '</li>'; }).join('') + '</ul>' +
      '<hr style="margin:14px 0"><div class="pill-list"><a class="btn btn--s" target="_blank" rel="noopener" href="' + A.siteUrl('/sitemap.xml') + '">sitemap.xml</a><a class="btn btn--s" target="_blank" rel="noopener" href="' + A.siteUrl('/robots.txt') + '">robots.txt</a><a class="btn btn--s" target="_blank" rel="noopener" href="' + A.siteUrl('/llms.txt') + '">llms.txt</a>' +
      '<a class="btn btn--s" target="_blank" rel="noopener" href="https://webmaster.yandex.ru/">Яндекс.Вебмастер</a><a class="btn btn--s" target="_blank" rel="noopener" href="https://search.google.com/search-console">Search Console</a>' +
      (siteUrl ? '<a class="btn btn--s" target="_blank" rel="noopener" href="https://pagespeed.web.dev/analysis?url=' + encodeURIComponent(siteUrl) + '">PageSpeed</a><a class="btn btn--s" target="_blank" rel="noopener" href="https://search.google.com/test/rich-results?url=' + encodeURIComponent(siteUrl + '/arenda/honda-pcx-160/') + '">Проверка разметки</a>' : '') + '</div></div></div>' +
      '<div class="card"><div class="card__h"><h2>SEO-аудит страниц</h2><small>' + audit.length + ' страниц · сначала проблемные</small></div>' + U.table([
        { t: 'Страница', v: function (a) { return '<b>' + U.esc(a.page) + '</b><small><code>' + U.esc(a.url) + '</code></small>'; } },
        { t: 'Оценка', num: true, v: function (a) { return '<span class="score score--' + (a.score >= 80 ? 'ok' : a.score >= 60 ? 'warn' : 'bad') + '">' + a.score + '</span>'; } },
        { t: 'Что улучшить', v: function (a) { return a.iss.length ? U.esc(a.iss.join(' · ')) : '<span style="color:var(--green)">всё хорошо</span>'; } },
      ], audit.sort(function (a, b) { return a.score - b.score; }), { max: 600 }) + '</div>';
    var dl = root.querySelector('#dl'); if (dl) dl.onclick = async function () {
      var bikes = await A.DB.list('bikes');
      U.download('remote.json', JSON.stringify({ bikes: bikes, content: C, exported_at: new Date().toISOString() }, null, 1), 'application/json');
    };
    void titles;
  };

  // ============================================================ НАСТРОЙКИ
  var sTab = 'conn';
  V.settings = async function (root) {
    A.setTop('Настройки');
    var tabs = [['conn', 'Подключение базы'], ['tg', 'Уведомления в Telegram'], ['team', 'Сотрудники'], ['data', 'Данные и резервные копии'], ['log', 'Журнал действий']];
    root.innerHTML = '<div class="card" style="padding:0"><div class="tabs" id="tabs" style="padding:0 12px">' + tabs.map(function (t) { return '<button data-t="' + t[0] + '" class="' + (sTab === t[0] ? 'is-active' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="pane" style="padding:20px"></div></div>';
    root.querySelector('#tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) { sTab = b.dataset.t; A.rerender(); } };
    var pane = root.querySelector('#pane');
    await ({ conn: conn, tg: tg, team: team, data: data, log: log })[sTab](pane);
  };

  async function conn(p) {
    var c = MBDB.conn() || {};
    p.innerHTML = '<div class="grid g2"><div class="stack"><p>Сейчас: <b>' + (A.DB.mode === 'supabase' ? 'подключена база Supabase' : 'демо-режим (данные в браузере)') + '</b></p>' +
      U.form([{ k: 'url', label: 'Supabase Project URL', ph: 'https://xxxx.supabase.co', full: true }, { k: 'key', label: 'Supabase anon public key', full: true, hint: 'Settings → API → Project API keys → <b>anon public</b>. Это публичный ключ, его можно хранить в коде сайта. Секретный service_role сюда не вставляйте.' }], { url: c.url || '', key: c.key || '' }) +
      '<div class="row"><button class="btn btn--o" id="test">Проверить и подключить</button>' + (A.DB.mode === 'supabase' && !c.fromConfig ? '<button class="btn" id="off">Отключить (вернуться в демо)</button>' : '') + '</div><div id="res"></div></div>' +
      '<div class="note note--blue"><b>Как подключить базу (15 минут, бесплатно):</b><ol style="margin:8px 0 0;padding-left:18px">' +
      '<li>Зарегистрируйтесь на <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a> и создайте проект (регион — Singapore, ближе к Вьетнаму).</li>' +
      '<li>Откройте SQL Editor, вставьте файл <code>supabase/schema.sql</code> из репозитория и нажмите Run.</li>' +
      '<li>Скопируйте Project URL и anon key сюда → «Проверить и подключить».</li>' +
      '<li>Создайте аккаунт на странице входа — первый аккаунт становится владельцем.</li>' +
      '<li>«Данные → Перенести в базу» — модели, тексты и (по желанию) демо-данные.</li>' +
      '<li>В GitHub → Settings → Secrets добавьте <code>SUPABASE_URL</code> и <code>SUPABASE_SERVICE_KEY</code> — для автопубликации.</li>' +
      '<li>Чтобы сайт тоже писал в базу заявки и аналитику — впишите URL и anon key в <code>data/site.pl</code> (sb_url, sb_key).</li></ol></div></div>';
    p.querySelector('#test').onclick = async function () {
      var v = U.read(p, [{ k: 'url' }, { k: 'key' }]), res = p.querySelector('#res');
      if (!/^https:\/\/.+/.test(v.url) || v.key.length < 30) { res.innerHTML = '<p class="note note--red">Проверьте URL и ключ</p>'; return; }
      res.innerHTML = '<p class="hint">Проверяю…</p>';
      try {
        var r = await fetch(v.url.replace(/\/$/, '') + '/rest/v1/events?select=id&limit=1', { headers: { apikey: v.key, Authorization: 'Bearer ' + v.key } });
        if (r.status === 404) throw new Error('Таблицы не найдены — выполните supabase/schema.sql в SQL Editor');
        if (r.status === 401) throw new Error('Неверный ключ');
        if (!r.ok && r.status !== 200) throw new Error('Ответ базы: ' + r.status);
        MBDB.setConn({ url: v.url.replace(/\/$/, ''), key: v.key });
        res.innerHTML = '<p class="note note--green">Подключено! Перезагружаю…</p>'; setTimeout(function () { location.hash = '#/'; location.reload(); }, 800);
      } catch (e) { res.innerHTML = '<p class="note note--red">' + U.esc(e.message) + '</p>'; }
    };
    var off = p.querySelector('#off'); if (off) off.onclick = function () { MBDB.setConn(null); location.reload(); };
  }

  async function tg(p) {
    var tok = await A.DB.getSecret('tg_bot_token'), chat = await A.DB.getSecret('tg_chat_id');
    p.innerHTML = '<div class="grid g2"><div class="stack">' + U.form([{ k: 'tok', label: 'Токен бота', full: true, ph: '123456789:AA…' }, { k: 'chat', label: 'Chat ID (ваш или группы менеджеров)', full: true, ph: '-1001234567890' }], { tok: tok, chat: chat }) +
      (A.isOwner() ? '<div class="row"><button class="btn btn--o" id="sv">Сохранить</button><button class="btn" id="test">Отправить тестовое сообщение</button></div>' : '<p class="note">Настраивает владелец.</p>') + '<div id="res"></div></div>' +
      '<div class="note note--blue"><b>Каждая новая заявка придёт в Telegram за секунду.</b><ol style="margin:8px 0 0;padding-left:18px"><li>Напишите <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> → /newbot → получите токен.</li><li>Создайте группу менеджеров и добавьте туда бота (или просто напишите боту /start).</li><li>Узнайте chat id: добавьте в группу <a href="https://t.me/getidsbot" target="_blank" rel="noopener">@getidsbot</a>.</li><li>Сохраните и отправьте тест.</li></ol><p class="hint" style="margin-top:8px">Токен хранится в базе в закрытой таблице, доступной только владельцу. Отправку делает сама база (триггер в schema.sql). В демо-режиме работает только тест.</p></div></div>';
    if (!A.isOwner()) return;
    p.querySelector('#sv').onclick = async function () { var v = U.read(p, [{ k: 'tok' }, { k: 'chat' }]); await A.DB.setSecret('tg_bot_token', v.tok); await A.DB.setSecret('tg_chat_id', v.chat); A.log('Изменены настройки Telegram', 'settings'); U.toast('Сохранено', 'ok'); };
    p.querySelector('#test').onclick = async function () {
      var v = U.read(p, [{ k: 'tok' }, { k: 'chat' }]), res = p.querySelector('#res');
      try {
        var r = await (await fetch('https://api.telegram.org/bot' + encodeURIComponent(v.tok) + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: v.chat, text: '✅ MYBIKE: уведомления о заявках работают' }) })).json();
        res.innerHTML = r.ok ? '<p class="note note--green">Сообщение отправлено</p>' : '<p class="note note--red">Telegram: ' + U.esc(r.description) + '</p>';
      } catch (e) { res.innerHTML = '<p class="note note--red">' + U.esc(e.message) + '</p>'; }
    };
  }

  async function team(p) {
    var list = await A.DB.admins();
    p.innerHTML = U.table([
      { t: 'Сотрудник', v: function (a) { return '<b>' + U.esc(a.name || '') + '</b><small>' + U.esc(a.email || '') + '</small>'; } },
      { t: 'Роль', v: function (a) { return { owner: 'Владелец — всё, включая сотрудников и Telegram', manager: 'Менеджер — заявки, парк, контент', viewer: 'Наблюдатель — только просмотр' }[a.role] || a.role; } },
      { t: '', v: function (a) { return A.isOwner() && a.user_id !== A.ME.id ? '<button class="btn btn--s btn--r" data-rm="' + a.user_id + '">Убрать доступ</button>' : ''; } },
    ], list) + (A.isOwner() ? '<div class="card" style="margin-top:16px;box-shadow:none;border:1px solid var(--line)"><div class="card__h"><h2>Добавить сотрудника</h2></div><p class="hint" style="margin-bottom:10px">Сотрудник сначала создаёт аккаунт на странице входа в админку («Создать аккаунт сотрудника»), затем вы добавляете его email здесь.</p><div class="toolbar"><input class="input grow" id="em" type="email" placeholder="email сотрудника"><select class="select" id="rl" style="width:auto"><option value="manager">Менеджер</option><option value="viewer">Наблюдатель</option><option value="owner">Владелец</option></select><button class="btn btn--o" id="add">Добавить</button></div></div>' : '');
    if (!A.isOwner()) return;
    p.querySelector('#add').onclick = async function () {
      var em = p.querySelector('#em').value.trim(); if (!em) return;
      try { var r = await A.DB.addAdmin(em, p.querySelector('#rl').value); if (r === 'not_found') return U.toast('Аккаунт с таким email не найден — сотрудник должен сначала зарегистрироваться', 'err'); A.log('Добавлен сотрудник ' + em, 'admin'); U.toast('Сотрудник добавлен', 'ok'); A.rerender(); } catch (e) { U.toast(e.message, 'err'); }
    };
    p.addEventListener('click', async function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; if (!(await U.confirm('Убрать доступ к админке?', 'Убрать'))) return; await A.DB.removeAdmin(b.dataset.rm); A.log('Удалён сотрудник', 'admin', b.dataset.rm); A.rerender(); });
  }

  async function data(p) {
    var demo = A.DB.mode === 'demo';
    p.innerHTML = '<div class="grid g2"><div class="stack"><h3>Резервная копия</h3><p class="hint">Все заявки, парк, расходы, тексты и аналитика в одном файле JSON.</p><div class="row"><button class="btn" id="exp">' + U.icon('dl') + 'Скачать резервную копию</button><label class="btn">' + U.icon('plus') + 'Восстановить из файла<input type="file" accept=".json" id="imp" hidden></label></div>' +
      (!demo ? '<h3 style="margin-top:16px">Перенести данные из демо</h3><p class="hint">Скачайте копию в демо-режиме (в другом браузере или до подключения) и восстановите её здесь — модели, тексты и при желании демо-заявки попадут в базу.</p>' : '') + '</div>' +
      '<div class="stack"><h3>Очистка</h3>' +
      (demo ? '<button class="btn" id="clean">Начать с чистого листа (удалить демо-заявки и аналитику)</button><button class="btn" id="reset">Сбросить демо-данные к исходным</button>' : '') +
      '<div class="toolbar"><span>Удалить события аналитики старше</span><select class="select" id="ret" style="width:auto"><option value="90">90 дней</option><option value="180" selected>180 дней</option><option value="365">1 года</option></select><button class="btn" id="purge">Удалить</button></div><p class="hint">Заявки и деньги не удаляются — только сырые события посещений.</p></div></div>';
    p.querySelector('#exp').onclick = async function () { U.download('mybike-backup-' + U.today() + '.json', JSON.stringify(await A.DB.exportAll()), 'application/json'); };
    p.querySelector('#imp').onchange = async function (e) {
      var f = e.target.files[0]; if (!f) return;
      if (!(await U.confirm('Загрузить данные из файла? Совпадающие записи будут перезаписаны.', 'Загрузить'))) return;
      try { var j = JSON.parse(await f.text()); if (demo && !j.content) throw new Error('Неверный файл'); await A.DB.importAll(demo ? Object.assign(await A.DB.exportAll(), j) : j); A.log('Импорт данных', 'data'); U.toast('Данные загружены', 'ok'); A.refresh(); }
      catch (err) { U.toast(err.message, 'err'); }
    };
    var cl = p.querySelector('#clean'); if (cl) cl.onclick = async function () { if (await U.confirm('Удалить все демо-заявки, расходы и аналитику? Модели и тексты останутся.')) { await A.DB.clearDemo(); A.refresh(); U.toast('Готово', 'ok'); } };
    var rs = p.querySelector('#reset'); if (rs) rs.onclick = async function () { if (await U.confirm('Сбросить все демо-данные к исходным? Ваши правки в демо пропадут.', 'Сбросить')) { await A.DB.reset(); A.refresh(); U.toast('Демо-данные пересозданы', 'ok'); } };
    p.querySelector('#purge').onclick = async function () {
      var days = +p.querySelector('#ret').value; if (!(await U.confirm('Удалить события аналитики старше ' + days + ' дней?'))) return;
      await A.DB.removeWhere('events', 'ts', U.daysAgo(days).toISOString()); A.log('Очистка аналитики старше ' + days + ' дн.', 'data'); A.refresh(); U.toast('Удалено', 'ok');
    };
  }

  async function log(p) {
    var rows = (await A.DB.list('audit')).sort(function (a, b) { return a.ts < b.ts ? 1 : -1; }).slice(0, 300);
    p.innerHTML = U.table([{ t: 'Когда', v: function (r) { return U.dt(r.ts); } }, { t: 'Кто', v: function (r) { return U.esc(r.actor || ''); } }, { t: 'Действие', v: function (r) { return U.esc(r.action) + (r.entity_id ? ' <small><code>' + U.esc(r.entity_id) + '</code></small>' : ''); } }], rows, { empty: 'Журнал пуст' });
  }
})();
