import * as React from "react";
import { cn } from "../lib/cn";

/**
 * Layout primitives. RTL-ready by construction: logical properties/utilities only
 * (ps/pe, ms/me, text-start) — never left/right (D8).
 */

export const Container = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mx-auto w-full max-w-6xl ps-6 pe-6", className)} {...props} />
);

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: "row" | "column";
  gap?: "none" | "sm" | "md" | "lg";
}

const gapClass = { none: "gap-0", sm: "gap-2", md: "gap-4", lg: "gap-8" } as const;

export const Stack = ({ className, direction = "column", gap = "md", ...props }: StackProps) => (
  <div
    className={cn(
      "flex",
      direction === "column" ? "flex-col" : "flex-row",
      gapClass[gap],
      className,
    )}
    {...props}
  />
);

export const PageHeader = ({
  className,
  title,
  description,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { title: string; description?: string }) => (
  <div className={cn("flex flex-col gap-2 pt-10 pb-8", className)} {...props}>
    <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
    {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
    {children}
  </div>
);
