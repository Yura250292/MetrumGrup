"use client";

type Props = {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  gradient?: string;
};

export function UserAvatar({
  src,
  name,
  size = 36,
  className = "",
  gradient = "linear-gradient(135deg, #3B5BFF, #7C5CFF)",
}: Props) {
  const initial = (name || "?").charAt(0).toUpperCase();
  const fontSize = Math.max(size * 0.38, 10);

  if (src) {
    return (
      <img
        src={src}
        alt={name || ""}
        className={"rounded-full object-cover flex-shrink-0 " + className}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={"flex items-center justify-center rounded-full flex-shrink-0 font-semibold text-white " + className}
      style={{ width: size, height: size, background: gradient, fontSize }}
    >
      {initial}
    </div>
  );
}
