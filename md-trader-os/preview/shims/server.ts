/** next/server for the preview: route handlers' responses as plain Responses. */
export const NextResponse = {
  json(data: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    return new Response(JSON.stringify(data), { ...init, headers });
  },
};
export type NextRequest = Request;
