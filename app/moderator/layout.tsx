import { notFound, redirect } from 'next/navigation';

import { requireModeratorPageAccess } from '@/lib/moderatorPageAuth';

export default async function ModeratorLayout({ children }: { children: React.ReactNode }) {
  const guard = await requireModeratorPageAccess();
  if (!guard.ok) {
    if (guard.reason === 'UNAUTHENTICATED') redirect('/login');
    notFound();
  }
  return <>{children}</>;
}
