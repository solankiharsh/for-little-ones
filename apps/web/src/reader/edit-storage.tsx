import type { PreviewArtworkByPage } from './PageSpread';
/** Accepted image versions stay private on this device until private cloud assets are available. */
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('flo-illustration-edits-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('books');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readEdits(key: string): Promise<PreviewArtworkByPage> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('books').objectStore('books').get(key);
    request.onsuccess = () => { db.close(); resolve(request.result ?? {}); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
export async function writeEdits(key: string, edits: PreviewArtworkByPage): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('books', 'readwrite');
    transaction.objectStore('books').put(edits, key);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}
