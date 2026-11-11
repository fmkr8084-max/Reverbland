'use strict';
/* Song metadata helpers: ID3 tags, duration, cover resize, file name parsing */

function decodeText(d) {
  if (!d.length) return '';
  const enc = d[0];
  const b = d.subarray(1);
  let s = '';
  try {
    if (enc === 1) {
      let le = true, i = 0;
      if (b[0] === 0xFE && b[1] === 0xFF) { le = false; i = 2; }
      else if (b[0] === 0xFF && b[1] === 0xFE) { i = 2; }
      s = new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(b.subarray(i));
    } else if (enc === 2) {
      s = new TextDecoder('utf-16be').decode(b);
    } else if (enc === 3) {
      s = new TextDecoder('utf-8').decode(b);
    } else {
      try { s = new TextDecoder('utf-8', { fatal: true }).decode(b); }
      catch (e) {
        let ascii = true;
        for (let i = 0; i < b.length; i++) if (b[i] > 127) { ascii = false; break; }
        s = new TextDecoder(ascii ? 'utf-8' : 'windows-1256').decode(b);
      }
    }
  } catch (e) { s = ''; }
  return s.replace(/\0+$/g, '').replace(/\0/g, ' ').trim();
}

function parseAPIC(d) {
  const enc = d[0];
  let i = 1;
  while (i < d.length && d[i] !== 0) i++;
  i += 2; // mime terminator + picture type
  if (enc === 1 || enc === 2) {
    while (i + 1 < d.length && !(d[i] === 0 && d[i + 1] === 0)) i += 2;
    i += 2;
  } else {
    while (i < d.length && d[i] !== 0) i++;
    i += 1;
  }
  const img = d.subarray(i);
  if (img.length < 100) return null;
  const type = img[0] === 0x89 ? 'image/png' : 'image/jpeg';
  return new Blob([img], { type });
}

async function parseID3(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (String.fromCharCode(head[0], head[1], head[2]) !== 'ID3') return {};
    const ver = head[3];
    if (ver < 3) return {};
    const size = ((head[6] & 127) << 21) | ((head[7] & 127) << 14) | ((head[8] & 127) << 7) | (head[9] & 127);
    const buf = new Uint8Array(await file.slice(10, 10 + Math.min(size, 6 * 1024 * 1024)).arrayBuffer());
    const out = {};
    let p = 0;
    if (head[5] & 0x40) {
      p = ver === 4
        ? (((buf[0] & 127) << 21) | ((buf[1] & 127) << 14) | ((buf[2] & 127) << 7) | (buf[3] & 127))
        : ((((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0) + 4);
    }
    while (p + 10 <= buf.length) {
      const id = String.fromCharCode(buf[p], buf[p + 1], buf[p + 2], buf[p + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fs = ver === 4
        ? (((buf[p + 4] & 127) << 21) | ((buf[p + 5] & 127) << 14) | ((buf[p + 6] & 127) << 7) | (buf[p + 7] & 127))
        : (((buf[p + 4] << 24) | (buf[p + 5] << 16) | (buf[p + 6] << 8) | buf[p + 7]) >>> 0);
      p += 10;
      if (fs <= 0 || p + fs > buf.length) break;
      const d = buf.subarray(p, p + fs);
      p += fs;
      if (id === 'TIT2') out.title = decodeText(d);
      else if (id === 'TPE1') out.artist = decodeText(d);
      else if (id === 'APIC' && !out.cover) out.cover = parseAPIC(d);
    }
    return out;
  } catch (e) { return {}; }
}

function getDuration(file) {
  return new Promise((res) => {
    const a = new Audio();
    a.preload = 'metadata';
    const u = URL.createObjectURL(file);
    let done = false;
    const fin = (v) => { if (done) return; done = true; URL.revokeObjectURL(u); a.removeAttribute('src'); res(v); };
    a.onloadedmetadata = () => fin(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => fin(0);
    setTimeout(() => fin(0), 8000);
    a.src = u;
  });
}

async function resizeCover(blob, max = 512) {
  try {
    const bmp = await createImageBitmap(blob);
    const side = Math.min(bmp.width, bmp.height);
    const out = Math.min(max, side);
    const c = document.createElement('canvas');
    c.width = c.height = out;
    c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, out, out);
    if (bmp.close) bmp.close();
    return await new Promise((r) => c.toBlob((b) => r(b), 'image/jpeg', 0.84));
  } catch (e) { return null; }
}

function nameParts(fn) {
  let n = fn.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const m = n.split(/\s+-\s+/);
  if (m.length >= 2) return { artist: m[0].trim(), title: m.slice(1).join(' - ').trim() };
  return { artist: '', title: n || fn };
}
