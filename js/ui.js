'use strict';
/* UI: layers/history, views, sheets, actions, export, boot */
const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac';
const isAudioName = (n) => /\.(mp3|m4a|aac|wav|ogg|opus|flac|weba|wma|amr)$/i.test(n);
const FOLDER_OK = 'showDirectoryPicker' in window;
const ACT = {};
let toastTimer = null;

/* ---------- layers & history ---------- */
function openLayer(name) { S.layers.push(name); history.pushState({ r: S.route, n: S.layers.length }, ''); }
function closeLayer(cb) {
  if (!S.layers.length) { if (cb) cb(); return; }
  S.afterPop = cb || null;
  history.back();
}
function closeAll(cb) {
  if (!S.layers.length) { if (cb) cb(); return; }
  S.afterPop = cb || null;
  history.go(-S.layers.length);
}
function hideLayer(n) {
  if (n === 'sheet') { const o = $('#ov'); o.classList.remove('on'); o.innerHTML = ''; }
  else if (n === 'player') { S.playerOpen = false; $('#player').classList.remove('open'); }
  else if (n === 'search') { const s = $('#srch'); s.classList.remove('on'); s.innerHTML = ''; }
}
window.addEventListener('popstate', (e) => {
  const st = e.state || { r: { name: 'library' }, n: 0 };
  const n = st.n || 0;
  let popped = false;
  while (S.layers.length > n) { hideLayer(S.layers.pop()); popped = true; }
  if (!popped && st.r && JSON.stringify(st.r) !== JSON.stringify(S.route)) { S.route = st.r; renderView(); renderNav(); }
  const cb = S.afterPop; S.afterPop = null;
  if (cb) cb();
});
function go(route) {
  S.route = route;
  history.pushState({ r: route, n: S.layers.length }, '');
  renderView(); renderNav();
}
function navTab(name) {
  S.route = { name };
  history.replaceState({ r: S.route, n: S.layers.length }, '');
  renderView(); renderNav();
}
function showSheet(html) {
  const o = $('#ov');
  o.innerHTML = '<div class="sheet"><div class="grab"></div>' + html + '</div>';
  o.classList.add('on');
  if (!S.layers.includes('sheet')) openLayer('sheet');
}
function toast(msg) {
  const el = $('#toast');
  el.innerHTML = '<div>' + esc(msg) + '</div>';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.innerHTML = ''; }, 2800);
}
function showProg(text, pct) {
  const p = $('#prog');
  p.classList.add('on');
  p.innerHTML = '<div class="tx">' + esc(text) + '</div><div class="meter"><i style="width:' + pct + '%"></i></div>';
}
function hideProg() { $('#prog').classList.remove('on'); }
function pickFiles(accept, multiple) {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = !!multiple; i.style.display = 'none';
    document.body.appendChild(i);
    i.onchange = () => { res([...i.files]); i.remove(); };
    i.oncancel = () => { res([]); i.remove(); };
    i.click();
  });
}

/* ---------- shared fragments ---------- */
function songCard(s, mode, plId) {
  const cur = S.curId === s.id ? ' cur' : '';
  if (mode === 'list') {
    return '<div class="row' + cur + '" data-act="play" data-id="' + s.id + '">' + coverHTML(s) +
      '<div class="rm"><div class="nm">' + esc(s.title) + '</div><div class="ar">' + esc(artistOf(s)) + '</div></div>' +
      '<span class="dur">' + fmtTime(s.dur) + '</span>' +
      '<button class="ib plain" data-act="songMenu" data-id="' + s.id + '"' + (plId ? ' data-pl="' + plId + '"' : '') + ' aria-label="' + t('aria.more') + '">' + ic('dots') + '</button></div>';
  }
  return '<div class="card' + cur + '" data-act="play" data-id="' + s.id + '"><div style="position:relative">' + coverHTML(s) +
    '<button class="more" data-act="songMenu" data-id="' + s.id + '"' + (plId ? ' data-pl="' + plId + '"' : '') + ' aria-label="' + t('aria.more') + '">' + ic('dots') + '</button>' +
    '<span class="pl">' + ic('play') + '</span></div>' +
    '<div class="meta"><div class="nm">' + esc(s.title) + '</div><div class="ar">' + esc(artistOf(s)) + '</div><div class="dur">' + fmtTime(s.dur) + '</div></div></div>';
}
function plCover(p, cls) {
  const u = coverURL(p);
  const g = p.grad || ['#9B5CFF', '#3987FF'];
  return '<div class="' + cls + '" style="background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')">' +
    (u ? '<img alt="" src="' + u + '">' : ic(p.icon || 'music')) + '</div>';
}
function backBtn() { return '<button class="ib" data-act="back" aria-label="' + t('aria.back') + '">' + ic('arrow', 'rtl-flip') + '</button>'; }

