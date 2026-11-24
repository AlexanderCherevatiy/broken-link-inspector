import { prepareTarget, sourceAddress } from '../core/privacy';
import type { Outcome, Report } from '../core/types';

const REPORTS = 'reports';
const RESULTS = 'results';
const MAX_REPORTS = 8;
interface StoredResult { reportId: string; index: number; outcome: Outcome }

let dbPromise: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('broken-link-inspector', 2);
    open.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) {
        open.result.createObjectStore(REPORTS, { keyPath: 'id' }).createIndex('date', 'createdAt');
        open.result.createObjectStore(RESULTS, { keyPath: ['reportId', 'index'] });
      } else if (event.oldVersion === 1 && open.transaction) {
        migrateReports(open.transaction);
      }
    };
    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = undefined;
      };
      resolve(db);
    };
    open.onerror = () => reject(open.error);
  }).catch((error: unknown) => {
    dbPromise = undefined;
    throw error;
  });
  return dbPromise;
}

function migrateReports(tx: IDBTransaction) {
  const blocked = new Map<string, Set<number>>();
  const reports = tx.objectStore(REPORTS).openCursor();
  reports.onsuccess = () => {
    const cursor = reports.result;
    if (cursor) {
      const saved = cursor.value as Report;
      const indices = new Set<number>();
      const links = saved.links.map((link, index) => {
        const target = prepareTarget(link.url, link.url);
        if (target && !target.blocked) return { ...link, ...target };
        indices.add(index);
        return { url: target?.url ?? '', label: '', blocked: true };
      });
      blocked.set(saved.id, indices);
      cursor.update({ ...saved, sourceUrl: sourceAddress(saved.sourceUrl), links,
        title: saved.sourceUrl.includes('?') || prepareTarget(saved.sourceUrl, saved.sourceUrl)?.blocked ? '' : saved.title });
      cursor.continue();
      return;
    }
    const outcomes = tx.objectStore(RESULTS).openCursor();
    outcomes.onsuccess = () => {
      const entry = outcomes.result;
      if (!entry) return;
      const item = entry.value as StoredResult;
      if (blocked.get(item.reportId)?.has(item.index)) {
        entry.update({ ...item, outcome: { category: 'notChecked', reason: 'unsafeUrl' } });
      } else if (item.outcome.redirectUrl) {
        const redirect = prepareTarget(item.outcome.redirectUrl, item.outcome.redirectUrl);
        entry.update({ ...item, outcome: { ...item.outcome,
          redirectUrl: redirect && !redirect.blocked ? redirect.url : undefined } });
      }
      entry.continue();
    };
  };
}

function value<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Report transaction aborted'));
  });
}

function resultKeys(id: string): IDBKeyRange {
  return IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
}

export async function createReport(report: Report): Promise<void> {
  const locks = await navigator.locks.query();
  const active = new Set(locks.held?.map(({ name }) => name));
  const tx = (await database()).transaction([REPORTS, RESULTS], 'readwrite');
  const completion = done(tx);
  const store = tx.objectStore(REPORTS);
  store.add(report);
  let remaining = MAX_REPORTS;
  const request = store.index('date').openCursor(null, 'prev');
  request.onsuccess = () => {
    const entry = request.result;
    if (!entry) return;
    const prior = entry.value as Report;
    // An open scan may still be writing its outcomes.
    if (remaining-- <= 0 && !active.has(reportLockName(prior.id)) && prior.id !== report.id) {
      entry.delete();
      tx.objectStore(RESULTS).delete(resultKeys(prior.id));
    }
    entry.continue();
  };
  await completion;
}

export async function readReport(id: string | null): Promise<Report | undefined> {
  const store = (await database()).transaction(REPORTS).objectStore(REPORTS);
  if (id) return value<Report | undefined>(store.get(id));
  const cursor = await value(store.index('date').openCursor(null, 'prev'));
  return cursor?.value as Report | undefined;
}

export async function readOutcomes(id: string): Promise<Map<number, Outcome>> {
  const store = (await database()).transaction(RESULTS).objectStore(RESULTS);
  const records = await value<StoredResult[]>(store.getAll(resultKeys(id)));
  return new Map(records.map(({ index, outcome }) => [index, outcome]));
}

export async function updateReport(report: Report, resetIndices: readonly number[] = []): Promise<void> {
  const tx = (await database()).transaction([REPORTS, RESULTS], 'readwrite');
  const completion = done(tx);
  const store = tx.objectStore(REPORTS);
  const existing = store.getKey(report.id);
  existing.onsuccess = () => {
    if (existing.result === undefined) {
      tx.abort();
      return;
    }
    store.put(report);
    const results = tx.objectStore(RESULTS);
    for (const index of resetIndices) results.delete([report.id, index]);
  };
  await completion;
}

export async function saveOutcome(reportId: string, index: number, outcome: Outcome): Promise<void> {
  const tx = (await database()).transaction([REPORTS, RESULTS], 'readwrite');
  const completion = done(tx);
  const parent = tx.objectStore(REPORTS).getKey(reportId);
  parent.onsuccess = () => {
    if (parent.result === undefined) tx.abort();
    else tx.objectStore(RESULTS).put({ reportId, index, outcome } satisfies StoredResult);
  };
  await completion;
}

export async function clearSavedReports(): Promise<void> {
  const tx = (await database()).transaction([REPORTS, RESULTS], 'readwrite');
  const completion = done(tx);
  tx.objectStore(REPORTS).clear();
  tx.objectStore(RESULTS).clear();
  await completion;
}

function reportLockName(id: string): string {
  return 'report:' + id;
}

export function withReportLock<T>(
  id: string,
  callback: (acquired: boolean) => Promise<T>,
  wait = false,
) {
  return navigator.locks.request(reportLockName(id), { ifAvailable: !wait }, (lock) => callback(!!lock));
}
