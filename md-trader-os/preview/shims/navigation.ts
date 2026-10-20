import { navigate, useLocation } from "../router";

/** The subset of next/navigation the app's client pages use. */
export function usePathname(): string {
  return useLocation().path;
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(useLocation().search);
}

export function useRouter() {
  return { push: navigate, replace: navigate, back: () => navigate("/dashboard"), refresh: () => {}, prefetch: () => {} };
}

export function redirect(href: string): never {
  navigate(href);
  throw new Error(`redirect to ${href}`);
}