/* ---------- views ---------- */
function viewLibrary() {
  const list = sortedSongs();
  S.ctxIds = list.map((s) => s.id);
  let h = '<div class="top"><img class="logo" src="icons/logo-96.png" alt=""><h1>' + t('lib.title') + '</h1>' +
    '<button class="pill" data-act="add" aria-label="' + t('lib.add') + '">' + ic('upload') + '<span>' + t('lib.add') + '</span></button>' +
    '<button class="ib" data-act="search" aria-label="' + t('aria.search') + '">' + ic('search') + '</button>' +
    '<button class="ib' + (AMB.active() ? ' on-amb' : '') + '" data-act="ambient" aria-label="' + t('amb.title') + '">' + ic('waves') + '</button></div>';
  h += '<div class="sub cnt">' + t('lib.count', { n: num(list.length) }) + '</div>';
  if (!list.length) {
    return h + '<div class="empty"><img class="hero" src="img/empty-hero.webp" alt=""><h2>' + t('lib.emptyTitle') + '</h2><p>' + t('lib.emptySub') +
      '</p><button class="btn-main" data-act="add">' + ic('upload') + t('lib.add') + '</button></div>';
  }
  const g = S.set.view === 'grid';
  h += '<div class="toolbar"><div class="seg"><button data-act="view" data-v="grid" class="' + (g ? 'on' : '') + '">' + ic('grid') + t('lib.grid') + '</button>' +
    '<button data-act="view" data-v="list" class="' + (!g ? 'on' : '') + '">' + ic('list') + t('lib.list') + '</button></div><div style="flex:1"></div>' +
    '<button class="pill" data-act="sortMenu" aria-label="' + t('lib.sort') + '">' + ic('sort') + '<span>' + t('sort.' + S.set.sort) + '</span></button></div>';
  h += '<div class="' + (g ? 'grid' : 'list') + '">' + list.map((s) => songCard(s, g ? 'grid' : 'list')).join('') + '</div>';
  return h;
}
function viewPlaylists() {
  let h = '<div class="top"><h1>' + t('pl.title') + '</h1></div>' +
    '<button class="btn-main" data-act="newPl">' + ic('plus') + t('pl.new') + '</button><div class="plgrid">';
  h += S.pls.map((p) => {
    const n = plSongs(p).length;
    return '<div class="plc" data-act="openPl" data-id="' + p.id + '">' + plCover(p, 'bgi') + '<div class="shade"></div>' +
      '<div class="inf"><div class="nm">' + esc(plName(p)) + '</div><div class="ar">' + t('pl.count', { n: num(n) }) + '</div></div>' +
      '<button class="pl" data-act="playPl" data-id="' + p.id + '" aria-label="' + t('pl.playAll') + '">' + ic('play') + '</button></div>';
  }).join('') + '</div>';
  return h;
}
function viewPlaylist() {
  const p = S.pls.find((x) => x.id === S.route.id);
  if (!p) return '';
  const songs = plSongs(p);
  S.ctxIds = songs.map((s) => s.id);
  const auto = plAuto(p);
  let h = '<div class="top">' + backBtn() + '<h1>' + esc(plName(p)) + '</h1>' +
    (auto ? '' : '<button class="ib" data-act="plMenu" data-id="' + p.id + '" aria-label="' + t('aria.more') + '">' + ic('dots') + '</button>') + '</div>';
  h += '<div class="plhead">' + plCover(p, 'cv') + '<div class="info"><h2>' + esc(plName(p)) + '</h2><div class="sub">' + t('pl.count', { n: num(songs.length) }) + '</div></div></div>';
  h += '<div class="row-btns" style="margin-bottom:12px"><button class="btn-sec" data-act="plPlayAll" data-id="' + p.id + '">' + ic('play') + t('pl.playAll') + '</button>' +
    '<button class="btn-sec" data-act="plPlayAll" data-id="' + p.id + '" data-sh="1">' + ic('shuffle') + t('pl.shuffle') + '</button></div>';
  if (!auto) h += '<button class="btn-sec" style="width:100%;margin-bottom:12px" data-act="plAddSongs" data-id="' + p.id + '">' + ic('plus') + t('pl.addSongs') + '</button>';
  else h += '<div class="sub" style="margin-bottom:10px">' + t('pl.auto') + '</div>';
  h += songs.length ? '<div class="list">' + songs.map((s) => songCard(s, 'list', auto ? '' : p.id)).join('') + '</div>' : '<div class="sub" style="text-align:center;padding:24px 0">' + t('pl.empty') + '</div>';
  return h;
}
function viewSettings() {
  const fa = S.set.lang === 'fa';
  const q = (k) => '<button data-act="quality" data-v="' + k + '" class="' + (S.set.quality === k ? 'on' : '') + '">' + t('exp.q.' + k) + '</button>';
  const row = (act, icn, key, val) => '<button class="setrow" data-act="' + act + '">' + ic(icn) + '<span class="lbl">' + t(key) + (val ? '<div class="val">' + val + '</div>' : '') + '</span>' + ic('arrow', 'fwd') + '</button>';
  return '<div class="top"><h1>' + t('set.title') + '</h1></div><div class="setlist">' +
    '<div class="setcard"><div class="t">' + ic('globe') + t('set.lang') + '</div><div class="seg full"><button data-act="lang" data-v="fa" class="' + (fa ? 'on' : '') + '">فارسی</button><button data-act="lang" data-v="en" class="' + (!fa ? 'on' : '') + '">English</button></div></div>' +
    '<div class="setcard"><div class="t">' + ic('download') + t('set.quality') + '</div><div class="seg full">' + q('high') + q('good') + q('normal') + '</div></div>' +
    '<div class="setcard" id="storBox"></div>' +
    row('goManage', 'music', 'set.manage') + row('privacy', 'shield', 'set.privacy') + row('clearCache', 'broom', 'set.clearCache') +
    row('help', 'help', 'set.help') + row('goAbout', 'info', 'set.about') +
    '<div class="setrow" style="cursor:default">' + ic('wave') + '<span class="lbl">' + t('set.version') + '</span><span class="val">' + num(S.about.version || '1.0.0') + '</span></div></div>';
}
async function updateStorage() {
  const box = $('#storBox');
  if (!box) return;
  let used = 0, quota = 0, pers = false;
  try { const e = await navigator.storage.estimate(); used = e.usage || 0; quota = e.quota || 0; pers = await navigator.storage.persisted(); } catch (e) { /* ignore */ }
  const free = Math.max(0, quota - used), pct = quota ? Math.min(100, (used / quota) * 100) : 0;
  const low = quota && free < 300 * 1048576;
  box.innerHTML = '<div class="t">' + ic('database') + t('set.storage') + '</div>' +
    (quota ? '<div class="meter ' + (low ? 'warn' : '') + '"><i style="width:' + Math.max(2, pct) + '%"></i></div>' : '') +
    '<div class="sub">' + (quota ? t('set.storageUsed', { u: fmtSize(used), f: fmtSize(free) }) : t('set.storageUsedOnly', { u: fmtSize(used) })) + '</div>' +
    (low ? '<div class="note-warn">' + t('add.lowSpace') + '</div>' : '') +
    '<div class="sub">' + (pers ? t('set.persistOn') : t('set.persistOff')) + '</div>' +
    (pers ? '' : '<button class="btn-sec" data-act="persist">' + t('set.persistBtn') + '</button>');
}
function viewManage() {
  const total = S.songs.reduce((a, s) => a + (s.kind === 'handle' ? 0 : s.size || 0), 0);
  let h = '<div class="top">' + backBtn() + '<h1>' + t('man.title') + '</h1></div>';
  if (!S.songs.length) return h + '<div class="sub" style="text-align:center;padding:30px 0">' + t('man.empty') + '</div>';
  h += '<div class="sub" style="margin-bottom:10px">' + t('man.total', { n: num(S.songs.length), s: fmtSize(total) }) + '</div><div class="list">';
  h += sortedSongs().map((s) => '<div class="row" style="cursor:default">' + coverHTML(s) + '<div class="rm"><div class="nm">' + esc(s.title) + '</div><div class="ar">' +
    (s.kind === 'handle' ? t('man.folderBadge') : t('man.copyBadge') + ' · ' + fmtSize(s.size || 0)) + '</div></div>' +
    '<button class="ib plain" data-act="delSong" data-id="' + s.id + '" aria-label="' + t('common.delete') + '">' + ic('trash') + '</button></div>').join('');
  h += '</div><button class="btn-danger" style="margin-top:16px" data-act="delAll">' + t('man.deleteAll') + '</button>';
  return h;
}
function viewAbout() {
  const tg = S.about.telegram || 'F7TM_1711';
  return '<div class="top">' + backBtn() + '<h1>' + t('about.title') + '</h1></div><div class="about"><img class="big" src="icons/icon-512.png" alt="">' +
    '<h2>' + t('app.name') + '</h2><div class="sub">' + t('app.tagline') + '</div><p>' + t('app.desc') + '</p>' +
    '<span class="verpill">' + t('about.version', { v: num(S.about.version || '1.0.0') }) + '</span>' +
    '<a class="tg" href="https://t.me/' + esc(tg) + '" target="_blank" rel="noopener">' + ic('tg') + '<span>@' + esc(tg) + '</span></a>' +
    '<div class="sub">' + t('about.contact') + '</div><div class="made">' + t('about.madeWith') + '</div></div>';
}

