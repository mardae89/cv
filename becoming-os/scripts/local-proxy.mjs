// One origin for the local stack, laid out like a Supabase project URL:
// /auth/v1 → GoTrue, /rest/v1 → PostgREST, /storage/v1 → Storage API.
import http from "node:http";
const routes = [
  ["/auth/v1", 9999],
  ["/rest/v1", 3000],
  ["/storage/v1", 5000],
];
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, prefer, range, x-upsert, accept-profile, content-profile, cache-control, x-supabase-api-version",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
  "access-control-expose-headers": "content-range, x-total-count",
};
http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const route = routes.find(([p]) => req.url.startsWith(p));
  if (!route) { res.writeHead(404, cors); return res.end("no route"); }
  const [prefix, port] = route;
  const path = req.url.slice(prefix.length) || "/";
  const up = http.request({ host: "127.0.0.1", port, path, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${port}` } }, (r) => {
    res.writeHead(r.statusCode, { ...r.headers, ...cors });
    r.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502, cors); res.end(String(e)); });
  req.pipe(up);
}).listen(Number(process.env.PORT || 54321), () => console.log("proxy up"));
