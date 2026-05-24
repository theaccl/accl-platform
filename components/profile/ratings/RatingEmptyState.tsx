type Props = {
  title?: string;
  message?: string;
};

export function RatingEmptyState({
  title = 'Not enough rating history yet',
  message = 'Rating movement charts appear here once enough rated games are recorded for this bucket.',
}: Props) {
  return (
    <div
      className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-[#33465c] bg-[#0a1018]/80 px-6 py-10 text-center"
      data-testid="profile-rating-chart-empty"
    >
      <p className="m-0 text-sm font-semibold text-gray-200">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-500">{message}</p>
    </div>
  );
}
