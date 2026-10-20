/** next/headers for the preview: there is no sign-in, so there are no cookies. */
export async function cookies() {
  return {
    get: (_name: string): { value: string } | undefined => undefined,
    set: (..._args: unknown[]) => {},
    delete: (..._args: unknown[]) => {},
  };
}
