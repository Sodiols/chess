interface IconProps {
  className?: string;
}

/** Minimal 20×20 stroke icons; only the handful the interface actually needs. */
function Icon({ children, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className ?? "size-[18px] shrink-0"}
    >
      {children}
    </svg>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9h8.5a3.5 3.5 0 0 1 0 7H8" />
      <path d="M7 5.5 3.5 9 7 12.5" />
    </Icon>
  );
}

export function FlipIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 3v14" />
      <path d="M6 6.5 10 3l4 3.5" />
      <path d="M6 13.5 10 17l4-3.5" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
    </Icon>
  );
}

export function FlagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 3v14" />
      <path d="M5 4h9l-1.8 3.2L14 10.5H5z" />
    </Icon>
  );
}

export function HandshakeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 8.5 6 5l4 3.5L13.5 5 17.5 8.5" />
      <path d="M2.5 8.5 6 12l1.8-1.8" />
      <path d="M17.5 8.5 14 12l-4-3.5" />
    </Icon>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 5.5h10M7 10h10M7 14.5h10" />
      <path d="M3.5 5.5h.01M3.5 10h.01M3.5 14.5h.01" />
    </Icon>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.5 4.5v11M12.5 4.5v11" />
    </Icon>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3c2 2.2 3 4.5 3 7s-1 4.8-3 7c-2-2.2-3-4.5-3-7s1-4.8 3-7Z" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </Icon>
  );
}

export function ChipIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="5" width="10" height="10" rx="1.5" />
      <path d="M8 8h4v4H8zM8 2.5V5M12 2.5V5M8 15v2.5M12 15v2.5M2.5 8H5M2.5 12H5M15 8h2.5M15 12h2.5" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7.5" cy="7" r="2.5" />
      <path d="M2.5 16c.4-2.6 2.4-4 5-4s4.6 1.4 5 4" />
      <path d="M12.5 4.8a2.5 2.5 0 0 1 0 4.4M14.5 12.3c1.5.5 2.6 1.8 3 3.7" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="7" y="7" width="9" height="9" rx="1.5" />
      <path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" />
    </Icon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3h-3" />
    </Icon>
  );
}
