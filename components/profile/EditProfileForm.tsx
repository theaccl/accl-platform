'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { useRouter } from 'next/navigation';

import CountryFlagCombobox from '@/components/profile/CountryFlagCombobox';
import { assertBioWordCount, countWords, PROFILE_BIO_WORD_ERROR_MESSAGE } from '@/lib/profile';
import { getCroppedPngBlob } from '@/lib/profileImageCrop';
import { supabase } from '@/lib/supabaseClient';
import { profileRowNeedsUsername, validateAcclUsername } from '@/lib/usernameRules';

export type EditProfileFormProps = {
  initialUsername: string | null;
  initialBio: string | null;
  initialFlag: string | null;
  initialAvatarPath: string | null;
  userId: string;
  onSaved?: () => void;
};

type FieldErrors = {
  username?: string;
  bio?: string;
  flag?: string;
  form?: string;
};

export default function EditProfileForm({
  initialUsername,
  initialBio,
  initialFlag,
  initialAvatarPath,
  userId,
  onSaved,
}: EditProfileFormProps) {
  const router = useRouter();

  const [username, setUsername] = useState(initialUsername ?? '');
  const [bio, setBio] = useState(initialBio ?? '');
  const [flag, setFlag] = useState(initialFlag ?? '');
  const [avatarPath, setAvatarPath] = useState(initialAvatarPath ?? '');

  useEffect(() => {
    setUsername(initialUsername ?? '');
    setBio(initialBio ?? '');
    setFlag(initialFlag ?? '');
    setAvatarPath(initialAvatarPath ?? '');
  }, [initialUsername, initialBio, initialFlag, initialAvatarPath]);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string>('');

  const bioWordCount = useMemo(() => countWords(bio), [bio]);

  const needsUsernameClaim = profileRowNeedsUsername(initialUsername);
  const usernameLocked = !needsUsernameClaim;

  const normalizeRpcError = useCallback((message: string | undefined): FieldErrors => {
    const raw = (message ?? '').trim();

    if (!raw) {
      return { form: 'Unable to save profile right now.' };
    }

    if (raw.includes('Bio must be 150–250 words')) {
      return { bio: PROFILE_BIO_WORD_ERROR_MESSAGE };
    }

    if (raw.toLowerCase().includes('duplicate key') || raw.toLowerCase().includes('username')) {
      return { username: 'That username is unavailable.' };
    }

    return { form: raw };
  }, []);

  const validateClient = useCallback((): FieldErrors => {
    const nextErrors: FieldErrors = {};

    if (!username.trim()) {
      nextErrors.username = 'Username is required.';
    } else if (needsUsernameClaim) {
      const v = validateAcclUsername(username);
      if (!v.ok) {
        nextErrors.username = v.error;
      }
    }

    if (bio.trim()) {
      try {
        assertBioWordCount(bio, 150, 250);
      } catch {
        nextErrors.bio = PROFILE_BIO_WORD_ERROR_MESSAGE;
      }
    }

    return nextErrors;
  }, [bio, needsUsernameClaim, username]);

  const onCropConfirm = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) {
      setErrors((e) => ({ ...e, form: 'Finish cropping first.' }));
      return;
    }
    setIsSaving(true);
    setErrors({});
    try {
      const blob = await getCroppedPngBlob(imageSrc, croppedAreaPixels, 512);
      const path = `${userId}/avatar-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from('profile-avatars').upload(path, blob, {
        upsert: true,
        contentType: 'image/png',
      });
      if (upErr) {
        setErrors({ form: upErr.message });
        return;
      }
      setAvatarPath(path);
      setCropOpen(false);
      if (imageSrc.startsWith('blob:')) URL.revokeObjectURL(imageSrc);
      setImageSrc(null);
    } catch (err) {
      setErrors({
        form: err instanceof Error ? err.message : 'Upload failed.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [croppedAreaPixels, imageSrc, userId]);

  const onPickFile = (file: File | null) => {
    if (!file) return;
    setSaveSuccess('');
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setCropOpen(true);
    setCroppedAreaPixels(null);
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveSuccess('');
    setErrors({});

    const clientErrors = validateClient();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setIsSaving(true);

    try {
      if (needsUsernameClaim) {
        const v = validateAcclUsername(username);
        if (!v.ok) {
          setErrors({ username: v.error });
          return;
        }
        const res = await fetch('/api/profile/claim-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: v.username }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          if (res.status === 409) {
            setErrors({ username: 'That username is unavailable.' });
            return;
          }
          setErrors(normalizeRpcError(typeof body.error === 'string' ? body.error : res.statusText));
          return;
        }
      }

      const payloadBio = bio.trim() === '' ? null : bio.trim();
      const payloadFlag = flag.trim() === '' ? null : flag.trim();
      const payloadAvatarPath = avatarPath.trim() === '' ? null : avatarPath.trim();

      const { error } = await supabase.rpc('update_own_profile_identity', {
        p_bio: payloadBio,
        p_avatar_path: payloadAvatarPath,
        p_flag: payloadFlag,
      });

      if (error) {
        setErrors(normalizeRpcError(error.message));
        return;
      }

      setSaveSuccess('Profile updated.');
      onSaved?.();
      router.refresh();
    } catch (err) {
      setErrors({
        form:
          err instanceof Error && err.message.trim()
            ? err.message
            : 'Unable to save profile right now.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      {cropOpen && imageSrc ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#2a3442] bg-[#111723] p-4 text-white">
            <div className="relative h-72 w-full">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_a, px) => setCroppedAreaPixels(px)}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <label className="text-xs text-gray-500">
                Zoom
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="ml-2"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[#2a3442] px-3 py-2 text-sm text-gray-200"
                onClick={() => {
                  setCropOpen(false);
                  if (imageSrc.startsWith('blob:')) URL.revokeObjectURL(imageSrc);
                  setImageSrc(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white"
                disabled={isSaving}
                onClick={() => void onCropConfirm()}
              >
                Upload crop
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex flex-col gap-6"
        data-testid="edit-profile-form"
        noValidate
      >
        {errors.form ? (
          <div
            className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            data-testid="edit-profile-form-error"
          >
            {errors.form}
          </div>
        ) : null}

        {saveSuccess ? (
          <div
            className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-200"
            data-testid="edit-profile-form-success"
          >
            {saveSuccess}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <label htmlFor="username" className="text-sm font-medium text-slate-200">
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setErrors((prev) => ({ ...prev, username: undefined, form: undefined }));
            }}
            disabled={usernameLocked}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-60"
            aria-invalid={errors.username ? 'true' : 'false'}
            aria-describedby={
              errors.username ? 'username-error username-policy' : 'username-policy'
            }
            data-testid="edit-profile-username-input"
            autoComplete="off"
          />
          {usernameLocked ? (
            <p className="text-xs text-slate-500" id="username-policy">
              Usernames cannot be changed after they are first set.
            </p>
          ) : (
            <p className="text-xs text-slate-500" id="username-policy">
              Choose carefully — usernames cannot be changed after they are first set.
            </p>
          )}
          {errors.username ? (
            <p
              id="username-error"
              className="text-sm text-red-300"
              data-testid="edit-profile-username-error"
            >
              {errors.username}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-slate-200">Profile image</p>
          <input
            data-testid="profile-image-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="text-sm text-slate-400"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="bio" className="text-sm font-medium text-slate-200">
            Bio
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              setErrors((prev) => ({ ...prev, bio: undefined, form: undefined }));
            }}
            rows={8}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none"
            aria-invalid={errors.bio ? 'true' : 'false'}
            aria-describedby={errors.bio ? 'bio-help bio-error' : 'bio-help'}
            data-testid="edit-profile-bio-input"
          />
          <div
            id="bio-help"
            className="flex items-center justify-between text-xs text-slate-400"
          >
            <span>Bio must be 150–250 words when provided.</span>
            <span data-testid="edit-profile-bio-word-count">{bioWordCount} words</span>
          </div>
          {errors.bio ? (
            <p
              id="bio-error"
              className="text-sm text-red-300"
              data-testid="edit-profile-bio-error"
            >
              {errors.bio}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="flag" className="text-sm font-medium text-slate-200">
            Country / flag
          </label>
          <CountryFlagCombobox
            id="flag"
            value={flag}
            onChange={(code) => {
              setFlag(code);
              setErrors((prev) => ({ ...prev, flag: undefined, form: undefined }));
            }}
            disabled={isSaving}
          />
          <p className="text-xs text-slate-500">Stored as a two-letter ISO code (e.g. US).</p>
          {errors.flag ? (
            <p className="text-sm text-red-300" data-testid="edit-profile-flag-error">
              {errors.flag}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 disabled:opacity-60"
            data-testid="edit-profile-save"
          >
            {isSaving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </>
  );
}
