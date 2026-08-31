type GenerationTokenCoinProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClasses = {
  sm: 'h-12 w-12',
  md: 'h-20 w-20',
  lg: 'h-28 w-28',
} as const;

export function GenerationTokenCoin({ size = 'md', className = '' }: GenerationTokenCoinProps) {
  return (
    <div
      className={`${sizeClasses[size]} relative shrink-0 rounded-full bg-[radial-gradient(circle_at_36%_28%,#fff1a8_0%,#e6b93e_18%,#936316_56%,#392007_100%)] p-[3px] shadow-[0_0_30px_rgba(212,160,23,0.24),inset_0_2px_4px_rgba(255,255,255,0.5)] ${className}`}
      role="img"
      aria-label="ACCL Generation Token"
    >
      <div className="grid h-full w-full place-items-center rounded-full border border-[#ffdf73]/70 bg-[radial-gradient(circle_at_50%_42%,rgba(255,225,119,0.24),rgba(67,36,5,0.82)_70%)] shadow-[inset_0_0_0_3px_rgba(50,25,4,0.38)]">
        <svg viewBox="0 0 100 100" className="h-[72%] w-[72%] drop-shadow-[0_2px_1px_rgba(0,0,0,0.5)]" aria-hidden="true">
          <path d="M29 72h47l-4 10H25l4-10Zm8-5c2-15 10-23 24-27-6-4-12-5-20-4 4-10 15-16 29-12-1 9-5 16-12 21 9 5 14 12 15 22H37Z" fill="#f8d568" stroke="#5b3308" strokeWidth="3" strokeLinejoin="round" />
          <path d="M55 29c4 0 7 2 9 5" fill="none" stroke="#5b3308" strokeWidth="3" strokeLinecap="round" />
          <circle cx="60" cy="32" r="2.6" fill="#5b3308" />
        </svg>
      </div>
    </div>
  );
}
