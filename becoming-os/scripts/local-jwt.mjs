// Signs the anon / service_role keys for the local test stack (HS256).
import { createHmac } from "node:crypto";
const secret = process.env.JWT_SECRET;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (role) => {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iss: "supabase-local", role, iat: 1760000000, exp: 2000000000 });
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
};
console.log(`ANON_KEY=${sign("anon")}`);
console.log(`SERVICE_KEY=${sign("service_role")}`);
