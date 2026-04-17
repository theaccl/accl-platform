'use client';

import { useState } from 'react';

type AddFriendButtonProps = {
  profileUserId: string;
};

export default function AddFriendButton({ profileUserId }: AddFriendButtonProps) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  async function handleAddFriend() {
    try {
      setStatus('sending');
      void profileUserId;
      // TODO: replace with real friend request API / RPC
      // await fetch('/api/friends/request', { ... })
      setStatus('sent');
    } catch {
      setStatus('idle');
    }
  }

  const label =
    status === 'sending' ? 'Sending...' : status === 'sent' ? 'Request Sent' : 'Add Friend';

  return (
    <button
      type="button"
      onClick={() => void handleAddFriend()}
      disabled={status === 'sending' || status === 'sent'}
      className="min-h-[42px] rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-4 py-2 text-sm font-semibold text-emerald-100 shadow-sm shadow-emerald-950/40 disabled:opacity-60"
      data-testid="profile-add-friend"
    >
      {label}
    </button>
  );
}
