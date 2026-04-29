// server/api/soul-rotate-cert.post.js  (dev server — mirrors soul_rotate_cert.lua in production)
// POST /api/soul-rotate-cert
// Auth: Bearer {soul_id}.{current_cert}
//
// Inkrementiert cert_version in sys.md, gibt neuen cert zurück.
// Production: handled by server/openresty/soul_rotate_cert.lua

export default defineEventHandler(async (_event) => {
  throw createError({ statusCode: 501, message: "Not implemented in dev. See soul_rotate_cert.lua." });
});
