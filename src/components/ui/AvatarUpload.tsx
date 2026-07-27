import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Avatar from './Avatar';

const BUCKET = 'wage-avatars';
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Upload an avatar instead of pasting a URL. Files go to the public
 * `wage-avatars` bucket under a folder named after the user's id — storage
 * policy only lets a user write inside their own folder.
 */
export default function AvatarUpload({
  value,
  name,
  onChange,
}: {
  value: string;
  name: string;
  onChange: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after an error
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProblem('That is not an image. Pick a PNG, JPG or WebP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setProblem(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 4 MB.`);
      return;
    }

    setBusy(true); setProblem(null);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setProblem('Your session expired. Sign in again.'); setBusy(false); return; }

    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${uid}/avatar-${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    });
    if (error) { setProblem(`Upload failed. ${error.message}`); setBusy(false); return; }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    onChange(data.publicUrl);
    setBusy(false);
  }

  return (
    <div>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">Avatar</span>
      <div className="mt-2 flex items-center gap-4">
        <Avatar name={name} src={value} size={72} />
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              className="wage-btn wage-btn-ghost !px-4 !py-1.5 text-sm"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {busy ? 'Uploading...' : value ? 'Replace image' : 'Upload image'}
            </button>
            {value && (
              <button
                type="button"
                className="wage-btn wage-btn-quiet !px-3 !py-1.5 text-sm"
                onClick={() => onChange('')}
                disabled={busy}
              >
                Remove
              </button>
            )}
          </div>
          <span className="text-[12.5px] text-wage-muted-2">Square image, PNG or JPG, up to 4 MB.</span>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={pick}
      />

      {problem && (
        <p role="status" className="mt-3 border border-wage-error/40 bg-wage-error/[0.08] px-3 py-2 text-xs text-wage-error">
          {problem}
        </p>
      )}
    </div>
  );
}
