import { useState } from 'react';

/**
 * Creator avatar. Falls back to a gold initial tile when the image is missing
 * or fails to load — a broken-image icon is never acceptable on a profile.
 */
export default function Avatar({
  name,
  src,
  size = 52,
  className = '',
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const px = { width: size, height: size };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        style={px}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{ ...px, background: 'linear-gradient(140deg, #D87800, #8F4E00)', fontSize: size * 0.36 }}
      className={`grid shrink-0 place-items-center rounded-full font-display text-wage-ink ${className}`}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}