/* ---------- export view ---------- */
function expParams() {
  const e = S.exp;
  if (e.fx === 'custom') return { speed: e.custom.speed, reverb: e.custom.reverb };
  const f = S.fxList.find((x) => x.id === e.fx);
  return { speed: f.speed, reverb: f.reverb };
}
const KBPS = { high: 192, good: 128, normal: 96 };
function expSizeText() {
  const e = S.exp, s = S.byId.get(e.id), p = expParams();
  const sec = (s.dur || 0) / p.speed + (p.reverb > 0 ? REVERB_SEC : 0);
  const bytes = e.format === 'wav' ? sec * 44100 * 4 : sec * KBPS[e.quality] * 125;
  return t('exp.size', { s: fmtSize(bytes) });
}
function viewExport() {
  const e = S.exp, s = e && S.byId.get(e.id);
  if (!s) return '<div class="top">' + backBtn() + '<h1>' + t('exp.title') + '</h1></div><div class="sub">' + t('exp.noSong') + '</div>';
  let h = '<div class="top">' + backBtn() + '<h1>' + t('exp.title') + '</h1></div>';
  h += '<div class="exp-song">' + coverHTML(s) + '<div style="min-width:0"><div class="nm">' + esc(s.title) + '</div><div class="ar">' + esc(artistOf(s)) + '</div></div></div>';
  if (e.stage === 'busy') {
    return h + '<div class="proc"><div class="wave">' + '<i></i>'.repeat(14) + '</div><div class="pct" id="expPct">' + num(Math.round(e.pct)) + '٪</div>' +
      '<div class="meter"><i id="expBar" style="width:' + e.pct + '%"></i></div><div class="sub" id="expStage">' + t(e.stageKey) + '</div></div>';
  }
  if (e.stage === 'done') {
    const canShare = navigator.canShare && navigator.canShare({ files: [new File([e.result.blob], e.result.name, { type: e.result.blob.type })] });
    return h + '<div class="proc"><div class="done-ic">' + ic('check') + '</div><h2>' + t('exp.done') + '</h2><div class="sub" style="direction:ltr">' + esc(e.result.name) + '<br>' + fmtSize(e.result.blob.size) + '</div></div>' +
      '<div class="row-btns" style="margin-bottom:12px"><button class="btn-main" data-act="expSave">' + ic('download') + t('exp.save') + '</button>' +
      (canShare ? '<button class="btn-main" data-act="expShare">' + ic('share') + t('exp.share') + '</button>' : '') + '</div>' +
      '<button class="btn-sec" style="width:100%" data-act="expAgain">' + t('exp.again') + '</button>';
  }
  if (e.stage === 'error') {
    return h + '<div class="proc"><p class="err">' + esc(e.err) + '</p></div><button class="btn-main" data-act="expAgain">' + t('exp.again') + '</button>';
  }
  const opts = [];
  if (e.custom) opts.push({ id: 'custom', label: t('exp.custom', { speed: num(e.custom.speed.toFixed(2)), r: num(e.custom.reverb) }) });
  S.fxList.forEach((f) => opts.push({ id: f.id, label: t('fx.' + f.id) + (S.lang === 'fa' ? ' (' + t('fxs.' + f.id) + ')' : '') }));
  const wav = e.format === 'wav';
  const ambIds = Object.keys(e.amb || {});
  const ambHtml = ambIds.length
    ? '<div class="field"><label>' + t('exp.amb') + '</label><div class="seg full"><button data-act="expAmb" data-v="1" class="' + (e.useAmb ? 'on' : '') + '">' + t('exp.ambOn') + '</button><button data-act="expAmb" data-v="0" class="' + (!e.useAmb ? 'on' : '') + '">' + t('exp.ambOff') + '</button></div><div class="hint">' +
      ambIds.map((id) => t('amb.' + id) + ' ' + num(Math.round(e.amb[id] * 100)) + '٪').join(S.lang === 'fa' ? '، ' : ', ') + '</div></div>'
    : '<div class="hint" style="margin:-6px 0 14px">' + t('exp.ambNone') + '</div>';
  const qb = (k) => '<button data-act="expQ" data-v="' + k + '" class="' + (e.quality === k ? 'on' : '') + '">' + t('exp.q.' + k) + '</button>';
  h += '<div class="field"><label>' + t('exp.effect') + '</label><select class="sel" data-bind="expfx">' +
    opts.map((o) => '<option value="' + o.id + '"' + (o.id === e.fx ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>' + t('exp.format') + '</label><div class="seg full"><button data-act="expFmt" data-v="mp3" class="' + (!wav ? 'on' : '') + '">MP3</button><button data-act="expFmt" data-v="wav" class="' + (wav ? 'on' : '') + '">WAV</button></div><div class="hint">' + t('exp.mp3Hint') + '</div></div>' +
    '<div class="field"><label>' + t('exp.quality') + '</label><div class="seg full' + (wav ? '' : '') + '">' + (wav ? ['high', 'good', 'normal'].map((k) => '<button class="dis" data-act="expQ" data-v="' + k + '">' + t('exp.q.' + k) + '</button>').join('') : qb('high') + qb('good') + qb('normal')) + '</div></div>' +
    ambHtml + '<div class="sizeln" id="expSize">' + expSizeText() + '</div><button class="btn-main" data-act="expGo">' + ic('wave') + t('exp.build') + '</button>';
  return h;
}
function setExp(pct, stageKey) {
  const e = S.exp; if (!e) return;
  e.pct = pct; if (stageKey) e.stageKey = stageKey;
  const a = $('#expPct'), b = $('#expBar'), c = $('#expStage');
  if (a) a.textContent = num(Math.round(pct)) + '٪';
  if (b) b.style.width = pct + '%';
  if (c && stageKey) c.textContent = t(stageKey);
}
async function runExport() {
  const e = S.exp, s = S.byId.get(e.id), p = expParams();
  e.stage = 'busy'; e.pct = 3; e.stageKey = 'exp.stage.decode';
  renderView();
  let timer = null;
  try {
    const rec = await DB.get('files', s.id);
    let file;
    if (rec.blob) file = rec.blob;
    else {
      let pm = await rec.handle.queryPermission({ mode: 'read' });
      if (pm !== 'granted') pm = await rec.handle.requestPermission({ mode: 'read' });
      if (pm !== 'granted') throw new Error('perm');
      file = await rec.handle.getFile();
    }
    timer = setInterval(() => { setExp(e.pct + (55 - e.pct) * 0.05, e.pct > 22 ? 'exp.stage.render' : null); }, 300);
    const buf = await renderEffect(file, p.speed, p.reverb, e.useAmb ? e.amb : null);
    clearInterval(timer); timer = null;
    const gain = peakGain(buf);
    const fxName = e.fx === 'custom' ? 'Custom' : t('fx.' + e.fx).replace(/\s*\+\s*/g, ' ');
    const base = (s.title + ' - ' + fxName + (e.useAmb ? ' + Ambient' : '')).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    let blob, name;
    if (e.format === 'wav') {
      setExp(80, 'exp.stage.encode');
      await new Promise((r) => setTimeout(r, 30));
      blob = encodeWav(buf, gain); name = base + '.wav';
    } else {
      setExp(58, 'exp.stage.lib');
      try { await loadLame(); } catch (er) { throw new Error('lib'); }
      setExp(60, 'exp.stage.encode');
      blob = await encodeMp3(buf, KBPS[e.quality], gain, (f) => setExp(60 + f * 40));
      name = base + '.mp3';
    }
    e.result = { blob, name }; e.stage = 'done';
  } catch (er) {
    if (timer) clearInterval(timer);
    e.stage = 'error';
    e.err = er && er.message === 'lib' ? t('exp.errLib') : (er && er.message === 'perm' ? t('err.perm') : t('exp.errMem'));
  }
  if (S.route.name === 'export') renderView();
}

/* ---------- player & mini ---------- */
function fmtSpeed(v) { return num(v.toFixed(2)) + 'x'; }
function ambientRows() {
  const meta = { rain: 'rain', thunder: 'thunder', wind: 'wind', waves: 'waves', fire: 'fire', white: 'wave', brown: 'moon' };
  return AMB.ids.map((id) => {
    const v = Math.round((AMB.vols[id] || 0) * 100);
    return '<div class="amb' + (v > 0 ? ' on' : '') + '"><span class="aic">' + ic(meta[id]) + '</span><span class="alb">' + t('amb.' + id) + '</span>' +
      '<input type="range" class="sl-amb" min="0" max="100" step="1" value="' + v + '" style="--p:' + v + '%" data-bind="amb" data-id="' + id + '" aria-label="' + t('amb.' + id) + '"></div>';
  }).join('');
}
function renderMini() {
  const m = $('#mini'), s = S.byId.get(S.curId);
  if (!s) { m.innerHTML = ''; return; }
  const a = Engine.audio, d = a && isFinite(a.duration) ? a.duration : 0, c = a ? a.currentTime || 0 : 0;
  m.innerHTML = '<div class="mini" data-act="openPlayer">' + coverHTML(s) + '<div class="mt"><div class="nm">' + esc(s.title) + '</div><div class="ar">' + esc(artistOf(s)) + '</div></div>' +
    '<button class="pp" data-act="toggle" aria-label="' + t(S.playing ? 'aria.pause' : 'aria.play') + '">' + ic(S.playing ? 'pause' : 'play') + '</button>' +
    '<span class="sub">' + ic('chevup') + '</span><div class="bar"><i id="miniBar" style="width:' + (d ? (c / d) * 100 : 0) + '%"></i></div></div>';
}
function renderPlayer() {
  const p = $('#player'), s = S.byId.get(S.curId);
  if (!s) { p.innerHTML = ''; return; }
  const a = Engine.audio, d = isFinite(a.duration) ? a.duration : (s.dur || 0), c = a.currentTime || 0, pct = d ? (c / d) * 100 : 0;
  const m = fxMatch(S.cur.speed, S.cur.reverb);
  const chips = S.fxList.map((e) => '<button class="chip' + (m === e.id ? ' on' : '') + '" data-act="fx" data-id="' + e.id + '">' + ic(e.icon) + '<b>' + t('fx.' + e.id) + '</b>' +
    (S.lang === 'fa' ? '<small>' + t('fxs.' + e.id) + '</small>' : '') + '</button>').join('');
  const sp = ((S.cur.speed * 100 - 50) / 150) * 100;
  p.innerHTML = '<div class="pl-top"><button class="ib plain" data-act="closePlayer" aria-label="' + t('aria.close') + '">' + ic('chevdown') + '</button><div class="grp">' +
    '<button class="ib plain" data-act="exportCur" aria-label="' + t('menu.export') + '">' + ic('download') + '</button>' +
    '<button class="ib plain" data-act="favCur" aria-label="' + t('aria.fav') + '" style="' + (s.fav ? 'color:var(--acc)' : '') + '">' + ic(s.fav ? 'heartfill' : 'heart') + '</button>' +
    '<button class="ib plain" data-act="songMenu" data-id="' + s.id + '" aria-label="' + t('aria.more') + '">' + ic('dots') + '</button></div></div>' +
    '<div class="pl-body"><div class="pl-cover">' + coverHTML(s) + '</div><div class="pl-title">' + esc(s.title) + '</div><div class="pl-artist">' + esc(artistOf(s)) + '</div>' +
    '<div class="seek"><input id="seek" type="range" min="0" max="1000" value="' + (d ? Math.round((c / d) * 1000) : 0) + '" style="--p:' + pct + '%" data-bind="seek" aria-label="seek">' +
    '<div class="times"><span id="tCur">' + fmtTime(c) + '</span><span id="tRem">-' + fmtTime(Math.max(0, d - c)) + '</span></div></div>' +
    '<div class="ctrls"><button class="ib' + (S.shuffle ? ' on' : '') + '" data-act="shuffle" aria-label="' + t('aria.shuffle') + '">' + ic('shuffle') + '</button>' +
    '<button class="ib" data-act="prev" aria-label="' + t('aria.prev') + '">' + ic('prev') + '</button>' +
    '<button class="big" data-act="toggle" aria-label="' + t(S.playing ? 'aria.pause' : 'aria.play') + '">' + ic(S.playing ? 'pause' : 'play') + '</button>' +
    '<button class="ib" data-act="next" aria-label="' + t('aria.next') + '">' + ic('next') + '</button>' +
    '<button class="ib' + (S.repeat !== 'off' ? ' on' : '') + '" data-act="repeat" aria-label="' + t('aria.repeat') + '">' + ic(S.repeat === 'one' ? 'repeat1' : 'repeat') + '</button></div>' +
    '<div class="volrow"><button class="ib" data-act="volMute" aria-label="' + t('aria.volume') + '">' + ic(S.set.vol > 0 ? 'vol' : 'volx') + '</button>' +
    '<input id="vol" type="range" min="0" max="100" step="1" value="' + Math.round(S.set.vol * 100) + '" style="--p:' + Math.round(S.set.vol * 100) + '%" data-bind="vol" aria-label="' + t('vol.music') + '">' +
    '<output id="volOut">' + num(Math.round(S.set.vol * 100)) + '٪</output></div>' +
    '<div class="fxbox"><h3>' + ic('wave') + t('player.fxTitle') + '</h3><div class="fxrow">' + chips + '</div>' +
    '<div class="sllabel"><span>' + t('player.speed') + '</span><output id="spdOut">' + fmtSpeed(S.cur.speed) + '</output></div>' +
    '<input id="spd" type="range" min="50" max="200" step="1" value="' + Math.round(S.cur.speed * 100) + '" style="--p:' + sp + '%" data-bind="spd" aria-label="' + t('player.speed') + '">' +
    '<div class="sllabel"><span>' + t('player.reverb') + '</span><output id="revOut">' + num(S.cur.reverb) + '٪</output></div>' +
    '<input id="rev" class="sl-rev" type="range" min="0" max="100" step="1" value="' + S.cur.reverb + '" style="--p:' + S.cur.reverb + '%" data-bind="rev" aria-label="' + t('player.reverb') + '">' +
    '<div class="fxbtns"><button class="btn-sec" data-act="fxReset">' + t('player.reset') + '</button><button class="btn-main" data-act="fxSave">' + t('player.saveFx') + '</button></div></div>' +
    '<div class="fxbox" style="margin-top:12px"><h3>' + ic('waves') + t('amb.title') + '</h3><div class="sub">' + t('amb.hint') + '</div>' + ambientRows() +
    '<button class="btn-sec" style="width:100%;margin-top:6px" data-act="ambStop">' + t('amb.stop') + '</button></div></div>';
}
function syncFxUI() {
  const m = fxMatch(S.cur.speed, S.cur.reverb);
  S.cur.fx = m;
  document.querySelectorAll('#player .fxrow .chip').forEach((c) => c.classList.toggle('on', c.dataset.id === m));
  const spd = $('#spd'), rev = $('#rev');
  if (spd) { spd.value = Math.round(S.cur.speed * 100); spd.style.setProperty('--p', ((S.cur.speed * 100 - 50) / 150) * 100 + '%'); }
  if (rev) { rev.value = S.cur.reverb; rev.style.setProperty('--p', S.cur.reverb + '%'); }
  const so = $('#spdOut'), ro = $('#revOut');
  if (so) so.textContent = fmtSpeed(S.cur.speed);
  if (ro) ro.textContent = num(S.cur.reverb) + '٪';
}
function openPlayer() {
  if (!S.curId) return;
  S.playerOpen = true;
  renderPlayer();
  $('#player').classList.add('open');
  openLayer('player');
}

/* ---------- render ---------- */
function routeTab() {
  const n = S.route.name;
  if (n === 'playlists' || n === 'playlist') return 'playlists';
  if (n === 'settings' || n === 'manage' || n === 'about') return 'settings';
  return 'library';
}
function renderNav() {
  const nav = $('#nav');
  nav.style.display = S.route.name === 'export' ? 'none' : '';
  const tab = routeTab();
  nav.innerHTML = [['library', 'music', 'nav.library'], ['playlists', 'list', 'nav.playlists'], ['settings', 'settings', 'nav.settings']]
    .map((x) => '<button data-act="tab" data-v="' + x[0] + '" class="' + (tab === x[0] ? 'on' : '') + '">' + ic(x[1]) + '<span>' + t(x[2]) + '</span></button>').join('');
}
function renderView(keep) {
  const v = $('#view'), st = keep ? v.scrollTop : 0;
  let h = '';
  switch (S.route.name) {
    case 'playlists': h = viewPlaylists(); break;
    case 'playlist': h = viewPlaylist(); break;
    case 'settings': h = viewSettings(); break;
    case 'manage': h = viewManage(); break;
    case 'about': h = viewAbout(); break;
    case 'export': h = viewExport(); break;
    default: h = viewLibrary();
  }
  v.innerHTML = h;
  if (!keep) { v.classList.remove('view-in'); void v.offsetWidth; v.classList.add('view-in'); }
  v.scrollTop = st;
  if (S.route.name === 'settings') updateStorage();
  markCurrent();
}
function markCurrent() {
  document.querySelectorAll('#view [data-id].card, #view [data-id].row, #srch [data-id].row').forEach((el) => el.classList.toggle('cur', el.dataset.id === S.curId));
}
function render() { renderView(); renderNav(); renderMini(); }

/* ---------- adding songs ---------- */
async function scanDir(dir, out, depth) {
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'file') { if (isAudioName(name)) out.push(h); }
    else if (depth < 3) await scanDir(h, out, depth + 1);
  }
}
async function addSongs(items, kind) {
  const total = items.length;
  const sigs = new Set(S.songs.map((s) => s.sig));
  let added = 0, dup = 0, done = 0, idx = 0, quota = false;
  const base = Date.now();
  showProg(t('add.progress', { n: num(0), m: num(total) }), 0);
  const work = async (i) => {
    try {
      const it = items[i];
      const file = kind === 'handle' ? await it.getFile() : it;
      const sig = file.name + '|' + file.size;
      if (sigs.has(sig)) { dup++; return; }
      sigs.add(sig);
      const meta = await parseID3(file);
      const dur = await getDuration(file);
      const cover = meta.cover ? await resizeCover(meta.cover) : null;
      const np = nameParts(file.name);
      const song = { id: uid(), title: (meta.title || np.title).trim(), artist: (meta.artist || np.artist || '').trim(), dur, size: file.size, added: base + (total - i), plays: 0, fav: false, cover, fx: null, kind, sig };
      await DB.put('files', kind === 'handle' ? { id: song.id, handle: it } : { id: song.id, blob: file });
      await DB.put('songs', song);
      S.songs.push(song); S.byId.set(song.id, song);
      added++;
    } catch (e) {
      if (e && e.name === 'QuotaExceededError') quota = true;
    } finally {
      done++;
      showProg(t('add.progress', { n: num(done), m: num(total) }), (done / total) * 100);
    }
  };
  const runners = Array.from({ length: 3 }, async () => { while (idx < total && !quota) { const i = idx++; await work(i); } });
  await Promise.all(runners);
  hideProg();
  if (quota) toast(t('add.fail'));
  else if (!added) toast(t('add.none'));
  else toast(dup ? t('add.doneDup', { n: num(added), d: num(dup) }) : t('add.done', { n: num(added) }));
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
  if (S.route.name === 'library' || S.route.name === 'manage') renderView(true);
}

