'use client';

import type { CSSProperties } from 'react';

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 16,
  flexWrap: 'wrap',
  alignItems: 'center',
  marginBottom: 12,
};
const legendStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginRight: 4 };

type Props = {
  value: boolean;
  onChange: (rated: boolean) => void;
  disabled?: boolean;
  /** Prefix for input name + data-testid (e.g. free-play, home-free-play). */
  testIdPrefix?: string;
};

export function RatedUnratedToggle({ value, onChange, disabled, testIdPrefix = 'rated-choice' }: Props) {
  const name = `${testIdPrefix}-match-rated`;
  return (
    <div style={rowStyle} role="group" aria-label="Match rating type">
      <span style={legendStyle}>Match type</span>
      <label style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.65 : 1 }}>
        <input
          type="radio"
          name={name}
          checked={value === true}
          onChange={() => onChange(true)}
          disabled={disabled}
          data-testid={`${testIdPrefix}-rated`}
        />{' '}
        Rated
      </label>
      <label style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.65 : 1 }}>
        <input
          type="radio"
          name={name}
          checked={value === false}
          onChange={() => onChange(false)}
          disabled={disabled}
          data-testid={`${testIdPrefix}-unrated`}
        />{' '}
        Unrated
      </label>
    </div>
  );
}
