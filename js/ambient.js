'use strict';
/* Ambient sounds: the user's own recordings (rain, fire), looped seamlessly */
const AMB = (() => {
  const FILES = { rain: 'audio/rain.mp3', fire: 'audio/fire.mp3' };
  const running = {}, vols = {}, loaded = {};
  let bus = null, ambAudio = null, fallback = false, stopTimer = null;

  const ctx = () => { Engine.init(); return Engine.ctx; };

  function b64ToBuf(s) {
    const bin = atob(s.split(',')[1]), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  /* crossfade the end into the start so the loop has no seam, and level it to a steady volume */
  function loopify(c, buf) {
    const sr = buf.sampleRate, L = buf.length, X = Math.min(Math.floor(sr * 2), Math.floor(L * 0.1)), N = L - X;
    const out = c.createBuffer(buf.numberOfChannels, N, sr);
    let sum = 0, cnt = 0, peak = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const a = buf.getChannelData(ch), o = out.getChannelData(ch);
      for (let i = 0; i < N; i++) {
        let v = a[i];
        if (i < X) { const k = (i / X) * Math.PI / 2; v = a[i] * Math.sin(k) + a[N + i] * Math.cos(k); }
        o[i] = v; sum += v * v; cnt++;
        const m = v < 0 ? -v : v; if (m > peak) peak = m;
      }
    }
    const rms = Math.sqrt(sum / cnt) || 0.1, g = Math.min(0.13 / rms, 3 / (peak || 1));
    for (let ch = 0; ch < out.numberOfChannels; ch++) { const o = out.getChannelData(ch); for (let i = 0; i < N; i++) o[i] = Math.tanh(o[i] * g); }
    return out;
  }
  function load(id) {
    if (!loaded[id]) {
      const c = ctx();
      const raw = window.__AUDIO && window.__AUDIO[id] ? Promise.resolve(b64ToBuf(window.__AUDIO[id])) : fetch(FILES[id]).then((r) => { if (!r.ok) throw new Error('fetch'); return r.arrayBuffer(); });
      loaded[id] = raw.then((ab) => decodeArrayBuffer(c, ab)).then((buf) => loopify(c, buf)).catch((e) => { loaded[id] = null; throw e; });
    }
    return loaded[id];
  }

  function ensureBus() {
    if (bus) return;
    const c = ctx();
    bus = c.createGain(); bus.gain.value = 1;
    try {
      const dest = c.createMediaStreamDestination();
      bus.connect(dest);
      ambAudio = new Audio(); ambAudio.srcObject = dest.stream;
    } catch (e) { bus.connect(c.destination); fallback = true; }
  }
  function startAudio() {
    clearTimeout(stopTimer);
    if (ambAudio && ambAudio.paused) {
      const p = ambAudio.play();
      if (p && p.catch) p.catch(() => { if (!fallback) { bus.connect(Engine.ctx.destination); fallback = true; } });
    }
    if ('mediaSession' in navigator && !S.curId) {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: t('amb.title'), artist: 'Reverbland', artwork: [{ src: new URL('icons/icon-512.png', location.href).href, sizes: '512x512' }] }); } catch (e) { /* ignore */ }
    }
  }
  function set(id, v) {
    const c = ctx();
    Engine.resume(); ensureBus();
    vols[id] = v;
    let r = running[id];
    if (v > 0) {
      if (!r) {
        const vg = c.createGain(); vg.gain.value = 0; vg.connect(bus);
        r = running[id] = { vg, src: null };
        startAudio();
        load(id).then((buf) => {
          if (running[id] !== r) return;
          const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(vg);
          s.start(0, Math.random() * buf.duration); r.src = s;
        }).catch(() => {
          if (running[id] === r) { delete running[id]; vols[id] = 0; vg.disconnect(); toast(t('amb.err')); if (S.playerOpen) renderPlayer(); }
        });
      }
      r.vg.gain.setTargetAtTime(v * v, c.currentTime, 0.06);
    } else if (r) {
      r.vg.gain.setTargetAtTime(0, c.currentTime, 0.08);
      delete running[id];
      setTimeout(() => { try { if (r.src) r.src.stop(); } catch (e) { /* ignore */ } r.vg.disconnect(); }, 700);
    }
    if (!Object.keys(running).length && ambAudio) {
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => { if (!Object.keys(running).length) ambAudio.pause(); }, 900);
    }
  }
  function stopAll() { Object.keys(running).forEach((id) => set(id, 0)); Object.keys(vols).forEach((k) => { vols[k] = 0; }); }
  /* used by export: loop the recording for the whole length of the file */
  async function renderOffline(c, out, id, dur) {
    const buf = await load(id);
    const s = c.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.start(0, Math.random() * buf.duration); s.stop(dur);
    s.connect(out);
  }
  return { set, stopAll, renderOffline, load, vols, ids: ['rain', 'fire'], active: () => Object.keys(running).length };
})();
