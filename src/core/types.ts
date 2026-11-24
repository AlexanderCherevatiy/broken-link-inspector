export const categories = ['working', 'missing', 'redirect', 'uncertain', 'notChecked'] as const;
export type Category = typeof categories[number];
export type Method = 'HEAD' | 'GET';
export type Reason = 'permission' | 'privateHost' | 'timeout' | 'network' | 'httpError'
  | 'redirectHidden' | 'stopped' | 'interrupted' | 'pending' | 'unsafeUrl' | 'dns';

export interface LinkTarget {
  url: string;
  label: string;
  blocked?: true;
}

export interface Outcome {
  category: Category;
  status?: number;
  method?: Method;
  reason?: Reason;
  redirectUrl?: string;
}

export type Phase = 'ready' | 'running' | 'finished' | 'stopped' | 'interrupted';

export interface Report {
  id: string;
  sourceUrl: string;
  kind?: 'bookmarks';
  sourceTabId?: number;
  sourceDocumentId?: string;
  sourceNonce?: string;
  title: string;
  links: LinkTarget[];
  total: number;
  captureLimited: boolean;
  createdAt: number;
  phase: Phase;
}

export type Outcomes = ReadonlyMap<number, Outcome>;

export function visibleOutcome(saved: Outcome | undefined, phase: Phase): Outcome {
  if (saved) return saved;
  const reason = phase === 'stopped' || phase === 'interrupted' ? phase : 'pending';
  return { category: 'notChecked', reason };
}

export function canRetry(outcome: Outcome | undefined): boolean {
  return outcome?.category === 'missing' || outcome?.category === 'uncertain';
}
