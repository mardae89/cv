// In-app links. In a normal browser tab these are react-router's own links.
// Inside the claude.ai viewer, the viewer treats any <a href> as a link to
// another website (opening it in a new tab, or nowhere), so a sidebar click
// never reaches the app. There, links render without an href and navigate
// in memory on click or Enter — same look, same "link" role for screen readers.
import { forwardRef, type AnchorHTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
  Link as RouterLink, NavLink as RouterNavLink, useLocation, useNavigate, useResolvedPath,
  type LinkProps, type NavLinkProps,
} from "react-router-dom";
import { isFramed } from "@/data/host";

const FRAMED = isFramed();

type Base = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">;

function useGo(to: LinkProps["to"], replace?: boolean, onClick?: (e: MouseEvent<HTMLAnchorElement>) => void) {
  const navigate = useNavigate();
  const go = () => navigate(to, { replace });
  return {
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      e.preventDefault();
      go();
    },
    onKeyDown: (e: KeyboardEvent<HTMLAnchorElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        go();
      }
    },
  };
}

const FramedLink = forwardRef<HTMLAnchorElement, LinkProps>(function FramedLink({ to, replace, onClick, className, children, reloadDocument: _r, state: _s, preventScrollReset: _p, relative: _rel, ...rest }, ref) {
  const handlers = useGo(to, replace, onClick);
  return <a ref={ref} role="link" tabIndex={0} className={cx(className)} {...rest} {...handlers}>{children}</a>;
});

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(props, ref) {
  return FRAMED ? <FramedLink ref={ref} {...props} /> : <RouterLink ref={ref} {...props} />;
});

type NavState = { isActive: boolean; isPending: boolean; isTransitioning: boolean };

const FramedNavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function FramedNavLink({ to, end, replace, onClick, className, children, style: _st, caseSensitive: _c, reloadDocument: _r, state: _s, preventScrollReset: _p, relative: _rel, viewTransition: _v, ...rest }, ref) {
  const { pathname } = useLocation();
  const target = useResolvedPath(to).pathname;
  const isActive = pathname === target || (!end && target !== "/" && pathname.startsWith(target.endsWith("/") ? target : `${target}/`));
  const s: NavState = { isActive, isPending: false, isTransitioning: false };
  const handlers = useGo(to, replace, onClick);
  const cls = typeof className === "function" ? className(s) : className;
  const kids = typeof children === "function" ? (children as (s: NavState) => ReactNode)(s) : children;
  return (
    <a ref={ref} role="link" tabIndex={0} aria-current={isActive ? "page" : undefined} className={cx(cls)} {...(rest as Base)} {...handlers}>
      {kids}
    </a>
  );
});

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink(props, ref) {
  return FRAMED ? <FramedNavLink ref={ref} {...props} /> : <RouterNavLink ref={ref} {...props} />;
});

const cx = (c: string | undefined) => ["cursor-pointer", c].filter(Boolean).join(" ");
