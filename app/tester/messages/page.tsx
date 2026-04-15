import { Suspense } from 'react';
import TesterDmClient from './TesterDmClient';

export default function TesterDmPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, color: '#94a3b8' }} data-testid="tester-dm-suspense-fallback">
          Loading...
        </div>
      }
    >
      <TesterDmClient />
    </Suspense>
  );
}
