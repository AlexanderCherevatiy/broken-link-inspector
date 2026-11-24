import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { readReport, readOutcomes, saveOutcome, updateReport, withReportLock, createReport, clearSavedReports } from '../browser/reports';
import { hasAccess, missingOrigins, redirectObserver, verifyNetworkAddress } from '../browser/network';
import { checkLink } from '../core/probe';
import { runQueue } from '../core/queue';
import { isLoopbackTarget, isProbeAllowed } from '../core/urls';
import { captureBookmarks } from '../browser/capture';
import { dataPermission, extension, isFirefox, type SitePermissions } from '../browser/api';
import { canRetry } from '../core/types';
import type { Outcome, Report } from '../core/types';

type PermissionError = 'permissionDenied' | 'permissionError';
type ScanMode = 'all' | 'unchecked' | 'initial' | 'selected';
type BookmarkError = 'bookmarksDenied' | 'bookmarksError';

export function useReport(allowLoopback: boolean, ready: boolean) {
  const [report, setReport] = useState<Report>();
  const [outcomes, setOutcomes] = useState(new Map<number, Outcome>());
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [otherTab, setOtherTab] = useState(false);
  const [origins, setOrigins] = useState<string[]>([]);
  const [permissionError, setPermissionError] = useState<PermissionError>();
  const [requesting, setRequesting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const [bookmarkError, setBookmarkError] = useState<BookmarkError>();
  const [needsConsent, setNeedsConsent] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [bookmarkMode] = useState(() => new URLSearchParams(location.search).has('bookmarks'));
  const channel = useRef<BroadcastChannel | null>(null);
  const [reportId] = useState(() => new URLSearchParams(location.search).get('id'));
  const run = useRef<AbortController | null>(null);
  const booted = useRef(false);
  const localAllowed = useRef(allowLoopback);
  const hasLocalWork = useRef(false);

  useLayoutEffect(() => {
    localAllowed.current = allowLoopback;
    if (!allowLoopback && hasLocalWork.current) run.current?.abort();
  }, [allowLoopback]);

  useEffect(() => {
    const sync = new BroadcastChannel('saved-reports');
    channel.current = sync;
    sync.onmessage = () => {
      run.current?.abort();
      location.replace(extension.runtime.getURL('report.html?cleared=1'));
    };
    return () => { channel.current = null; sync.close(); };
  }, []);

  const showSaved = useCallback(async (saved: Report, existing: Map<number, Outcome>) => {
    const recovered: Report = saved.phase === 'running' ? { ...saved, phase: 'interrupted' } : saved;
    if (recovered !== saved) await updateReport(recovered);
    setReport(recovered);
    setOutcomes(existing);
    setProgress(undefined);
  }, []);

  const start = useCallback(async (initial: Report, mode: ScanMode, selected?: ReadonlySet<number>) => {
    if (run.current) return;
    const controller = new AbortController();
    run.current = controller;
    setBusy(true);
    setOtherTab(false);
    setStorageError(false);

    try {
      const acquired = await withReportLock(initial.id, async (hasLock) => {
        if (!hasLock) return false;
        const saved = await readReport(initial.id);
        if (!saved) throw new Error('Report not found');
        const existing = await readOutcomes(saved.id);
        if (mode === 'initial' && saved.phase !== 'ready') {
          await showSaved(saved, existing);
          return true;
        }
        const targets = saved.links.map((link, index) => ({ ...link, index })).filter(({ index }) => {
          if (mode === 'selected') return selected?.has(index) && canRetry(existing.get(index));
          return mode !== 'unchecked' || !existing.has(index) || (existing.get(index)?.category === 'notChecked' && existing.get(index)?.reason !== 'unsafeUrl');
        });
        if (mode === 'selected' && !targets.length) return true;
        const scanning: Report = { ...saved, phase: 'running' };
        // Retry retains the prior result until a replacement is committed.
        const reset = mode === 'all' ? targets.map(({ index }) => index) : [];
        await updateReport(scanning, reset);
        for (const index of reset) existing.delete(index);
        setProgress({ done: 0, total: targets.length });
        setReport(scanning);
        setOutcomes(existing);

        try {
          const observe = await redirectObserver();
          const allowLocal = localAllowed.current;
          hasLocalWork.current = allowLocal && targets.some(({ url }) => isLoopbackTarget(url));
          await runQueue(targets, controller.signal, async ({ url, index, blocked }) => {
            const outcome = await checkLink({
              url, blocked, signal: controller.signal, allowed: (address) => hasAccess(address, saved.kind === 'bookmarks'),
              allowLoopback: allowLocal, observe, verifyAddress: isFirefox ? verifyNetworkAddress : undefined,
            });
            if (outcome.reason === 'stopped') return;
            await saveOutcome(saved.id, index, outcome);
            setOutcomes((old) => new Map(old).set(index, outcome));
            setProgress((old) => old && { ...old, done: old.done + 1 });
          });
          const completed: Report = { ...scanning, phase: controller.signal.aborted ? 'stopped' : 'finished' };
          await updateReport(completed);
          setReport(completed);
        } catch (error) {
          const interrupted: Report = { ...scanning, phase: 'interrupted' };
          setReport(interrupted);
          await updateReport(interrupted);
          throw error;
        }
        return true;
      });
      if (!acquired) {
        setOtherTab(true);
        setBusy(false);
        await withReportLock(initial.id, async () => {
          const saved = await readReport(initial.id);
          if (!saved) throw new Error('Report not found');
          await showSaved(saved, await readOutcomes(saved.id));
        }, true);
      }
    } catch {
      setStorageError(true);
    } finally {
      run.current = null;
      hasLocalWork.current = false;
      setBusy(false);
      setOtherTab(false);
    }
  }, [showSaved]);

  useEffect(() => {
    if (!ready || booted.current) return;
    booted.current = true;
    void (async () => {
      try {
        if (bookmarkMode) return;
        if (new URLSearchParams(location.search).has('cleared')) setCleared(true);
        const saved = await readReport(reportId);
        if (!saved) return;
        if (!reportId) history.replaceState(null, '', '?id=' + encodeURIComponent(saved.id));
        setOutcomes(await readOutcomes(saved.id));
        setReport(saved);
        void start(saved, 'initial');
      } catch {
        setStorageError(true);
      } finally {
        setLoaded(true);
      }
    })();
  }, [ready, reportId, start, bookmarkMode]);

  const links = report?.links;
  const bookmarkReport = report?.kind === 'bookmarks';
  useEffect(() => {
    if (!links) return;
    let current = true;
    const refresh = () => {
      const urls = links.filter(({ url, blocked }) => !blocked && isProbeAllowed(url, allowLoopback))
        .map(({ url }) => url);
      void Promise.all([
        missingOrigins(urls, allowLoopback),
        isFirefox && urls.length ? extension.permissions.contains(dataPermission(bookmarkReport)) : true,
      ]).then(([result, consent]) => {
        if (!current) return;
        setOrigins(result);
        setNeedsConsent(!consent);
      }).catch(() => {
        if (current) setPermissionError('permissionError');
      });
    };
    const revoked = (removed: SitePermissions) => {
      if (removed.origins?.length ||
          removed.data_collection?.some((scope) => dataPermission(bookmarkReport).data_collection?.includes(scope))) {
        run.current?.abort();
      }
      refresh();
    };
    refresh();
    extension.permissions.onAdded.addListener(refresh);
    extension.permissions.onRemoved.addListener(revoked);
    return () => {
      current = false;
      extension.permissions.onAdded.removeListener(refresh);
      extension.permissions.onRemoved.removeListener(revoked);
    };
  }, [links, allowLoopback, bookmarkReport]);

  function grantAccess() {
    if (!report || busy || requesting) return;
    const requested = origins.filter((origin) => localAllowed.current || !isLoopbackTarget(origin));
    if (!requested.length && !needsConsent) return;
    setPermissionError(undefined);
    setRequesting(true);
    // The API must be called synchronously from the button's user gesture.
    void extension.permissions.request({
      ...(requested.length ? { origins: requested } : {}),
      ...(needsConsent ? dataPermission(bookmarkReport) : {}),
    }).then((granted) => {
      if (!granted) {
        setPermissionError('permissionDenied');
        return;
      }
      return start(report, 'unchecked');
    }).catch(() => setPermissionError('permissionError')).finally(() => setRequesting(false));
  }

  function scanBookmarks() {
    if (requesting || busy) return;
    setBookmarkError(undefined);
    setRequesting(true);
    // Optional read access is separate from permission to send an HTTP request.
    void extension.permissions.request({ permissions: ['bookmarks'] }).then(async (granted) => {
      if (!granted) { setBookmarkError('bookmarksDenied'); return; }
      const captured = await captureBookmarks();
      await createReport(captured);
      history.replaceState(null, '', '?id=' + encodeURIComponent(captured.id));
      setReport(captured);
      await start(captured, 'initial');
    }).catch(() => setBookmarkError('bookmarksError')).finally(() => setRequesting(false));
  }

  async function clear() {
    if (busy || requesting) return;
    try {
      await clearSavedReports();
      channel.current?.postMessage('cleared');
      location.replace(extension.runtime.getURL('report.html?cleared=1'));
    } catch {
      setStorageError(true);
    }
  }

  return {
    report, outcomes, loaded, busy, storageError, otherTab, origins, permissionError, requesting, progress,
    reportId, grantAccess, bookmarkMode, scanBookmarks, bookmarkError, needsConsent, clear, cleared,
    retry: (indices: ReadonlySet<number>) => { if (report && !requesting) void start(report, 'selected', indices); },
    scan: () => { if (report && !requesting) void start(report, 'all'); },
    stop: () => run.current?.abort(),
  };
}
