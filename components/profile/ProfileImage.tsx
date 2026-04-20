type ProfileImageProps = {
  url: string | null;
};

/**
 * Personal profile image (secondary identity). Never replaces the ACCL badge.
 * No generic placeholder avatar — only show a photo when a URL exists.
 */
export default function ProfileImage({ url }: ProfileImageProps) {
  if (!url) {
    return (
      <div
        className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-600 bg-slate-900/60"
        data-testid="profile-uploaded-image"
        aria-label="No profile photo"
      >
        <span className="px-2 text-center text-xs text-slate-500">No photo</span>
      </div>
    );
  }

  return (
    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900">
      {/* eslint-disable-next-line @next/next/no-img-element -- storage URLs */}
      <img
        src={url}
        alt="Profile image"
        className="h-24 w-24 rounded-full object-cover"
        data-testid="profile-uploaded-image"
      />
    </div>
  );
}
