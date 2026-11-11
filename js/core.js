'use strict';
/* Core: state, i18n, icons, helpers, library data, playback */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const S = {
  dict: {}, lang: 'fa', fxList: [], defPl: [], about: {},
  set: { lang: 'fa', quality: 'good', view: 'grid', sort: 'new', vol: 1 },
  songs: [], byId: new Map(), pls: [], recents: [],
  route: { name: 'library' }, layers: [], afterPop: null, playerOpen: false,
  ctxIds: [], baseQ: [], queue: [], qi: -1, shuffle: false, repeat: 'off',
  curId: null, playing: false, cur: { fx: 'original', speed: 1, reverb: 0 },
  seeking: false, url: null, covers: new Map(), exp: null, sel: null,
};

function loadJSON(path) {
  if (window.__INLINE && window.__INLINE[path]) return Promise.resolve(window.__INLINE[path]);
  return fetch(path).then((r) => r.json());
}

function lsGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
function saveSet() { lsSet('rl_set', S.set); }
function saveRecents() { lsSet('rl_recent', S.recents); }

/* ---------- i18n ---------- */
const FA = '۰۱۲۳۴۵۶۷۸۹';
function num(x) {
  const s = String(x);
  return S.lang === 'fa' ? s.replace(/\d/g, (d) => FA[d]).replace(/\./g, '٫') : s;
}
function t(k, v) {
  let s = S.dict[S.lang] && S.dict[S.lang][k];
  if (s == null) s = S.dict.fa && S.dict.fa[k];
  if (s == null) s = k;
  if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]);
  return s;
}
function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return num(m + ':' + String(s).padStart(2, '0'));
}
function fmtSize(b) {
  if (b >= 1073741824) return num((b / 1073741824).toFixed(1)) + (S.lang === 'fa' ? ' گیگابایت' : ' GB');
  if (b >= 1048576) return num((b / 1048576).toFixed(1)) + (S.lang === 'fa' ? ' مگابایت' : ' MB');
  return num(Math.max(1, Math.round(b / 1024))) + (S.lang === 'fa' ? ' کیلوبایت' : ' KB');
}
function applyLang() {
  S.lang = S.set.lang;
  document.documentElement.lang = S.lang;
  document.documentElement.dir = S.lang === 'fa' ? 'rtl' : 'ltr';
  document.title = t('app.name');
}

