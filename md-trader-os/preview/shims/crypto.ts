/** node:crypto is only reached by sign-in and billing, which the preview does not have. */
const unavailable = () => {
  throw new Error("Not available in the preview.");
};
export default { randomBytes: unavailable, scryptSync: unavailable, timingSafeEqual: unavailable, createHmac: unavailable };
