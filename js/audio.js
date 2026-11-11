'use strict';
/* Audio engine (live playback) and offline export (WAV / MP3) */
let REVERB_SEC = 2.6;
const LAME_URL = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';

function makeImpulse(ctx, sec, rate) {
  const sr = rate || ctx.sampleRate;
  const len = Math.floor(sr * sec);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += ((Math.random() * 2 - 1) - lp) * 0.35;
      d[i] = lp * Math.pow(1 - i / len, 2.6);
    }
  }
  return buf;
}

const Engine = {
  audio: null, ctx: null, dry: null, wet: null, master: null, ready: false, speed: 1, reverb: 0, vol: 1,
  init() {
    if (this.ready) return;
    const a = this.audio = new Audio();
    a.preload = 'auto';
    a.preservesPitch = false; a.mozPreservesPitch = false; a.webkitPreservesPitch = false;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC();
    const src = ctx.createMediaElementSource(a);
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, REVERB_SEC);
    this.master = ctx.createGain();
    this.master.gain.value = this.vol * this.vol;
    src.connect(this.dry); this.dry.connect(this.master);
    src.connect(conv); conv.connect(this.wet); this.wet.connect(this.master);
    this.master.connect(ctx.destination);
    a.addEventListener('loadedmetadata', () => { a.playbackRate = this.speed; });
    this.ready = true;
    this.apply();
  },
  setVolume(v) { this.vol = v; if (this.ready) this.master.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.03); },
  set(speed, reverb) { this.speed = speed; this.reverb = reverb; if (this.ready) this.apply(); },
  apply() {
    const a = this.audio, r = this.reverb / 100, now = this.ctx.currentTime;
    a.defaultPlaybackRate = this.speed;
    a.playbackRate = this.speed;
    this.dry.gain.setTargetAtTime(1 - r * 0.35, now, 0.03);
    this.wet.gain.setTargetAtTime(r * 0.9, now, 0.03);
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
};

/* ---------- export ---------- */
function decodeArrayBuffer(ctx, arr) {
  return new Promise((res, rej) => {
    const p = ctx.decodeAudioData(arr, res, rej);
    if (p && p.then) p.then(res, rej);
  });
}

async function renderEffect(file, speed, reverb, amb) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const rate = 44100;
  const tmp = new OAC(2, rate, rate);
  const buf = await decodeArrayBuffer(tmp, await file.arrayBuffer());
  const tail = reverb > 0 ? REVERB_SEC : 0;
  const outLen = Math.ceil((buf.duration / speed + tail) * rate);
  const oc = new OAC(2, outLen, rate);
  const s = oc.createBufferSource();
  s.buffer = buf;
  s.playbackRate.value = speed;
  const r = reverb / 100;
  const dry = oc.createGain();
  dry.gain.value = 1 - r * 0.35;
  s.connect(dry); dry.connect(oc.destination);
  if (reverb > 0) {
    const conv = oc.createConvolver();
    conv.buffer = makeImpulse(oc, REVERB_SEC, rate);
    const wet = oc.createGain();
    wet.gain.value = r * 0.9;
    s.connect(conv); conv.connect(wet); wet.connect(oc.destination);
  }
  if (amb && typeof AMB !== 'undefined') {
    const outSec = outLen / rate, fade = oc.createGain();
    fade.gain.setValueAtTime(1, Math.max(0, outSec - 1.5));
    fade.gain.linearRampToValueAtTime(0, outSec);
    fade.connect(oc.destination);
    for (const id of Object.keys(amb)) {
      if (!(amb[id] > 0)) continue;
      const g = oc.createGain(); g.gain.value = amb[id] * amb[id]; g.connect(fade);
      await AMB.renderOffline(oc, g, id, outSec);
    }
  }
  s.start(0);
  return oc.startRendering();
}

function peakGain(buf) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i += 1) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
  }
  return peak > 0.98 ? 0.98 / peak : 1;
}

function encodeWav(buf, gain) {
  const len = buf.length, rate = buf.sampleRate;
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const dv = new DataView(new ArrayBuffer(44 + len * 4));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + len * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, len * 4, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    let l = Math.max(-1, Math.min(1, L[i] * gain)), r = Math.max(-1, Math.min(1, R[i] * gain));
    dv.setInt16(o, l < 0 ? l * 0x8000 : l * 0x7FFF, true);
    dv.setInt16(o + 2, r < 0 ? r * 0x8000 : r * 0x7FFF, true);
    o += 4;
  }
  return new Blob([dv], { type: 'audio/wav' });
}

function loadLame() {
  if (window.lamejs) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = LAME_URL;
    s.onload = () => (window.lamejs ? res() : rej(new Error('lame')));
    s.onerror = () => rej(new Error('lame'));
    document.head.appendChild(s);
  });
}

async function encodeMp3(buf, kbps, gain, onProgress) {
  const enc = new lamejs.Mp3Encoder(2, buf.sampleRate, kbps);
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const total = buf.length, chunk = 1152, parts = [];
  const li = new Int16Array(chunk), ri = new Int16Array(chunk);
  for (let i = 0, n = 0; i < total; i += chunk, n++) {
    const end = Math.min(chunk, total - i);
    for (let j = 0; j < end; j++) {
      const l = Math.max(-1, Math.min(1, L[i + j] * gain)), r = Math.max(-1, Math.min(1, R[i + j] * gain));
      li[j] = l < 0 ? l * 0x8000 : l * 0x7FFF;
      ri[j] = r < 0 ? r * 0x8000 : r * 0x7FFF;
    }
    const out = enc.encodeBuffer(end === chunk ? li : li.subarray(0, end), end === chunk ? ri : ri.subarray(0, end));
    if (out.length) parts.push(new Uint8Array(out));
    if (n % 60 === 0) { onProgress(i / total); await new Promise((r) => setTimeout(r, 0)); }
  }
  const last = enc.flush();
  if (last.length) parts.push(new Uint8Array(last));
  return new Blob(parts, { type: 'audio/mpeg' });
}
