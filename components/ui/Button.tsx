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
    "bg-accent text-[#1f170a] hover:bg-[#e2b970] active:bg-[#c99b52] font-bold",
  secondary: "bg-raised text-ink border border-line-strong/60 hover:border-line-strong hover:bg-[#282724]",
  ghost: "text-muted hover:text-ink hover:bg-raised",
  danger: "bg-danger-soft text-[#f4aaa1] border border-[#5c2f29] hover:bg-[#4a2622]",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-[0.8125rem] rounded-md gap-1.5",
  md: "h-10 px-4 text-sm rounded-md gap-2",
  lg: "h-12 px-6 text-[0.9375rem] rounded-md gap-2",
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
        "press inline-flex items-center justify-center whitespace-nowrap",
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
