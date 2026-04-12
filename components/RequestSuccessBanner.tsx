import type { CSSProperties } from 'react';

type RequestSuccessBannerProps = {
  headline: string;
  detail?: string;
};

const shellStyle: CSSProperties = {
  marginTop: 12,
  marginBottom: 10,
  padding: '12px 14px',
  borderRadius: 8,
  border: '1px solid #2f7a4f',
  background: 'linear-gradient(180deg, #132118 0%, #0f1a13 100%)',
  boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
  maxWidth: 560,
};

const headlineStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#8ee4a8',
};

const detailStyle: CSSProperties = {
  margin: '6px 0 0 0',
  fontSize: 13,
  color: '#c9ead4',
  lineHeight: 1.4,
};

export function RequestSuccessBanner({ headline, detail }: RequestSuccessBannerProps) {
  return (
    <div role="status" aria-live="polite" style={shellStyle}>
      <p style={headlineStyle}>{headline}</p>
      {detail ? <p style={detailStyle}>{detail}</p> : null}
    </div>
  );
}

