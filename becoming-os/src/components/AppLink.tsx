// In-app links. In a normal browser tab these are react-router's own links.
// Inside the claude.ai viewer (desktop browsers especially), a click on an <a>
// element is taken over by the viewer, which loads that address in place of
// the app and leaves a blank page. There, links aren't <a> elements at all:
// they render as a span with the "link" role and navigate in memory on click
// or Enter — same look, same role for screen readers.
import { forwardRef, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
  Link as RouterLink, NavLink as RouterNavLink, useLocation, useNavigate, useResolvedPath,
  type LinkProps, type NavLinkProps,
} from "react-router-dom";
import { isFramed } from "@/data/host";

const FRAMED = isFramed();

type Base = Omit<HTMLAttributes<HTMLSpanElement>, "className" | "children">;

function useGo(to: LinkProps["to"], replace?: boolean, onClick?: (e: MouseEvent<HTMLAnchorElement>) => void) {
  // Handlers are typed for anchors so callers' onClick props fit; they run on a span.
  const navigate = useNavigate();
  const go = () => navigate(to, { replace });
  return {
    onClick: (e: MouseEvent<HTMLSpanElement>) => {
      onClick?.(e as unknown as MouseEvent<HTMLAnchorElement>);
      e.preventDefault();
      go();
    },
    onKeyDown: (e: KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        go();
      }
    },
  };
}

const FramedLink = forwardRef<HTMLSpanElement, LinkProps>(function FramedLink({ to, replace, onClick, className, children, reloadDocument: _r, state: _s, preventScrollReset: _p, relative: _rel, ...rest }, ref) {
  const handlers = useGo(to, replace, onClick);
  return <span ref={ref} role="link" tabIndex={0} className={cx(className)} {...(rest as Base)} {...handlers}>{children}</span>;
});

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(props, ref) {
  return FRAMED ? <FramedLink ref={ref as never} {...props} /> : <RouterLink ref={ref} {...props} />;
});

type NavState = { isActive: boolean; isPending: boolean; isTransitioning: boolean };

const FramedNavLink = forwardRef<HTMLSpanElement, NavLinkProps>(function FramedNavLink({ to, end, replace, onClick, className, children, style: _st, caseSensitive: _c, reloadDocument: _r, state: _s, preventScrollReset: _p, relative: _rel, viewTransition: _v, ...rest }, ref) {
  const { pathname } = useLocation();
  const target = useResolvedPath(to).pathname;
  const isActive = pathname === target || (!end && target !== "/" && pathname.startsWith(target.endsWith("/") ? target : `${target}/`));
  const s: NavState = { isActive, isPending: false, isTransitioning: false };
  const handlers = useGo(to, replace, onClick);
  const cls = typeof className === "function" ? className(s) : className;
  const kids = typeof children === "function" ? (children as (s: NavState) => ReactNode)(s) : children;
  return (
    <span ref={ref} role="link" tabIndex={0} aria-current={isActive ? "page" : undefined} className={cx(cls)} {...(rest as Base)} {...handlers}>
      {kids}
    </span>
  );
});

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink(props, ref) {
  return FRAMED ? <FramedNavLink ref={ref as never} {...props} /> : <RouterNavLink ref={ref} {...props} />;
});

const cx = (c: string | undefined) => ["cursor-pointer", c].filter(Boolean).join(" ");
