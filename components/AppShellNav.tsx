'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { SwitchModeLink } from '@/components/SwitchModeLink';

/** Shared link color for major shell destinations — keep in sync across pages. */
export const shellNavLinkStyle: CSSProperties = { color: '#93c5fd' };

export type AppShellNavVariant = 'standard' | 'home' | 'vault' | 'tournamentDetail' | 'finishedHub';

type BaseProps = {
  style?: CSSProperties;
  gap?: number;
  /** Extra controls or contextual links after the core row. */
  children?: ReactNode;
};

type TournamentLink = { href: string; label: string };

type TournamentHistory = { href: string; label: string };

type StandardLikeProps = BaseProps & {
  variant?: 'standard' | 'home';
  /** E.g. on `/free`, hide the self link. */
  omitFree?: boolean;
  /** E.g. on `/tournaments` list, hide the self link. */
  omitTournaments?: boolean;
  /** E.g. on `/profile`, hide the self link to Profile. */
  omitProfile?: boolean;
  /** Profile settings: link to public snapshot. */
  afterHome?: ReactNode;
  /** Profile settings: link to Vault. */
  showVault?: boolean;
  finishedGamesTestId?: string;
  /** Ecosystem-context shortcut only (e.g. `/tournaments` → tournament slice). Omit on general pages. */
  tournamentHistory?: TournamentHistory;
  tournamentsLink?: TournamentLink;
};

type VaultVariantProps = BaseProps & {
  variant: 'vault';
};

type TournamentDetailVariantProps = BaseProps & {
  variant: 'tournamentDetail';
  tournamentHistory?: TournamentHistory;
};

type FinishedHubVariantProps = BaseProps & {
  variant: 'finishedHub';
};

export type AppShellNavProps =
  | StandardLikeProps
  | VaultVariantProps
  | TournamentDetailVariantProps
  | FinishedHubVariantProps;

const tournamentDetailDefaultHistory: TournamentHistory = {
  href: '/finished?context=tournament',
  label: 'Your tournament game history',
};

export function AppShellNav(props: AppShellNavProps) {
  const gap = props.gap ?? 14;

  if (props.variant === 'vault') {
    return (
      <p style={{ display: 'flex', gap, flexWrap: 'wrap', alignItems: 'center', marginTop: 0, ...props.style }}>
        <SwitchModeLink style={{ color: '#fde047' }} />
        <Link href="/" style={shellNavLinkStyle}>
          Home
        </Link>
        <Link href="/profile" style={shellNavLinkStyle}>
          Profile
        </Link>
        <Link href="/tournaments" style={shellNavLinkStyle}>
          Tournaments
        </Link>
        <Link href="/finished" style={shellNavLinkStyle}>
          Finished games
        </Link>
        <Link href="/free" style={shellNavLinkStyle}>
          Free lobby
        </Link>
        {props.children}
      </p>
    );
  }

  if (props.variant === 'tournamentDetail') {
    const th = props.tournamentHistory ?? tournamentDetailDefaultHistory;
    return (
      <p style={{ display: 'flex', gap, flexWrap: 'wrap', alignItems: 'center', marginTop: 0, ...props.style }}>
        <SwitchModeLink style={{ color: '#fde047' }} />
        <Link href="/tournaments" style={shellNavLinkStyle}>
          All tournaments
        </Link>
        <Link href="/" style={shellNavLinkStyle}>
          Home
        </Link>
        <Link href="/free" style={shellNavLinkStyle}>
          Free lobby
        </Link>
        <Link href="/profile" style={shellNavLinkStyle}>
          Profile
        </Link>
        <Link href={th.href} style={shellNavLinkStyle}>
          {th.label}
        </Link>
        {props.children}
      </p>
    );
  }

  if (props.variant === 'finishedHub') {
    return (
      <p style={{ display: 'flex', gap, flexWrap: 'wrap', alignItems: 'center', marginTop: 0, ...props.style }}>
        <SwitchModeLink style={{ color: '#fde047' }} />
        <Link href="/free" style={shellNavLinkStyle}>
          Free lobby
        </Link>
        <Link href="/tournaments" style={shellNavLinkStyle}>
          Tournaments
        </Link>
        <Link href="/profile" style={shellNavLinkStyle}>
          Profile
        </Link>
        <Link href="/" style={shellNavLinkStyle}>
          Home
        </Link>
        {props.children}
      </p>
    );
  }

  const {
    variant = 'standard',
    style,
    children,
    afterHome,
    showVault,
    omitProfile,
    omitTournaments,
    omitFree,
    finishedGamesTestId,
    tournamentHistory,
    tournamentsLink = { href: '/tournaments', label: 'Tournaments' },
  } = props as StandardLikeProps;

  const showHome = variant !== 'home';

  return (
    <p style={{ display: 'flex', gap, flexWrap: 'wrap', alignItems: 'center', marginTop: 0, ...style }}>
      <SwitchModeLink style={{ color: '#fde047' }} />
      {showHome ? (
        <Link href="/" style={shellNavLinkStyle}>
          Home
        </Link>
      ) : null}
      {afterHome}
      {showVault ? (
        <Link href="/vault" style={shellNavLinkStyle}>
          Vault
        </Link>
      ) : null}
      {!omitFree ? (
        <Link href="/free" style={shellNavLinkStyle}>
          Free lobby
        </Link>
      ) : null}
      {!omitTournaments ? (
        <Link href={tournamentsLink.href} style={shellNavLinkStyle}>
          {tournamentsLink.label}
        </Link>
      ) : null}
      {!omitProfile ? (
        <Link href="/profile" style={shellNavLinkStyle}>
          Profile
        </Link>
      ) : null}
      <Link href="/finished" data-testid={finishedGamesTestId} style={shellNavLinkStyle}>
        Finished games
      </Link>
      {tournamentHistory ? (
        <Link href={tournamentHistory.href} style={shellNavLinkStyle}>
          {tournamentHistory.label}
        </Link>
      ) : null}
      {children}
    </p>
  );
}
