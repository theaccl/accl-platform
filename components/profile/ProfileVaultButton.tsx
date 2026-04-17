import Link from 'next/link';

export function ProfileVaultButton() {
  return (
    <Link
      href="/vault"
      className="inline-flex w-full items-center justify-center rounded-xl border border-[#2a3442] bg-[#101722] py-3 text-center text-base font-semibold text-gray-100 transition hover:bg-[#192235]"
    >
      Enter Vault
    </Link>
  );
}
