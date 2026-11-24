import type { MessageKey, Translate } from '../core/i18n';
import type { Outcome, Reason } from '../core/types';

const reasonKeys: Record<Reason, MessageKey> = {
  permission: 'reasonPermission',
  privateHost: 'reasonPrivateHost',
  timeout: 'reasonTimeout',
  network: 'reasonNetwork',
  httpError: 'reasonHttpError',
  redirectHidden: 'reasonRedirectHidden',
  stopped: 'reasonStopped',
  interrupted: 'reasonInterrupted',
  pending: 'reasonPending',
  unsafeUrl: 'reasonUnsafeUrl',
  dns: 'reasonDns',
};

const specificHttpErrors: Partial<Record<number, MessageKey>> = {
  400: 'http400', 401: 'http401', 403: 'http403', 404: 'http404', 405: 'http405',
  408: 'http408', 410: 'http410', 429: 'http429', 451: 'http451', 502: 'http502',
  503: 'http503', 504: 'http504',
};

export function describeOutcome(outcome: Outcome, t: Translate): string {
  if (!outcome.reason) return '';
  if (outcome.reason === 'httpError' && outcome.status !== undefined) {
    const status = outcome.status;
    const key = specificHttpErrors[status];
    if (key) return t(key);
    if (status >= 500 && status < 600) return t('httpServerError', status);
  }
  return t(reasonKeys[outcome.reason], outcome.status ?? '');
}
