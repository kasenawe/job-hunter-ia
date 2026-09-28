"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
};

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  const base =
    "inline-flex min-w-[190px] cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";

  const variants = {
    primary: "bg-zinc-100 text-zinc-950 hover:bg-white",
    secondary:
      "border border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:text-white",
  };

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      aria-busy={pending}
      className={`${base} ${variants[variant]}`}
    >
      {pending && (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      <span>{pending ? pendingLabel : children}</span>
    </button>
  );
}
