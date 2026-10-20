import type { AnchorHTMLAttributes, ReactNode } from "react";

/** next/link for the preview: a plain anchor; the router intercepts the click. */
export default function Link({
  href,
  children,
  prefetch: _prefetch,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean; children?: ReactNode }) {
  void _prefetch;
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
