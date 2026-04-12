import type { Dispatch, SetStateAction } from 'react';

export function clearBatchedDisplayNameFetchNotice(
  counterRef: { current: number },
  setVisible: Dispatch<SetStateAction<boolean>>
) {
  counterRef.current = 0;
  setVisible(false);
}

export function recordBatchedDisplayNameFetchFailure(
  counterRef: { current: number },
  setVisible: Dispatch<SetStateAction<boolean>>
) {
  counterRef.current += 1;
  setVisible(true);
}

export function DisplayNameLoadNotice({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <p style={{ margin: '8px 0', fontSize: 12, color: '#a16207' }}>
      Some display names could not be loaded yet.
    </p>
  );
}

