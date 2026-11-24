import { useState } from 'react';
import {
  ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, CircleCheck, CircleMinus,
  CircleAlert, CircleX, FileSearch, FolderOpen, MapPin, RotateCw, TriangleAlert,
} from 'lucide-react';
import { canRetry, categories, visibleOutcome } from '../core/types';
import type { Category, Outcomes, Report } from '../core/types';
import { describeOutcome } from './resultFormatting';
import { useSettings } from './settings';
import { locateSourceLink } from '../browser/capture';

const PAGE_SIZE = 50;
type Filter = 'all' | Category;
export const statusIcons = {
  working: CircleCheck, missing: CircleX, redirect: ArrowRight,
  uncertain: TriangleAlert, notChecked: CircleMinus,
};

interface ResultsProps {
  report: Report;
  outcomes: Outcomes;
  retry: (indices: ReadonlySet<number>) => void;
  busy: boolean;
}

export function Results({ report, outcomes, retry, busy }: ResultsProps) {
  const { t, locale } = useSettings();
  const format = new Intl.NumberFormat(locale);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(new Set<number>());
  const [locateFailed, setLocateFailed] = useState(false);
  const rows = report.links.flatMap((link, index) => {
    const outcome = visibleOutcome(outcomes.get(index), report.phase);
    return filter === 'all' || filter === outcome.category ? [{ link, outcome, index }] : [];
  });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const eligible = visible.filter(({ outcome }) => canRetry(outcome)).map(({ index }) => index);
  const selectedEligible = new Set([...selected].filter((index) => canRetry(outcomes.get(index))));
  const pageSelected = eligible.length > 0 && eligible.every((index) => selected.has(index));

  function toggle(indices: number[], checked: boolean) {
    setSelected((prior) => {
      const next = new Set(prior);
      for (const index of indices) {
        if (checked) next.add(index);
        else next.delete(index);
      }
      return next;
    });
  }

  async function locate(url: string) {
    setLocateFailed(false);
    if (!await locateSourceLink(report, url)) setLocateFailed(true);
  }


  return <section className="results panel" aria-labelledby="results-title">
    <div className="results-heading">
      <h2 id="results-title"><FileSearch size={19} aria-hidden="true" />{t('listTitle')}</h2>
      <div className="result-actions">
        <span className="small muted">{t('shownCount', format.format(rows.length), format.format(report.links.length))}</span>
        <button className="button" disabled={busy || !selectedEligible.size} onClick={() => {
          retry(selectedEligible);
          setSelected(new Set());
        }}><RotateCw size={15} aria-hidden="true" />{t('retrySelected')}</button>
      </div>
    </div>
    <div role="group" className="filters" aria-label={t('filter')}>
      {(['all', ...categories] as const).map((item) => (
        <button key={item} className="filter" aria-pressed={filter === item} onClick={() => {
          setFilter(item);
          setPage(0);
        }}>{t(item === 'all' ? 'allLinks' : item)}</button>
      ))}
    </div>
    {locateFailed && <p className="alert result-alert" role="alert">
      <CircleAlert size={15} aria-hidden="true" />{t('locateUnavailable')}
    </p>}
    <div className="table-wrap" tabIndex={0} role="region" aria-labelledby="results-title">
      <table aria-labelledby="results-title">
        <thead><tr>
          <th scope="col" className="selection-cell">
            <input type="checkbox" aria-label={t('selectVisible')} checked={pageSelected}
              disabled={busy || !eligible.length} onChange={(event) => toggle(eligible, event.target.checked)} />
          </th>
          <th scope="col">{t('urlColumn')}</th><th scope="col">{t('statusColumn')}</th>
          <th scope="col">{t('httpColumn')}</th><th scope="col">{t('sourceColumn')}</th>
          <th scope="col">{t('detailsColumn')}</th>
        </tr></thead>
        <tbody>
          {visible.map(({ link, outcome, index }) => {
            const Icon = statusIcons[outcome.category];
            const details = describeOutcome(outcome, t);
            return <tr key={index}>
              <td className="selection-cell">
                {canRetry(outcome) && <input type="checkbox" aria-label={t('selectLink', link.url)}
                  disabled={busy} checked={selected.has(index)} onChange={(event) => toggle([index], event.target.checked)} />}
              </td>
              <td data-label={t('urlColumn')}>
                {link.blocked ? <bdi>{link.url || t('noValue')}</bdi> :
                  <a className="link-address" href={link.url} target="_blank" rel="noopener noreferrer" dir="ltr">
                    <span>{link.url}</span><ArrowUpRight size={14} aria-hidden="true" />
                  </a>}
                {link.label && <span className="link-label" dir="auto">{link.label}</span>}
              </td>
              <td data-label={t('statusColumn')}><span className={'badge ' + outcome.category}>
                <Icon size={14} aria-hidden="true" />{t(outcome.category)}
              </span></td>
              <td data-label={t('httpColumn')}><span className="http-code">
                {outcome.status ?? <span aria-label={t('noValue')}>—</span>}
              </span></td>
              <td data-label={t('sourceColumn')} className="result-source">
                {report.sourceUrl ? <bdi title={report.sourceUrl}>{report.sourceUrl}</bdi> :
                  <span>{t(report.kind === 'bookmarks' ? 'bookmarksTitle' : 'noValue')}</span>}
                {canRetry(outcome) && report.sourceTabId !== undefined && <button className="location-button"
                  type="button" onClick={() => void locate(link.url)}>
                  <MapPin size={14} aria-hidden="true" />{t('locateLink')}
                </button>}
              </td>
              <td data-label={t('detailsColumn')} className="row-details">
                {outcome.redirectUrl && <span className="redirect-line">
                  <span>{t('redirectTo')}</span><bdi title={outcome.redirectUrl}>{outcome.redirectUrl}</bdi>
                </span>}
                {details || (!outcome.redirectUrl && <span aria-label={t('noValue')}>—</span>)}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
      {!visible.length && <div className="empty">
        <FolderOpen size={25} aria-hidden="true" />
        <p>{t(report.links.length ? 'emptyFilter' : 'emptyLinks')}</p>
      </div>}
    </div>
    {pages > 1 && <div className="pagination">
      <button className="button icon-button" aria-label={t('previousPage')} disabled={!currentPage}
        onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} aria-hidden="true" /></button>
      <span className="small muted">{t('resultPages', format.format(currentPage + 1), format.format(pages))}</span>
      <button className="button icon-button" aria-label={t('nextPage')} disabled={currentPage >= pages - 1}
        onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} aria-hidden="true" /></button>
    </div>}
  </section>;
}
