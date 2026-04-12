'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';

type Props = {
  userId: string | null | undefined;
  children: ReactNode;
  style?: CSSProperties;
  'data-testid'?: string;
};

/**
 * Navigation to `/profile/[id]` — public, privacy-curated snapshot only.
 * Does not expose private account fields; destination is enforced server-side.
 */
export function PublicProfileLink({ userId, children, style, 'data-testid': testId }: Props) {
  if (!userId) {
    return <span style={style}>{children}</span>;
  }
  return (
    <Link
      href={`/profile/${userId}`}
      data-testid={testId}
      style={{
        color: '#93c5fd',
        fontWeight: 'inherit',
        textDecoration: 'underline',
        textUnderlineOffset: 3,
        ...style,
      }}
    >
      {children}
    </Link>
  );
}
