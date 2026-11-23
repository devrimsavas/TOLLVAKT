// The Tollvakt mark: a shield (protection) holding a parcel (goods at the
// border). Colors come from the theme, so it works in light and dark mode.
export function LogoMark({ size = 30 }: { size?: number }) {
  // The view box is cut tight around the shield, so the mark lines up
  // exactly with the page content below it
  return (
    <svg
      width={(size * 23) / 27}
      height={size}
      viewBox="4.5 2.5 23 27"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 2.5 27.5 6.5v8.6c0 7.1-4.8 12.6-11.5 14.4C9.3 27.7 4.5 22.2 4.5 15.1V6.5Z"
        fill="var(--ds-color-accent-base-default)"
      />
      <path
        d="M10 11.5 16 9l6 2.5v7L16 21l-6-2.5Z"
        fill="var(--ds-color-accent-base-contrast-default)"
      />
      <path
        d="M10 11.5 16 14l6-2.5M16 14v7"
        fill="none"
        stroke="var(--ds-color-accent-base-default)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <LogoMark />
      <span className="logo-text">Tollvakt</span>
    </span>
  );
}
