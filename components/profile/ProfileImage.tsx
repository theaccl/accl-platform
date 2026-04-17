type ProfileImageProps = {
  url: string | null;
};

/**
 * Personal profile image (secondary identity). Never replaces the ACCL badge.
 */
export default function ProfileImage({ url }: ProfileImageProps) {
  const src = url || '/default-avatar.svg';

  return (
    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900">
      {/* eslint-disable-next-line @next/next/no-img-element -- public fallback + storage URLs */}
      <img
        src={src}
        alt="Profile image"
        className="h-24 w-24 rounded-full object-cover"
        data-testid="profile-uploaded-image"
      />
    </div>
  );
}
