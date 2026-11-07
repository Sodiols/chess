import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Stretches to the container width — used in stacked dialog actions. */
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-[#231a0c] hover:bg-[#dcb673] active:bg-[#c99b52] font-semibold shadow-[0_1px_0_rgba(255,255,255,0.18)_inset]",
  secondary: "bg-raised text-ink border border-line hover:border-line-strong hover:bg-[#26262b]",
  ghost: "text-muted hover:text-ink hover:bg-raised",
  danger: "bg-danger-soft text-[#f0a49b] border border-[#5c2f29] hover:bg-[#4a2622]",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.8125rem] rounded-md gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-12 px-6 text-[0.9375rem] rounded-lg gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  block = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex items-center justify-center whitespace-nowrap transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
      {...props}
    />
  );
}