/* ---------- search ---------- */
function searchResults(q) {
  q = q.trim().toLowerCase();
  const list = q ? sortedSongs().filter((s) => (s.title + ' ' + (s.artist || '')).toLowerCase().includes(q)) : sortedSongs();
  S.ctxIds = list.map((s) => s.id);
  $('#srchRes').innerHTML = list.length ? '<div class="list">' + list.map((s) => songCard(s, 'list')).join('') + '</div>' : '<div class="none">' + t('search.none') + '</div>';
  markCurrent();
}

/* ---------- helpers for actions ---------- */
function startPlay(id, fx) {
  const ids = S.ctxIds.includes(id) ? S.ctxIds : [id];
  setQueue(ids, id);
  return playSong(id, fx ? { fx } : undefined);
}
async function savePl(p) { await DB.put('playlists', p); }
function confirmSheet(msg, act, data, danger, label) {
  showSheet('<p class="txt">' + esc(msg) + '</p><div class="row-btns"><button class="btn-sec" data-act="cancel">' + t('common.cancel') + '</button>' +
    '<button class="btn-sec" style="' + (danger ? 'border-color:rgba(255,79,163,.7);color:#ff8cc0' : '') + '" data-act="' + act + '" ' + data + '>' + t(label || 'common.delete') + '</button></div>');
}
function afterPlChange() { if (S.route.name === 'playlists' || S.route.name === 'playlist') renderView(true); }

