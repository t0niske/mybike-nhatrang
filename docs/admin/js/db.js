/* MYBIKE Admin — слой данных.
   Два режима с одинаковым API:
   - supabase: реальная база (URL и anon key — в config.js или в «Настройки → Подключение»)
   - demo: всё хранится в localStorage этого браузера, сид из seed.json + демо-генератор */
(function () {
  'use strict';
  var TABLES = ['bikes', 'units', 'leads', 'expenses', 'events', 'audit'];
  var LS_DEMO = 'mybike_admin_demo_v1';
  var LS_CONN = 'mybike_admin_conn';
  var LS_SITE_EVENTS = 'mybike_site_events';
  var LS_SITE_LEADS = 'mybike_site_leads';

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { console.warn('localStorage', e); return false; } }
  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Не удалось загрузить ' + src)); }; document.head.appendChild(s); });
  }

  // ------------------------------------------------------------ DEMO
  function Demo() { this.mode = 'demo'; this.user = null; }
  Demo.prototype.init = async function () {
    var st = lsGet(LS_DEMO, null);
    if (!st) {
      var seed = await (await fetch('seed.json', { cache: 'no-cache' })).json();
      st = window.MBDemo.generate(seed);
      lsSet(LS_DEMO, st);
    }
    this.st = st;
    this.importSite();
    var s = lsGet('mybike_admin_demo_session', null);
    if (s) this.user = s;
  };
  // события и заявки, которые сайт записал в этом браузере
  Demo.prototype.importSite = function () {
    var ev = lsGet(LS_SITE_EVENTS, []), ld = lsGet(LS_SITE_LEADS, []);
    if (!ev.length && !ld.length) return;
    var st = this.st, maxId = st.events.reduce(function (m, e) { return Math.max(m, e.id || 0); }, 0);
    ev.forEach(function (e) { e.id = ++maxId; st.events.push(e); });
    ld.forEach(function (l) { l.id = l.id || uuid(); l.history = l.history || [{ ts: l.created_at, who: 'сайт', text: 'Заявка с сайта' }]; st.leads.push(l); });
    localStorage.removeItem(LS_SITE_EVENTS); localStorage.removeItem(LS_SITE_LEADS);
    this.save();
  };
  Demo.prototype.save = function () {
    if (!lsSet(LS_DEMO, this.st)) { // переполнение — подрезаем старые события
      this.st.events = this.st.events.slice(-Math.floor(this.st.events.length * 0.7));
      lsSet(LS_DEMO, this.st);
    }
  };
  Demo.prototype.session = async function () { return this.user; };
  Demo.prototype.login = async function () { this.user = { id: 'demo', email: 'demo@mybike', role: 'owner', name: 'Демо-владелец' }; lsSet('mybike_admin_demo_session', this.user); return this.user; };
  Demo.prototype.signup = Demo.prototype.login;
  Demo.prototype.logout = async function () { this.user = null; localStorage.removeItem('mybike_admin_demo_session'); };
  Demo.prototype.list = async function (t, o) {
    o = o || {};
    this.importSite();
    var rows = (this.st[t] || []).slice();
    if (o.since) { var f = t === 'events' ? 'ts' : (t === 'expenses' ? 'date' : 'created_at'); rows = rows.filter(function (r) { return (r[f] || '') >= o.since; }); }
    return JSON.parse(JSON.stringify(rows));
  };
  Demo.prototype.insert = async function (t, row) {
    row = Object.assign({}, row);
    if (t !== 'bikes' && !row.id) row.id = t === 'events' || t === 'audit' ? Date.now() + Math.random() : uuid();
    if (t === 'leads' && !row.created_at) row.created_at = new Date().toISOString();
    if (t === 'leads') { row.history = row.history || []; row.status = row.status || 'new'; }
    if (t === 'units' || t === 'expenses') row.created_at = row.created_at || new Date().toISOString();
    if (t === 'audit') row.ts = new Date().toISOString();
    if (t === 'bikes' && this.st.bikes.some(function (b) { return b.id === row.id; })) throw new Error('Модель с таким адресом уже есть');
    this.st[t].push(row); this.save(); return row;
  };
  Demo.prototype.update = async function (t, id, patch) {
    var r = this.st[t].find(function (x) { return x.id === id; });
    if (!r) throw new Error('Запись не найдена');
    Object.assign(r, patch); if (t === 'bikes') r.updated_at = new Date().toISOString();
    this.save(); return JSON.parse(JSON.stringify(r));
  };
  Demo.prototype.remove = async function (t, id) { this.st[t] = this.st[t].filter(function (x) { return x.id !== id; }); this.save(); };
  Demo.prototype.removeWhere = async function (t, field, before) { this.st[t] = this.st[t].filter(function (x) { return x[field] >= before; }); this.save(); };
  Demo.prototype.getContent = async function (k) { return JSON.parse(JSON.stringify(this.st.content[k] === undefined ? null : this.st.content[k])); };
  Demo.prototype.allContent = async function () { return JSON.parse(JSON.stringify(this.st.content)); };
  Demo.prototype.contentUpdatedAt = async function () { return this.st.contentUpdated || {}; };
  Demo.prototype.setContent = async function (k, v) { this.st.content[k] = v; this.st.contentUpdated = this.st.contentUpdated || {}; this.st.contentUpdated[k] = new Date().toISOString(); this.save(); };
  Demo.prototype.getSecret = async function (k) { return (this.st.secrets || {})[k] || ''; };
  Demo.prototype.setSecret = async function (k, v) { this.st.secrets = this.st.secrets || {}; this.st.secrets[k] = v; this.save(); };
  Demo.prototype.admins = async function () { return this.st.admins || [{ user_id: 'demo', email: 'demo@mybike', name: 'Демо-владелец', role: 'owner' }]; };
  Demo.prototype.addAdmin = async function (email, role) { this.st.admins = await this.admins(); this.st.admins.push({ user_id: uuid(), email: email, name: email.split('@')[0], role: role }); this.save(); return 'ok'; };
  Demo.prototype.removeAdmin = async function (uid) { this.st.admins = (await this.admins()).filter(function (a) { return a.user_id !== uid; }); this.save(); };
  Demo.prototype.upload = function (file) {
    return new Promise(function (res, rej) {
      if (file.size > 400 * 1024) return rej(new Error('В демо-режиме фото до 400 КБ (хранится в браузере). В рабочем режиме — без ограничения.'));
      var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(file);
    });
  };
  Demo.prototype.reset = async function () { localStorage.removeItem(LS_DEMO); await this.init(); };
  Demo.prototype.clearDemo = async function () { var st = this.st; st.leads = []; st.events = []; st.expenses = []; st.audit = []; st.units.forEach(function (u) { u.status = 'free'; }); this.save(); };
  Demo.prototype.exportAll = async function () { return JSON.parse(JSON.stringify(this.st)); };
  Demo.prototype.importAll = async function (data) { this.st = data; this.save(); };

  // ------------------------------------------------------------ SUPABASE
  function Supa(conn) { this.mode = 'supabase'; this.conn = conn; this.user = null; }
  Supa.prototype.init = async function () {
    if (!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js');
    this.sb = window.supabase.createClient(this.conn.url, this.conn.key, { auth: { persistSession: true } });
  };
  Supa.prototype.ok = function (r) { if (r.error) throw new Error(r.error.message); return r.data; };
  Supa.prototype.session = async function () {
    var s = this.ok(await this.sb.auth.getSession()).session;
    if (!s) return null;
    var me = this.ok(await this.sb.from('admins').select('*').eq('user_id', s.user.id).maybeSingle());
    this.user = { id: s.user.id, email: s.user.email, role: me ? me.role : null, name: me ? me.name : s.user.email };
    return this.user;
  };
  Supa.prototype.login = async function (email, pw) { this.ok(await this.sb.auth.signInWithPassword({ email: email, password: pw })); return this.session(); };
  Supa.prototype.signup = async function (email, pw) {
    var r = this.ok(await this.sb.auth.signUp({ email: email, password: pw, options: { emailRedirectTo: location.href.split('#')[0] } }));
    if (!r.session) throw new Error('Аккаунт создан. Подтвердите email по ссылке из письма и войдите.');
    return this.session();
  };
  Supa.prototype.logout = async function () { await this.sb.auth.signOut(); this.user = null; };
  Supa.prototype.list = async function (t, o) {
    o = o || {};
    var f = t === 'events' ? 'ts' : (t === 'expenses' ? 'date' : (t === 'bikes' ? 'rank' : (t === 'audit' ? 'ts' : 'created_at')));
    var all = [], from = 0, page = 1000;
    for (;;) {
      var q = this.sb.from(t).select('*').range(from, from + page - 1);
      if (o.since && t !== 'bikes' && t !== 'units') q = q.gte(f, o.since);
      q = q.order(f, { ascending: t === 'bikes' });
      var rows = this.ok(await q);
      all = all.concat(rows);
      if (rows.length < page || all.length >= (o.max || 50000)) break;
      from += page;
    }
    return all;
  };
  Supa.prototype.insert = async function (t, row) { return this.ok(await this.sb.from(t).insert(row).select().single()); };
  Supa.prototype.update = async function (t, id, patch) { return this.ok(await this.sb.from(t).update(patch).eq('id', id).select().single()); };
  Supa.prototype.remove = async function (t, id) { this.ok(await this.sb.from(t).delete().eq('id', id)); };
  Supa.prototype.removeWhere = async function (t, field, before) { this.ok(await this.sb.from(t).delete().lt(field, before)); };
  Supa.prototype.getContent = async function (k) { var r = this.ok(await this.sb.from('content').select('value').eq('key', k).maybeSingle()); return r ? r.value : null; };
  Supa.prototype.allContent = async function () { var o = {}; this.ok(await this.sb.from('content').select('key,value')).forEach(function (r) { o[r.key] = r.value; }); return o; };
  Supa.prototype.contentUpdatedAt = async function () { var o = {}; this.ok(await this.sb.from('content').select('key,updated_at')).forEach(function (r) { o[r.key] = r.updated_at; }); return o; };
  Supa.prototype.setContent = async function (k, v) { this.ok(await this.sb.from('content').upsert({ key: k, value: v })); };
  Supa.prototype.getSecret = async function (k) { var r = this.ok(await this.sb.from('secrets').select('value').eq('key', k).maybeSingle()); return r ? r.value : ''; };
  Supa.prototype.setSecret = async function (k, v) { this.ok(await this.sb.from('secrets').upsert({ key: k, value: v })); };
  Supa.prototype.admins = async function () { return this.ok(await this.sb.from('admins').select('*').order('created_at')); };
  Supa.prototype.addAdmin = async function (email, role) { return this.ok(await this.sb.rpc('add_admin', { p_email: email, p_role: role })); };
  Supa.prototype.removeAdmin = async function (uid) { this.ok(await this.sb.from('admins').delete().eq('user_id', uid)); };
  Supa.prototype.upload = async function (file) {
    var path = Date.now() + '-' + file.name.toLowerCase().replace(/[^a-z0-9.\-]+/g, '-');
    this.ok(await this.sb.storage.from('bikes').upload(path, file, { upsert: true, contentType: file.type }));
    return this.sb.storage.from('bikes').getPublicUrl(path).data.publicUrl;
  };
  Supa.prototype.exportAll = async function () {
    var o = { content: await this.allContent() };
    for (var i = 0; i < TABLES.length; i++) o[TABLES[i]] = await this.list(TABLES[i]);
    return o;
  };
  Supa.prototype.importAll = async function (data) {
    if (data.content) for (var k in data.content) await this.setContent(k, data.content[k]);
    var order = ['bikes', 'units', 'leads', 'expenses'];
    for (var i = 0; i < order.length; i++) {
      var rows = data[order[i]] || [];
      for (var j = 0; j < rows.length; j += 500) this.ok(await this.sb.from(order[i]).upsert(rows.slice(j, j + 500)));
    }
  };

  // ------------------------------------------------------------ фабрика
  window.MBDB = {
    uuid: uuid,
    conn: function () {
      var c = lsGet(LS_CONN, null);
      if (c && c.url && c.key) return c;
      var g = window.MYBIKE_ADMIN || {};
      return g.sb_url && g.sb_key ? { url: g.sb_url, key: g.sb_key, fromConfig: true } : null;
    },
    setConn: function (c) { if (c) lsSet(LS_CONN, c); else localStorage.removeItem(LS_CONN); },
    create: async function () {
      var c = this.conn();
      var db = c ? new Supa(c) : new Demo();
      await db.init();
      return db;
    },
  };
})();
