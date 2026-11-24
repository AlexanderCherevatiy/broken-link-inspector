import { useEffect, useRef } from 'react';
import {
  Activity, Bookmark, CircleAlert, CircleCheck, Download, Globe2, Link2, LoaderCircle,
  ScanLine, Settings2, Shield, Square, Trash2, X,
} from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { toCsv } from './core/csv';
import { categories, visibleOutcome } from './core/types';
import type { Category, Phase } from './core/types';
import type { MessageKey } from './core/i18n';
import { LanguageSelect, SettingsProvider, themes, useSettings } from './ui/settings';
import { Brand } from './ui/shared';
import { describeOutcome } from './ui/resultFormatting';
import { Results, statusIcons } from './ui/Results';
import { useReport } from './ui/useReport';
import './ui/styles.css';

const phaseKeys: Record<Phase, MessageKey> = {
  ready: 'phaseReady', running: 'phaseRunning', finished: 'phaseFinished',
  stopped: 'phaseStopped', interrupted: 'phaseInterrupted',
};

const phaseIcons = {
  ready: Activity, running: LoaderCircle, finished: CircleCheck, stopped: Square, interrupted: CircleAlert,
} satisfies Record<Phase, typeof Activity>;

function SettingsDialog({ clear, locked }: { clear: () => Promise<void>; locked: boolean }) {
  const { t, theme, allowLoopback, set, error } = useSettings();
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button className="button settings-button" onClick={() => dialog.current?.showModal()}>
      <Settings2 size={17} aria-hidden="true" /><span>{t('settings')}</span>
    </button>
    <dialog ref={dialog} aria-labelledby="settings-title" className="settings-dialog panel">
      <div className="dialog-header">
        <h2 id="settings-title">{t('settings')}</h2>
        <form method="dialog"><button className="button icon-button" aria-label={t('close')}>
          <X size={19} aria-hidden="true" /></button></form>
      </div>
      <fieldset className="theme-options">
        <legend>{t('theme')}</legend>
        <div>
          {themes.map((item) => <label key={item}>
            <input type="radio" name="theme" checked={theme === item} onChange={() => set('theme', item)} />
            <span>{t(item)}</span>
          </label>)}
        </div>
      </fieldset>
      <label className="loopback-setting">
        <input type="checkbox" checked={allowLoopback} onChange={(event) => set('allowLoopback', event.target.checked)}
          aria-describedby="local-description" />
        <span><strong>{t('allowLoopback')}</strong>
          <small id="local-description">{t('allowLoopbackDetail')}</small></span>
      </label>
      <button className="button clear-reports" type="button" disabled={locked} onClick={() => {
        if (window.confirm(t('clearReportsConfirm'))) void clear();
      }}>
        <Trash2 size={15} aria-hidden="true" />{t('clearReports')}
      </button>
      {error && <p className="alert" role="alert"><CircleAlert size={16} aria-hidden="true" />{t('settingsError')}</p>}
    </dialog>
  </>;
}

