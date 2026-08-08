'use client';

import { useCallback, useState } from 'react';
import FunctionalWorldShell from './FunctionalWorldShell';
import ScopePricingDock from './ScopePricingDock';

export default function WorldRuntime() {
  const [revision, setRevision] = useState(0);
  const refreshWorld = useCallback(() => setRevision(value => value + 1), []);

  return (
    <>
      <FunctionalWorldShell key={revision} />
      <ScopePricingDock onChanged={refreshWorld} />
    </>
  );
}
