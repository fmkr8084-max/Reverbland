'use strict';
/* IndexedDB wrapper: songs (metadata), files (audio blob or folder handle), playlists */
const DB_NAME = 'reverbland';
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('songs', { keyPath: 'id' });
      d.createObjectStore('files', { keyPath: 'id' });
      d.createObjectStore('playlists', { keyPath: 'id' });
    };
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const o = t.objectStore(store);
    let out;
    const rq = fn(o);
    if (rq) rq.onsuccess = () => { out = rq.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('aborted'));
  });
}

const DB = {
  all: (s) => tx(s, 'readonly', (o) => o.getAll()),
  get: (s, k) => tx(s, 'readonly', (o) => o.get(k)),
  put: (s, v) => tx(s, 'readwrite', (o) => o.put(v)),
  del: (s, k) => tx(s, 'readwrite', (o) => o.delete(k)),
  clear: (s) => tx(s, 'readwrite', (o) => o.clear()),
};