/* ---------- icons ---------- */
const ICONS = {
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  upload: '<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  sort: '<line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>',
  next: '<polygon points="5 4 15 12 5 20 5 4" fill="currentColor"/><line x1="19" y1="5" x2="19" y2="19"/>',
  prev: '<polygon points="19 20 9 12 19 4 19 20" fill="currentColor"/><line x1="5" y1="19" x2="5" y2="5"/>',
  shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
  repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  repeat1: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><path d="M11 10l1.5-1v6"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  heartfill: '<path fill="currentColor" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  dots: '<circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  chevdown: '<polyline points="6 9 12 15 18 9"/>',
  chevup: '<polyline points="18 15 12 9 6 15"/>',
  arrow: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  wave: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  rewind: '<polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/>',
  ff: '<polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/>',
  drop: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  broom: '<path d="M3 21l6-6"/><path d="M14 4l6 6-5 5-6-6z"/><path d="M9 15l-2 2"/>',
  vol: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  volx: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
  rain: '<line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>',
  thunder: '<path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/>',
  wind: '<path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>',
  waves: '<path d="M2 6c2.5-3 5-3 7.5 0s5 3 7.5 0 3-2 5-2"/><path d="M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 3-2 5-2"/><path d="M2 18c2.5-3 5-3 7.5 0s5 3 7.5 0 3-2 5-2"/>',
  fire: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  tg: '<path fill="currentColor" stroke="none" d="M21.5 4.3 2.9 11.5c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8L22.9 5.6c.3-1.2-.5-1.8-1.4-1.3zM8.3 13.7l10.3-6.5c.5-.3.9-.1.5.2l-8.5 7.7-.3 3.6z"/>',
};
function ic(name, cls) {
  return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

/* ---------- covers ---------- */
const GRADS = [['#9B5CFF', '#3987FF'], ['#FF4FA3', '#9B5CFF'], ['#3987FF', '#35E6D0'], ['#FF4FA3', '#3987FF'], ['#A855F7', '#FF4FA3'], ['#2b3fd6', '#9B5CFF']];
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function gradFor(id) { const g = GRADS[hashStr(id) % GRADS.length]; return 'linear-gradient(135deg,' + g[0] + ',' + g[1] + ')'; }
function coverURL(o) {
  if (!o.cover) return null;
  let u = S.covers.get(o.id);
  if (!u) { u = URL.createObjectURL(o.cover); S.covers.set(o.id, u); }
  return u;
}
function dropCover(id) { const u = S.covers.get(id); if (u) { URL.revokeObjectURL(u); S.covers.delete(id); } }
function coverHTML(song) {
  const u = coverURL(song);
  return '<div class="cv" style="' + (u ? '' : 'background:' + gradFor(song.id)) + '">' +
    (u ? '<img loading="lazy" alt="" src="' + u + '">' : ic('music', 'note')) +
    '<span class="eq"><i></i><i></i><i></i></span></div>';
}
const artistOf = (s) => s.artist || t('song.unknown');

/* ---------- library data ---------- */
async function loadAll() {
  const [songs, pls] = await Promise.all([DB.all('songs'), DB.all('playlists')]);
  S.songs = songs;
  S.byId = new Map(songs.map((s) => [s.id, s]));
  S.pls = pls;
  for (const d of S.defPl) {
    if (!S.pls.find((p) => p.id === d.id)) {
      const p = { id: d.id, kind: d.kind, icon: d.icon, grad: d.grad, songIds: [], cover: null, builtin: true };
      S.pls.push(p);
      await DB.put('playlists', p);
    }
  }
}
const plName = (p) => (p.builtin ? t('pl.' + p.id) : p.name);
const plAuto = (p) => p.kind === 'favorites' || p.kind === 'recent';
function plSongs(p) {
  if (p.kind === 'favorites') return S.songs.filter((s) => s.fav).sort((a, b) => b.added - a.added);
  if (p.kind === 'recent') return S.recents.map((id) => S.byId.get(id)).filter(Boolean);
  return (p.songIds || []).map((id) => S.byId.get(id)).filter(Boolean);
}
function sortedSongs() {
  const a = S.songs.slice();
  if (S.set.sort === 'name') a.sort((x, y) => x.title.localeCompare(y.title, S.lang));
  else if (S.set.sort === 'plays') a.sort((x, y) => (y.plays || 0) - (x.plays || 0) || y.added - x.added);
  else a.sort((x, y) => y.added - x.added);
  return a;
}
function fxMatch(speed, reverb) {
  const e = S.fxList.find((f) => Math.abs(f.speed - speed) < 0.001 && f.reverb === reverb);
  return e ? e.id : 'custom';
}
async function removeSong(id) {
  await DB.del('songs', id);
  await DB.del('files', id);
  for (const p of S.pls) {
    if (p.songIds && p.songIds.includes(id)) { p.songIds = p.songIds.filter((x) => x !== id); await DB.put('playlists', p); }
  }
  S.songs = S.songs.filter((s) => s.id !== id);
  S.byId.delete(id);
  S.recents = S.recents.filter((x) => x !== id); saveRecents();
  dropCover(id);
  if (S.curId === id) stopPlayback();
}

/* ---------- playback ---------- */
function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function setQueue(ids, startId) { S.baseQ = ids.slice(); rebuildQueue(startId); }
function rebuildQueue(startId) {
  if (S.shuffle) {
    const rest = S.baseQ.filter((i) => i !== startId);
    shuffleArr(rest);
    S.queue = [startId, ...rest];
  } else S.queue = S.baseQ.slice();
  S.qi = S.queue.indexOf(startId);
}
function setPlaying(v) {
  S.playing = v;
  document.body.classList.toggle('playing', v);
  renderMini();
  if (S.playerOpen) renderPlayer();
}
function bindAudio() {
  const a = Engine.audio;
  if (a._bound) return;
  a._bound = true;
  a.addEventListener('play', () => setPlaying(true));
  a.addEventListener('pause', () => setPlaying(false));
  a.addEventListener('timeupdate', updateProgress);
  a.addEventListener('ended', () => {
    if (S.repeat === 'one') { a.currentTime = 0; a.play(); return; }
    if (nextIndex(true) < 0) { setPlaying(false); return; }
    playNext(true);
  });
  a.addEventListener('error', () => { if (S.curId) toast(t('err.play')); });
}
async function playSong(id, opts) {
  const song = S.byId.get(id);
  if (!song) return false;
  let rec = null;
  try { rec = await DB.get('files', id); } catch (e) { /* ignore */ }
  if (!rec) { toast(t('err.fileMissing')); return false; }
  let file;
  try {
    if (rec.blob) file = rec.blob;
    else {
      const h = rec.handle;
      let p = await h.queryPermission({ mode: 'read' });
      if (p !== 'granted') p = await h.requestPermission({ mode: 'read' });
      if (p !== 'granted') { toast(t('err.perm')); return false; }
      file = await h.getFile();
    }
  } catch (e) { toast(t('err.fileMissing')); return false; }
  Engine.init(); bindAudio(); Engine.resume();
  if (S.url) URL.revokeObjectURL(S.url);
  S.url = URL.createObjectURL(file);
  S.curId = id;
  S.cur = opts && opts.fx ? { ...opts.fx } : (song.fx ? { ...song.fx } : { fx: 'original', speed: 1, reverb: 0 });
  Engine.set(S.cur.speed, S.cur.reverb);
  Engine.audio.src = S.url;
  try { await Engine.audio.play(); }
  catch (e) { toast(t('err.play')); setPlaying(false); return false; }
  song.plays = (song.plays || 0) + 1;
  DB.put('songs', song).catch(() => {});
  S.recents = [id, ...S.recents.filter((x) => x !== id)].slice(0, 30); saveRecents();
  updateMedia(); renderMini(); markCurrent();
  if (S.playerOpen) renderPlayer();
  return true;
}
function nextIndex(auto) {
  const n = S.queue.length;
  if (!n) return -1;
  let i = S.qi + 1;
  if (i >= n) { if (S.repeat === 'all' || !auto) i = 0; else return -1; }
  return i;
}
function playNext(auto) { const i = nextIndex(auto); if (i < 0) return; S.qi = i; playSong(S.queue[i]); }
function playPrev() {
  const a = Engine.audio;
  if (!a || a.currentTime > 3 || S.qi <= 0) { if (a) a.currentTime = 0; return; }
  S.qi--; playSong(S.queue[S.qi]);
}
function togglePlay() {
  if (!S.curId) return;
  Engine.resume();
  const a = Engine.audio;
  if (a.paused) a.play().catch(() => {}); else a.pause();
}
function stopPlayback() {
  if (Engine.audio) { Engine.audio.pause(); Engine.audio.removeAttribute('src'); Engine.audio.load(); }
  if (S.url) { URL.revokeObjectURL(S.url); S.url = null; }
  S.curId = null; S.queue = []; S.baseQ = []; S.qi = -1;
  setPlaying(false);
  if (S.playerOpen) closeLayer();
  renderMini();
}
function seekTo(sec) { const a = Engine.audio; if (a && isFinite(a.duration)) a.currentTime = clamp(sec, 0, a.duration); }

function updateProgress() {
  const a = Engine.audio;
  if (!a || !S.curId) return;
  const d = isFinite(a.duration) ? a.duration : 0, c = a.currentTime || 0;
  const pct = d ? (c / d) * 100 : 0;
  const bar = $('#miniBar'); if (bar) bar.style.width = pct + '%';
  if (S.playerOpen && !S.seeking) {
    const sk = $('#seek'); if (sk) { sk.value = d ? Math.round((c / d) * 1000) : 0; sk.style.setProperty('--p', pct + '%'); }
    const tc = $('#tCur'); if (tc) tc.textContent = fmtTime(c);
    const tr = $('#tRem'); if (tr) tr.textContent = '-' + fmtTime(Math.max(0, d - c));
  }
  if ('mediaSession' in navigator && d && navigator.mediaSession.setPositionState) {
    try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(c, d), playbackRate: a.playbackRate || 1 }); } catch (e) { /* ignore */ }
  }
}
function updateMedia() {
  if (!('mediaSession' in navigator)) return;
  const s = S.byId.get(S.curId);
  if (!s) return;
  const art = coverURL(s) || new URL('icons/icon-512.png', location.href).href;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: artistOf(s), album: 'Reverbland', artwork: [{ src: art, sizes: '512x512' }] });
    const m = navigator.mediaSession;
    m.setActionHandler('play', () => togglePlay());
    m.setActionHandler('pause', () => togglePlay());
    m.setActionHandler('previoustrack', () => { S.qi > 0 ? (S.qi--, playSong(S.queue[S.qi])) : seekTo(0); });
    m.setActionHandler('nexttrack', () => playNext(false));
    m.setActionHandler('seekto', (d) => seekTo(d.seekTime));
  } catch (e) { /* ignore */ }
}
