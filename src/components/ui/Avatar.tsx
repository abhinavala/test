import { FC } from 'react';

interface AvatarProps {
  src: string | null;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 24,
  md: 32,
  lg: 40,
};

export const Avatar: FC<AvatarProps> = ({ src, alt, size = 'md' }) => {
  const px = sizeMap[size];
  const initials = alt
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (!src) {
    return (
      <div
        className="avatar avatar--fallback"
        style={{ width: px, height: px }}
        role="img"
        aria-label={alt}
      >
        <span className="avatar__initials">{initials}</span>
      </div>
    );
  }

  return (
    <img
      className="avatar"
      src={src}
      alt={alt}
      width={px}
      height={px}
      style={{ borderRadius: 'var(--radius-full)' }}
    />
  );
};

export default Avatar;
