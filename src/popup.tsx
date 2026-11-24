import { useEffect, useState } from 'react';
import { ArrowUpRight, Bookmark, CircleAlert, Globe2, LoaderCircle, ScanLine } from 'lucide-react';
import { extension } from './browser/api';
import { sourceAddress } from './core/privacy';
import { captureReport } from './browser/capture';
import { createReport } from './browser/reports';
import { normalizeUrl } from './core/urls';
import type { MessageKey } from './core/i18n';
import { LanguageSelect, SettingsProvider, useSettings } from './ui/settings';
import { Brand } from './ui/shared';
import { createRoot } from 'react-dom/client';
import './ui/styles.css';

function Popup() {
  const { t } = useSettings();
  const [tab, setTab] = useState<chrome.tabs.Tab>();
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<MessageKey>();
  const source = tab?.url && normalizeUrl(tab.url, tab.url) ? tab.url : undefined;

  useEffect(() => {
    if (!extension?.tabs) { setLoading(false); return; }
    void extension.tabs.query({ active: true, currentWindow: true })
      .then(([active]) => setTab(active)).catch(() => setError('captureError'))
      .finally(() => setLoading(false));
  }, []);

  async function showReport(id?: string, bookmarks = false) {
    try {
      const path = id ? 'report.html?id=' + encodeURIComponent(id) : bookmarks ? 'report.html?bookmarks=1' : 'report.html';
      await extension.tabs.create({ url: extension.runtime.getURL(path) });
      window.close();
    } catch {
      setError('openError');
    }
  }

  async function capture() {
    if (tab?.id === undefined || !source || capturing) return;
    setError(undefined);
    setCapturing(true);
    let stage: MessageKey = 'captureError';
    try {
      const report = await captureReport(tab.id);
      stage = 'storageError';
      await createReport(report);
      await showReport(report.id);
    } catch {
      setError(stage);
    } finally {
      setCapturing(false);
    }
  }

  return <main className="popup-shell">
    <header className="popup-header"><Brand /><LanguageSelect /></header>
    <div className="popup-source">
      <div className="source-icon"><Globe2 size={19} aria-hidden="true" /></div>
      <div className="min-width">
        <p className="meta-label">{t('currentPage')}</p>
        <p className="popup-address" title={source && sourceAddress(source)} dir={source ? 'ltr' : undefined}>
          {loading ? t('loading') : source ? sourceAddress(source) : t('sourceUnavailable')}
        </p>
      </div>
    </div>
    <p className="popup-disclosure small muted">{t('networkDisclosure')}</p>
    {error && <p className="alert" role="alert"><CircleAlert size={16} aria-hidden="true" />{t(error)}</p>}
    <button className="button primary popup-scan" onClick={() => void capture()} disabled={!source || capturing}>
      {capturing ? <LoaderCircle className="spinner" size={18} aria-hidden="true" /> : <ScanLine size={18} aria-hidden="true" />}
      {t(capturing ? 'capturing' : 'scanCurrentPage')}
    </button>
    <button className="button popup-bookmarks" disabled={capturing} onClick={() => void showReport(undefined, true)}>
      <Bookmark size={17} aria-hidden="true" />{t('scanBookmarks')}
    </button>
    <button className="button text-button popup-report" onClick={() => void showReport()}>
      {t('openReport')}<ArrowUpRight size={15} aria-hidden="true" />
    </button>
  </main>;
}

createRoot(document.getElementById('root')!).render(<SettingsProvider><Popup /></SettingsProvider>);
