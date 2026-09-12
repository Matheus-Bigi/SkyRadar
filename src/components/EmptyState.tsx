"use client";

import { RangeMiles } from "../store/useRadarStore";

export default function EmptyState({ rangeMiles }: { rangeMiles: RangeMiles }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 text-center">
      <div className="mb-2 font-mono text-[11px] tracking-[0.3em] text-radar-textdim">CLEAR SKY</div>
      <div className="font-mono text-[10px] text-radar-textdim/70">
        No aircraft within {rangeMiles} miles
      </div>
    </div>
  );
}
