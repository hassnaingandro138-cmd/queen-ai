interface QueenCrownLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export default function QueenCrownLogo({
  className = "",
  size = "md",
}: QueenCrownLogoProps) {
  const dimensions =
    size === "sm"
      ? "h-4 w-4"
      : size === "lg"
        ? "h-7 w-7"
        : "h-5 w-5";

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={`${dimensions} ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="queen-gold-gradient"
          x1="4"
          y1="6"
          x2="28"
          y2="26"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="45%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <linearGradient
          id="queen-gold-band"
          x1="6"
          y1="22"
          x2="26"
          y2="26"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="50%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#92400E" />
        </linearGradient>
      </defs>

      {/* Crown body */}
      <path
        d="M5.5 22.5L3.8 11.2C3.65 10.2 4.8 9.55 5.6 10.18L10.8 14.3L15.1 7.35C15.52 6.68 16.48 6.68 16.9 7.35L21.2 14.3L26.4 10.18C27.2 9.55 28.35 10.2 28.2 11.2L26.5 22.5H5.5Z"
        fill="url(#queen-gold-gradient)"
        stroke="#B45309"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />

      {/* Base band */}
      <rect
        x="5.5"
        y="22.8"
        width="21"
        height="3.4"
        rx="1.5"
        fill="url(#queen-gold-band)"
        stroke="#92400E"
        strokeWidth="0.9"
      />

      {/* Tip pearls */}
      <circle cx="4.3" cy="9.2" r="1.5" fill="#FDE047" stroke="#B45309" strokeWidth="0.8" />
      <circle cx="16" cy="5.6" r="1.8" fill="#FEF08A" stroke="#B45309" strokeWidth="0.8" />
      <circle cx="27.7" cy="9.2" r="1.5" fill="#FDE047" stroke="#B45309" strokeWidth="0.8" />

      {/* Royal pink & purple jewels */}
      <circle cx="16" cy="18.2" r="1.9" fill="#EC4899" stroke="#FDF2F8" strokeWidth="0.7" />
      <circle cx="10.5" cy="19" r="1.25" fill="#9333EA" stroke="#FAF5FF" strokeWidth="0.6" />
      <circle cx="21.5" cy="19" r="1.25" fill="#9333EA" stroke="#FAF5FF" strokeWidth="0.6" />
    </svg>
  );
}
