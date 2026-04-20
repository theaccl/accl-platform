export function ProfileVaultButton() {
  return (
    <div
      className="inline-flex w-full cursor-not-allowed flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#3d4a5c] bg-[#0c1018] py-3 text-center text-base font-semibold text-gray-500 opacity-90"
      title="Vault is not available yet"
      aria-disabled="true"
    >
      <span>Enter Vault</span>
      <span className="text-xs font-normal text-gray-600">Coming soon</span>
    </div>
  );
}