function ReportScreen() {
  const { t, locale, allowLoopback, ready } = useSettings();
  const scan = useReport(allowLoopback, ready);
  const { report, outcomes } = scan;
  const number = new Intl.NumberFormat(locale);

  useEffect(() => {
    document.title = t('reportDocumentTitle');
  }, [t]);

  function exportCsv() {
    if (!report) return;
    const source = report.kind === 'bookmarks' ? t('bookmarksTitle') : report.sourceUrl;
    const csv = toCsv(
      [t('urlColumn'), t('sourcePage'), t('httpColumn'), t('categoryColumn'), t('errorColumn'), t('redirectColumn')],
      report.links.map(({ url }, index) => {
        const outcome = visibleOutcome(outcomes.get(index), report.phase);
        return [url, source, outcome.status, t(outcome.category), describeOutcome(outcome, t), outcome.redirectUrl];
      }),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = objectUrl;
    const name = report.sourceUrl ? new URL(report.sourceUrl).hostname.replace(/[^a-z0-9.-]/gi, '-') : 'bookmarks';
    download.download = 'broken-link-inspector-' + name + '-' + new Date(report.createdAt).toISOString().slice(0, 10) + '.csv';
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  }

  const counts: Record<Category, number> = { working: 0, missing: 0, redirect: 0, uncertain: 0, notChecked: 0 };
  for (const outcome of outcomes.values()) counts[outcome.category]++;
  const length = report?.links.length ?? 0;
  counts.notChecked += Math.max(0, length - outcomes.size);
  const progress = scan.progress ?? { done: outcomes.size, total: length };
  const percent = progress.total ? Math.round(progress.done / progress.total * 100) : report?.phase === 'finished' ? 100 : 0;
  const PhaseIcon = phaseIcons[report?.phase ?? 'ready'];
  const runDisabled = scan.busy || scan.requesting || scan.otherTab || !length;

  return <>
    <header className="toolbar">
      <div className="toolbar-inner">
        <Brand />
        <div className="toolbar-actions"><LanguageSelect /><SettingsDialog clear={scan.clear} locked={scan.busy || scan.requesting || scan.otherTab} /></div>
      </div>
    </header>
    <main className="report-shell">
      <div className="page-heading">
        <h1>{t('reportTitle')}</h1>
        {report && <button className="button" onClick={exportCsv} disabled={!length}>
          <Download size={17} aria-hidden="true" />{t('export')}
        </button>}
      </div>
      {scan.storageError && <p className="notice alert" role="alert"><CircleAlert size={16} aria-hidden="true" />{t('storageError')}</p>}
      {scan.cleared && <p className="notice" role="status">{t('reportsCleared')}</p>}
      {!report && scan.bookmarkMode ? <section className="panel bookmark-start" aria-labelledby="bookmark-start-title">
        <div className="source-icon"><Bookmark size={23} aria-hidden="true" /></div>
        <div>
          <h2 id="bookmark-start-title">{t('bookmarksTitle')}</h2>
          <p className="muted">{t('networkDisclosure')}</p>
        </div>
        <button className="button primary" onClick={scan.scanBookmarks} disabled={!scan.loaded || scan.requesting}>
          {t(scan.requesting ? 'capturing' : 'scanBookmarks')}
        </button>
        {scan.bookmarkError && <p className="alert" role="alert"><CircleAlert size={16} aria-hidden="true" />{t(scan.bookmarkError)}</p>}
      </section> : !report ? <div className="panel empty initial-empty" role={scan.loaded ? undefined : 'status'}>
        {scan.loaded ? <ScanLine size={32} aria-hidden="true" />
          : <LoaderCircle className="spinner" size={32} aria-hidden="true" />}
        <h2>{t(!scan.loaded ? 'loading' : scan.reportId ? 'reportUnavailable' : 'noReportTitle')}</h2>
        {scan.loaded && <p>{t('noReportDetail')}</p>}
      </div> : <>
        <section className="panel source-panel" aria-label={t('sourcePage')}>
          <div className="source-icon"><Globe2 size={24} aria-hidden="true" /></div>
          <div className="source-text">
            <p className="meta-label">{t('sourceColumn')}</p>
            <h2 dir="auto">{report.kind === 'bookmarks' ? t('bookmarksTitle') : report.title || report.sourceUrl || t('noValue')}</h2>
            {report.sourceUrl && <a className="source-address" href={report.sourceUrl} target="_blank" rel="noopener noreferrer"
              dir="ltr" title={report.sourceUrl}>{report.sourceUrl}</a>}
          </div>
          <div className="scan-actions">
            <button className="button primary" onClick={scan.scan} disabled={runDisabled}>
              <ScanLine size={17} aria-hidden="true" />{t('scan')}
            </button>
            <button className="button" onClick={scan.stop} disabled={!scan.busy || report.phase !== 'running'}>
              <Square size={14} aria-hidden="true" />{t('stop')}
            </button>
          </div>
        </section>

        <p className="small muted network-disclosure">{t('networkDisclosure')}</p>

        <section className="summary" aria-label={t('statusOverview')}>
          <div className="panel metric total"><div><span className="metric-icon"><Link2 size={16} aria-hidden="true" /></span>{t('totalLinks')}</div>
            <strong>{number.format(length)}</strong></div>
          {categories.map((category) => {
            const Icon = statusIcons[category];
            return <div className={'panel metric ' + category} key={category}>
              <div><span className="metric-icon"><Icon size={16} aria-hidden="true" /></span>{t(category)}</div>
              <strong>{number.format(counts[category])}</strong>
            </div>;
          })}
        </section>

        <section className="panel scan-progress" data-phase={report.phase} aria-label={t('progress')}>
          <div className="progress-header">
            <div className="progress-status">
              <PhaseIcon className={report.phase === 'running' ? 'spinner' : undefined} size={18} aria-hidden="true" />
              <strong role="status">{t(phaseKeys[report.phase])}</strong>
            </div>
            <span className="muted small">{t('progressCount', number.format(progress.done), number.format(progress.total))}</span>
          </div>
          <div className="progress-line">
            <progress max={100} value={percent} aria-label={t('progress')} />
            <span>{t('progressPercent', number.format(percent))}</span>
          </div>
          {report.phase === 'interrupted' && <p className="small muted">{t('interruptedHint')}</p>}
          {scan.otherTab && <p className="small muted">{t('phaseDuplicate')}</p>}
        </section>
        {(report.captureLimited || report.total > length) && <aside className="notice small" role="status">
          {report.captureLimited && <p>{t('captureLimited')}</p>}
          {report.total > length && <p>{t('scanLimited', number.format(report.total), number.format(length))}</p>}
        </aside>}
        {(scan.origins.length > 0 || scan.needsConsent) && <section className="notice access" aria-labelledby="access-title">
          <Shield size={21} aria-hidden="true" />
          <div>
            <h2 id="access-title">{t(scan.origins.length ? 'permissionTitle' : 'consentTitle')}</h2>
            {scan.needsConsent && <p>{t('consentDetail')}</p>}
            {scan.origins.length > 0 && <p>{t('permissionDetail', number.format(scan.origins.length))}</p>}
            {scan.origins.length > 0 && <details>
              <summary>{t('permissionHosts')}</summary>
              <ul>{scan.origins.map((origin) => <li dir="ltr" key={origin}>{origin.slice(0, -2)}</li>)}</ul>
            </details>}
          </div>
          <button className="button" onClick={scan.grantAccess} disabled={scan.busy || scan.requesting || scan.otherTab}>
            {t(scan.requesting ? 'requestingAccess' : 'grantAccess')}
          </button>
        </section>}
        {scan.permissionError && <p className="notice alert" role="alert"><CircleAlert size={16} aria-hidden="true" />{t(scan.permissionError)}</p>}
        <Results report={report} outcomes={outcomes} retry={scan.retry} busy={runDisabled} />
      </>}
    </main>
  </>;
}

createRoot(document.getElementById('root')!).render(<SettingsProvider><ReportScreen /></SettingsProvider>);
