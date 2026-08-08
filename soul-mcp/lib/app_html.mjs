// app_html.mjs
// Injiziert ein <base href> in eine MCP-App's index.html, damit relative
// Pfade (style.css, app.js, fetch('...')) unabhängig davon auflösen, wie der
// MCP-Host die ui://-Resource rendert — der Host bietet vermutlich keine
// verlässliche relative-URL-Auflösung (siehe soul_apps.mjs). Absolute URLs,
// die ein App-Autor selbst schon hartcodiert (siehe hello-world-Demo),
// bleiben davon unberührt — <base> wirkt nur auf relative Referenzen.
//
// Live in Claude.ai (Web + Desktop) verifiziert: Claude respektiert die von
// uns deklarierte baseUriDomains-CSP NICHT — <base> wird trotzdem mit
// "violates ... base-uri 'self'" geblockt (selbst bei einer brandneuen,
// nie zuvor gecachten Resource — kein Caching-Artefakt). Root-relative
// Referenzen wie /apps/_sdk/app.js lösen dadurch gegen den isolierten
// Sandbox-Origin des Hosts statt gegen uns auf → 404, SDK lädt nie,
// App.connect() läuft nie. Deshalb den SDK-Import zusätzlich hart auf eine
// volladressierte URL umschreiben, die von base-uri unabhängig ist (nur
// script-src/resourceDomains greift dafür, und die respektiert Claude
// nachweislich — keine entsprechende Violation im Log).
export function injectBaseTag(html, baseUrl) {
  const tag = `<base href="${baseUrl}">`;
  const sdkAbsolute = `${new URL(baseUrl).origin}/apps/_sdk/app.js`;
  const rewritten = html.replace(/(["'])\/apps\/_sdk\/app\.js\1/g, `$1${sdkAbsolute}$1`);
  if (/<head[^>]*>/i.test(rewritten)) {
    return rewritten.replace(/<head[^>]*>/i, m => `${m}\n    ${tag}`);
  }
  if (/<html[^>]*>/i.test(rewritten)) {
    return rewritten.replace(/<html[^>]*>/i, m => `${m}\n<head>${tag}</head>`);
  }
  return `${tag}\n${rewritten}`;
}
