"use client";

import type { ComponentProps, ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function Button({
  className,
  type = "button",
  variant = "primary",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "outline" | "danger" }) {
  return (
    <button
      type={type}
      className={cn("button", `button-${variant}`, className)}
      {...props}
    />
  );
}
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn("input", className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn("input", className)} {...props} />;
}
export function Alert({ children, ...props }: ComponentProps<"div">) {
  return (
    <div role="alert" className="alert" {...props}>
      {children}
    </div>
  );
}
export function Table({ children, ...props }: ComponentProps<"table">) {
  return (
    <div className="table-scroll">
      <table {...props}>{children}</table>
    </div>
  );
}
export function Dialog({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
}: {
  trigger?: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && (
        <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      )}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className="dialog-content">
          <DialogPrimitive.Title className="dialog-title">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="muted">
            {description}
          </DialogPrimitive.Description>
          {children}
          <DialogPrimitive.Close asChild>
            <Button variant="outline">Close</Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
