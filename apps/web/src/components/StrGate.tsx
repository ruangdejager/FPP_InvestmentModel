import { Badge, Warning } from './ui.js';
import type { Property } from '../lib/types.js';

/**
 * The hard gate.
 *
 * A body corporate can restrict or ban short-term letting, and can change its
 * conduct rules by special resolution after purchase. A property whose rules
 * have not been checked carries this warning on every screen it appears on, and
 * its verdict cannot pass.
 */
export function StrGateBadge({ status }: { status: Property['strPermitted'] }) {
  if (status === 'yes') return <Badge tone="pass">Short-term letting permitted</Badge>;
  if (status === 'no') return <Badge tone="fail">Short-term letting not permitted</Badge>;
  return <Badge tone="fail">Conduct rules unchecked</Badge>;
}

export function StrGateWarning({ property }: { property: Property }) {
  if (property.strPermitted === 'yes') return null;

  return (
    <Warning
      title={
        property.strPermitted === 'no'
          ? 'This scheme does not permit short-term letting.'
          : 'Nobody has checked whether this scheme permits short-term letting.'
      }
    >
      <p>
        {property.strPermitted === 'no'
          ? 'The short-term strategy cannot be run here. The long-term comparison below is the only case that applies.'
          : 'Read the conduct rules, record the answer and upload the document. Until then this verdict cannot pass, whatever the numbers say.'}
      </p>
      {property.strRestrictionNotes && <p className="mt-1 italic">{property.strRestrictionNotes}</p>}
    </Warning>
  );
}
