import { Link2 } from 'lucide-react';

export function Brand() {
  return <div className="brand">
    <div className="brand-mark"><Link2 size={22} aria-hidden="true" /></div>
    <span>Broken Link Inspector</span>
  </div>;
}