/* ---------- actions ---------- */
Object.assign(ACT, {
  cancel: () => closeLayer(),
  tab: (d) => { if (S.layers.length) closeAll(() => navTab(d.v)); else navTab(d.v); },
  back: () => history.back(),
  play: (d) => {
    const ids = S.ctxIds.slice(), id = d.id;
    const run = () => { setQueue(ids.includes(id) ? ids : [id], id); playSong(id); };
    if (S.layers.includes('search')) closeLayer(run); else run();
  },
  toggle: () => togglePlay(),
  openPlayer: () => openPlayer(),
  closePlayer: () => closeLayer(),
  prev: () => playPrev(),
  next: () => playNext(false),
  shuffle: () => { S.shuffle = !S.shuffle; if (S.curId) rebuildQueue(S.curId); renderPlayer(); },
  repeat: () => { S.repeat = S.repeat === 'off' ? 'all' : S.repeat === 'all' ? 'one' : 'off'; renderPlayer(); },
  view: (d) => { S.set.view = d.v; saveSet(); renderView(true); },
  sortMenu: () => showSheet('<h3>' + t('lib.sort') + '</h3>' + ['new', 'name', 'plays'].map((k) =>
    '<button class="mi' + (S.set.sort === k ? ' sel' : '') + '" data-act="sortSet" data-v="' + k + '">' + ic('sort') + '<span>' + t('sort.' + k) + '</span><span class="chk">' + ic('check') + '</span></button>').join('')),
  sortSet: (d) => { S.set.sort = d.v; saveSet(); closeLayer(() => renderView(true)); },
  add: () => {
    if (!FOLDER_OK) return ACT.addPick();
    showSheet('<h3>' + t('lib.add') + '</h3><button class="mi" data-act="addPick">' + ic('music') + '<span>' + t('add.pick') + '<small>' + t('add.pickSub') + '</small></span></button>' +
      '<button class="mi" data-act="addFolder">' + ic('folder') + '<span>' + t('add.folder') + '<small>' + t('add.folderSub') + '</small></span></button>');
  },
  addPick: () => {
    const p = pickFiles(AUDIO_ACCEPT, true);
    if (S.layers.includes('sheet')) closeLayer();
    p.then((files) => { files = files.filter((f) => f.type.startsWith('audio/') || isAudioName(f.name)); if (files.length) addSongs(files, 'blob'); });
  },
  addFolder: () => {
    let p;
    try { p = window.showDirectoryPicker({ mode: 'read' }); } catch (e) { toast(t('add.folderErr')); return; }
    closeLayer();
    p.then(async (dir) => {
      const hs = [];
      await scanDir(dir, hs, 0);
      if (!hs.length) { toast(t('add.none')); return; }
      addSongs(hs, 'handle');
    }).catch((e) => { if (!e || e.name !== 'AbortError') toast(t('add.folderErr')); });
  },
  search: () => {
    const s = $('#srch');
    s.innerHTML = '<div class="bar">' + '<button class="ib" data-act="cancel" aria-label="' + t('aria.back') + '">' + ic('arrow', 'rtl-flip') + '</button>' +
      '<input class="inp" id="srchIn" type="search" placeholder="' + t('search.placeholder') + '" autocomplete="off"></div><div class="res" id="srchRes"></div>';
    s.classList.add('on');
    openLayer('search');
    searchResults('');
    $('#srchIn').focus();
  },
  /* song menu */
  songMenu: (d) => {
    const s = S.byId.get(d.id); if (!s) return;
    const it = (act, icn, key, extra) => '<button class="mi' + (extra === 'danger' ? ' danger' : '') + '" data-act="' + act + '" data-id="' + s.id + '"' + (d.pl ? ' data-pl="' + d.pl + '"' : '') + '>' + ic(icn) + '<span>' + t(key) + '</span></button>';
    showSheet('<div style="margin-bottom:6px"><div class="nm">' + esc(s.title) + '</div><div class="ar">' + esc(artistOf(s)) + '</div></div>' +
      it('fxPick', 'wave', 'menu.playFx') + it('plPick', 'list', 'menu.addPl') + it('togFav', s.fav ? 'heartfill' : 'heart', s.fav ? 'menu.unfav' : 'menu.fav') +
      it('editSong', 'edit', 'menu.edit') + it('pickCover', 'image', 'menu.cover') + it('exportSong', 'download', 'menu.export') +
      (d.pl ? it('plRemove', 'minus', 'pl.remove') : '') + it('delSong', 'trash', 'menu.delete', 'danger'));
  },
  fxPick: (d) => showSheet('<h3>' + t('menu.playFx') + '</h3><div class="mini-fx">' + S.fxList.map((e) =>
    '<button class="chip" data-act="fxPlay" data-id="' + d.id + '" data-fx="' + e.id + '">' + ic(e.icon) + '<b>' + t('fx.' + e.id) + '</b>' + (S.lang === 'fa' ? '<small>' + t('fxs.' + e.id) + '</small>' : '') + '</button>').join('') + '</div>'),
  fxPlay: (d) => {
    const e = S.fxList.find((f) => f.id === d.fx);
    const ids = S.ctxIds.slice();
    closeLayer(() => { setQueue(ids.includes(d.id) ? ids : [d.id], d.id); playSong(d.id, { fx: { fx: e.id, speed: e.speed, reverb: e.reverb } }); });
  },
  togFav: async (d) => {
    const s = S.byId.get(d.id); if (!s) return;
    s.fav = !s.fav; await DB.put('songs', s);
    toast(t(s.fav ? 'fav.added' : 'fav.removed'));
    closeLayer(() => { renderView(true); if (S.playerOpen) renderPlayer(); });
  },
  favCur: async () => {
    const s = S.byId.get(S.curId); if (!s) return;
    s.fav = !s.fav; await DB.put('songs', s);
    renderPlayer(); toast(t(s.fav ? 'fav.added' : 'fav.removed'));
  },
  editSong: (d) => {
    const s = S.byId.get(d.id);
    showSheet('<h3>' + t('edit.title') + '</h3><input class="inp" id="eTitle" placeholder="' + t('edit.name') + '" value="' + esc(s.title) + '"><input class="inp" id="eArtist" placeholder="' + t('edit.artist') + '" value="' + esc(s.artist || '') + '">' +
      '<div class="row-btns"><button class="btn-sec" data-act="cancel">' + t('common.cancel') + '</button><button class="btn-main" style="height:48px" data-act="saveEdit" data-id="' + s.id + '">' + t('common.save') + '</button></div>');
  },
  saveEdit: async (d) => {
    const s = S.byId.get(d.id), ti = $('#eTitle').value.trim();
    if (ti) s.title = ti;
    s.artist = $('#eArtist').value.trim();
    await DB.put('songs', s);
    closeLayer(() => { renderView(true); renderMini(); if (S.playerOpen) renderPlayer(); });
  },
  pickCover: async (d) => {
    const p = pickFiles('image/*', false);
    closeLayer();
    const [f] = await p;
    if (!f) return;
    const b = await resizeCover(f);
    if (!b) return;
    const s = S.byId.get(d.id);
    s.cover = b; dropCover(s.id); await DB.put('songs', s);
    toast(t('cover.set'));
    renderView(true); renderMini(); if (S.playerOpen) renderPlayer(); if (S.curId === s.id) updateMedia();
  },
  delSong: (d) => confirmSheet(t('confirm.deleteSong'), 'delSongOk', 'data-id="' + d.id + '"', true),
  delSongOk: async (d) => { await removeSong(d.id); closeLayer(() => { renderView(true); renderMini(); }); },
  delAll: () => confirmSheet(t('man.confirmAll'), 'delAllOk', '', true),
  delAllOk: async () => {
    for (const s of S.songs.slice()) await removeSong(s.id);
    closeLayer(() => { renderView(true); renderMini(); });
  },
  exportSong: (d) => closeAll(() => ACT.exportStart(d.id)),
  exportCur: () => { const id = S.curId; closeAll(() => ACT.exportStart(id)); },
  exportStart: (id) => {
    const s = S.byId.get(id); if (!s) return;
    const base = S.curId === id ? S.cur : s.fx;
    let fx = 'nightcore', custom = null;
    if (base) { const m = fxMatch(base.speed, base.reverb); if (m === 'custom') { fx = 'custom'; custom = { speed: base.speed, reverb: base.reverb }; } else fx = m; }
    const amb = {};
    AMB.ids.forEach((k) => { const v = AMB.vols[k] || 0; if (v > 0) amb[k] = v; });
    S.exp = { id, fx, custom, amb, useAmb: Object.keys(amb).length > 0, format: 'mp3', quality: S.set.quality, stage: 'form', pct: 0 };
    go({ name: 'export', id });
  },
  expFmt: (d) => { S.exp.format = d.v; renderView(true); },
  expQ: (d) => { S.exp.quality = d.v; renderView(true); },
  expAmb: (d) => { S.exp.useAmb = d.v === '1'; renderView(true); },
  expGo: () => runExport(),
  expAgain: () => { S.exp.stage = 'form'; S.exp.result = null; renderView(); },
  expSave: () => {
    const r = S.exp.result, a = document.createElement('a');
    a.href = URL.createObjectURL(r.blob); a.download = r.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    toast(t('exp.saved'));
  },
  expShare: () => {
    const r = S.exp.result, f = new File([r.blob], r.name, { type: r.blob.type });
    navigator.share({ files: [f], title: r.name }).catch(() => {});
  },
  /* effects */
  fx: (d) => {
    const e = S.fxList.find((f) => f.id === d.id);
    S.cur = { fx: e.id, speed: e.speed, reverb: e.reverb };
    Engine.set(e.speed, e.reverb); syncFxUI();
  },
  fxReset: async () => {
    const s = S.byId.get(S.curId); if (!s) return;
    S.cur = { fx: 'original', speed: 1, reverb: 0 };
    Engine.set(1, 0); s.fx = null; await DB.put('songs', s); syncFxUI();
  },
  fxSave: async () => {
    const s = S.byId.get(S.curId); if (!s) return;
    s.fx = { fx: fxMatch(S.cur.speed, S.cur.reverb), speed: S.cur.speed, reverb: S.cur.reverb };
    await DB.put('songs', s); toast(t('player.saved'));
  },
  /* playlists */
  openPl: (d) => go({ name: 'playlist', id: d.id }),
  playPl: (d) => {
    const p = S.pls.find((x) => x.id === d.id), ids = plSongs(p).map((s) => s.id);
    if (!ids.length) { toast(t('pl.empty')); return; }
    setQueue(ids, ids[0]); playSong(ids[0]);
  },
  plPlayAll: (d) => {
    const p = S.pls.find((x) => x.id === d.id), ids = plSongs(p).map((s) => s.id);
    if (!ids.length) { toast(t('pl.empty')); return; }
    S.shuffle = !!d.sh;
    const start = d.sh ? ids[Math.floor(Math.random() * ids.length)] : ids[0];
    setQueue(ids, start); playSong(start);
  },
  newPl: (d) => showSheet('<h3>' + t('pl.new') + '</h3><input class="inp" id="plName" placeholder="' + t('pl.name') + '"><div class="row-btns"><button class="btn-sec" data-act="cancel">' + t('common.cancel') + '</button>' +
    '<button class="btn-main" style="height:48px" data-act="newPlOk"' + (d && d.add ? ' data-add="' + d.add + '"' : '') + '>' + t('common.save') + '</button></div>'),
  newPlOk: async (d) => {
    const name = $('#plName').value.trim(); if (!name) return;
    const g = GRADS[Math.floor(Math.random() * GRADS.length)];
    const p = { id: 'pl_' + uid(), kind: 'manual', name, icon: 'music', grad: g, songIds: d.add ? [d.add] : [], cover: null, builtin: false };
    S.pls.push(p); await savePl(p);
    closeLayer(() => { afterPlChange(); if (d.add) toast(t('pl.added', { name })); });
  },
  plPick: (d) => {
    const s = S.byId.get(d.id);
    const items = S.pls.filter((p) => !plAuto(p)).map((p) => '<button class="mi' + (p.songIds.includes(s.id) ? ' sel' : '') + '" data-act="plToggle" data-id="' + s.id + '" data-pl="' + p.id + '">' + ic('list') + '<span>' + esc(plName(p)) + '</span><span class="chk">' + ic('check') + '</span></button>').join('');
    showSheet('<h3>' + t('pl.chooseTitle') + '</h3>' + items + '<button class="mi" data-act="newPl" data-add="' + s.id + '">' + ic('plus') + '<span>' + t('pl.new') + '</span></button>');
  },
  plToggle: async (d, el) => {
    const p = S.pls.find((x) => x.id === d.pl);
    const has = p.songIds.includes(d.id);
    p.songIds = has ? p.songIds.filter((x) => x !== d.id) : [...p.songIds, d.id];
    await savePl(p);
    el.classList.toggle('sel', !has);
    toast(t(has ? 'pl.removedFrom' : 'pl.added', { name: plName(p) }));
    afterPlChange();
  },
  plRemove: async (d) => {
    const p = S.pls.find((x) => x.id === d.pl); if (!p) return;
    p.songIds = p.songIds.filter((x) => x !== d.id); await savePl(p);
    closeLayer(() => afterPlChange());
  },
  plMenu: (d) => {
    const p = S.pls.find((x) => x.id === d.id);
    showSheet('<h3>' + esc(plName(p)) + '</h3>' + (p.builtin ? '' : '<button class="mi" data-act="plRename" data-id="' + p.id + '">' + ic('edit') + '<span>' + t('pl.rename') + '</span></button>') +
      '<button class="mi" data-act="plCover" data-id="' + p.id + '">' + ic('image') + '<span>' + t('pl.changeCover') + '</span></button>' +
      (p.builtin ? '' : '<button class="mi danger" data-act="plDel" data-id="' + p.id + '">' + ic('trash') + '<span>' + t('pl.deletePl') + '</span></button>'));
  },
  plRename: (d) => {
    const p = S.pls.find((x) => x.id === d.id);
    showSheet('<h3>' + t('pl.rename') + '</h3><input class="inp" id="plName" value="' + esc(p.name) + '"><div class="row-btns"><button class="btn-sec" data-act="cancel">' + t('common.cancel') + '</button>' +
      '<button class="btn-main" style="height:48px" data-act="plRenameOk" data-id="' + p.id + '">' + t('common.save') + '</button></div>');
  },
  plRenameOk: async (d) => {
    const p = S.pls.find((x) => x.id === d.id), name = $('#plName').value.trim(); if (!name) return;
    p.name = name; await savePl(p); closeLayer(() => renderView(true));
  },
  plCover: async (d) => {
    const p = S.pls.find((x) => x.id === d.id);
    const pr = pickFiles('image/*', false);
    closeLayer();
    const [f] = await pr; if (!f) return;
    const b = await resizeCover(f); if (!b) return;
    p.cover = b; dropCover(p.id); await savePl(p); renderView(true);
  },
  plDel: (d) => confirmSheet(t('pl.confirmDel'), 'plDelOk', 'data-id="' + d.id + '"', true),
  plDelOk: async (d) => {
    await DB.del('playlists', d.id);
    S.pls = S.pls.filter((p) => p.id !== d.id); dropCover(d.id);
    closeLayer(() => history.back());
  },
  plAddSongs: (d) => {
    const p = S.pls.find((x) => x.id === d.id);
    S.sel = { id: p.id, set: new Set(p.songIds) };
    showSheet('<h3>' + t('pl.addSongs') + '</h3>' + sortedSongs().map((s) => '<button class="mi' + (S.sel.set.has(s.id) ? ' sel' : '') + '" data-act="selTog" data-id="' + s.id + '">' + ic('music') +
      '<span style="min-width:0"><div class="nm">' + esc(s.title) + '</div><small>' + esc(artistOf(s)) + '</small></span><span class="chk">' + ic('check') + '</span></button>').join('') +
      '<div class="row-btns" style="margin-top:10px"><button class="btn-sec" data-act="cancel">' + t('common.cancel') + '</button><button class="btn-main" style="height:48px" data-act="selSave">' + t('common.save') + '</button></div>');
  },
  selTog: (d, el) => { const st = S.sel.set; if (st.has(d.id)) st.delete(d.id); else st.add(d.id); el.classList.toggle('sel', st.has(d.id)); },
  selSave: async () => {
    const p = S.pls.find((x) => x.id === S.sel.id);
    const keep = p.songIds.filter((id) => S.sel.set.has(id));
    S.sel.set.forEach((id) => { if (!keep.includes(id)) keep.push(id); });
    p.songIds = keep; await savePl(p);
    closeLayer(() => renderView(true));
  },
  ambient: () => showSheet('<h3>' + t('amb.title') + '</h3><div class="sub" style="margin-bottom:6px">' + t('amb.hint') + '</div>' + ambientRows() +
    '<div class="row-btns" style="margin-top:10px"><button class="btn-sec" data-act="ambStop">' + t('amb.stop') + '</button><button class="btn-main" style="height:48px" data-act="cancel">' + t('common.ok') + '</button></div>'),
  ambStop: () => {
    AMB.stopAll();
    if (S.layers.includes('sheet')) ACT.ambient();
    if (S.playerOpen) renderPlayer();
    if (S.route.name === 'library') renderView(true);
  },
  volMute: () => {
    if (S.set.vol > 0) { S.volPrev = S.set.vol; S.set.vol = 0; } else S.set.vol = S.volPrev || 0.8;
    Engine.setVolume(S.set.vol); saveSet(); renderPlayer();
  },
  /* settings */
  lang: (d) => { S.set.lang = d.v; saveSet(); applyLang(); render(); if (S.playerOpen) renderPlayer(); updateMedia(); },
  quality: (d) => { S.set.quality = d.v; saveSet(); renderView(true); },
  persist: async () => { try { await navigator.storage.persist(); } catch (e) { /* ignore */ } updateStorage(); },
  goManage: () => go({ name: 'manage' }),
  goAbout: () => go({ name: 'about' }),
  privacy: () => showSheet('<h3>' + t('priv.title') + '</h3><p class="txt">' + esc(t('priv.body')) + '</p><button class="btn-main" style="height:48px" data-act="cancel">' + t('common.ok') + '</button>'),
  help: () => showSheet('<h3>' + t('help.title') + '</h3><p class="txt">' + esc(t('help.body')) + '</p><button class="btn-main" style="height:48px" data-act="cancel">' + t('common.ok') + '</button>'),
  clearCache: () => confirmSheet(t('set.cacheConfirm'), 'clearOk', '', false, 'common.ok'),
  clearOk: async () => {
    try {
      const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k)));
      const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((r) => r.unregister()));
    } catch (e) { /* ignore */ }
    location.reload();
  },
});

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  if (e.target.id === 'ov') { closeLayer(); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (fn) fn(el.dataset, el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target, b = el.dataset && el.dataset.bind;
  if (el.id === 'srchIn') { searchResults(el.value); return; }
  if (!b) return;
  if (b === 'spd') { S.cur.speed = el.value / 100; Engine.set(S.cur.speed, S.cur.reverb); syncFxUI(); }
  else if (b === 'vol') {
    S.set.vol = el.value / 100; Engine.setVolume(S.set.vol); saveSet(); el.style.setProperty('--p', el.value + '%');
    const o = $('#volOut'); if (o) o.textContent = num(el.value) + '٪';
  }
  else if (b === 'amb') {
    AMB.set(el.dataset.id, el.value / 100); el.style.setProperty('--p', el.value + '%');
    el.closest('.amb').classList.toggle('on', el.value > 0);
  }
  else if (b === 'rev') { S.cur.reverb = +el.value; Engine.set(S.cur.speed, S.cur.reverb); syncFxUI(); }
  else if (b === 'seek') {
    S.seeking = true;
    const a = Engine.audio, d = isFinite(a.duration) ? a.duration : 0, c = (el.value / 1000) * d;
    el.style.setProperty('--p', el.value / 10 + '%');
    $('#tCur').textContent = fmtTime(c); $('#tRem').textContent = '-' + fmtTime(Math.max(0, d - c));
  }
});
document.addEventListener('change', (e) => {
  const el = e.target, b = el.dataset && el.dataset.bind;
  if (b === 'seek') { const a = Engine.audio; seekTo((el.value / 1000) * (isFinite(a.duration) ? a.duration : 0)); S.seeking = false; }
  else if (b === 'expfx') {
    S.exp.fx = el.value;
    const sz = $('#expSize'); if (sz) sz.textContent = expSizeText();
  }
});

/* ---------- boot ---------- */
async function boot() {
  S.set = { ...S.set, ...lsGet('rl_set', {}) };
  S.recents = lsGet('rl_recent', []);
  Engine.vol = typeof S.set.vol === 'number' ? S.set.vol : 1;
  const [fa, en, fx, pl, ab] = await Promise.all(['data/fa.json', 'data/en.json', 'data/effects.json', 'data/playlists-default.json', 'data/about.json'].map(loadJSON));
  S.dict = { fa, en };
  S.fxList = fx.effects; REVERB_SEC = fx.reverbSeconds || 2.6;
  S.defPl = pl; S.about = ab;
  applyLang();
  try { await loadAll(); } catch (e) { console.error(e); }
  S.recents = S.recents.filter((id) => S.byId.has(id));
  history.replaceState({ r: S.route, n: 0 }, '');
  render();
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0 && !window.__INLINE) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
