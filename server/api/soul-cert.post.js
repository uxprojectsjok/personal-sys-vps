// server/api/soul-cert.post.js  (dev server — mirrors soul_cert.lua in production)
// POST /api/soul-cert  { soul_id: string }  → { cert: string }
//
// Generates a soul_cert for a given soul_id.
// cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id).hex()[0:32]
//
// ⚠  Owner's implementation — not included in this distribution.
//    Production: handled by server/openresty/soul_cert.lua
//    Contact: jan-oliver.karo@uxprojects-jok.com

export default defineEventHandler(async (_event) => {
  throw createError({ statusCode: 501, message: "Not implemented. See soul_cert.lua." });
});
