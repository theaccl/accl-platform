import Link from "next/link";
import type { ReactNode } from "react";

export type NexusLinkWrapperProps = {
  href?: string;
  isValid: boolean;
  children: ReactNode;
  className?: string;
  /** e.g. navigation intent for tooltips */
  title?: string;
};

/**
 * Renders Next.js <Link> only when href is valid; otherwise a non-interactive span (no fake links).
 */
export default function NexusLinkWrapper({ href, isValid, children, className = "", title }: NexusLinkWrapperProps) {
  if (isValid && href) {
    return (
      <Link href={href} className={className} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <span className={`cursor-default ${className}`} title={title}>
      {children}
    </span>
  );
}
