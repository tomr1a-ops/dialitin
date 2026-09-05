export const PKCE_SAME_BROWSER_MESSAGE =
  "Open this link in the browser you signed in from";

export function sanitizePkceDetail(detail: string) {
  return detail
    .replace(
      /(access_token|refresh_token|id_token|code_verifier|token|code)=[^\s&]+/gi,
      "$1=[redacted]",
    )
    .slice(0, 240);
}

export function renderPkceFailurePage(technicalDetail: string) {
  const detail = sanitizePkceDetail(technicalDetail);
  const escapedDetail = escapeHtml(detail);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Open this link in the same browser</title>
    <style>
      body {
        margin: 0;
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 2.5rem 1.25rem;
        background: #0b1210;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
      .card {
        margin: 0 auto;
        width: 100%;
        max-width: 28rem;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1rem;
        background: #101916;
        padding: 1.5rem;
      }
      h1 {
        margin: 0;
        font-size: 1.5rem;
        line-height: 1.3;
        color: #fff;
      }
      .detail {
        margin: 1rem 0 0;
        font-size: 0.875rem;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.55);
      }
      a {
        display: inline-block;
        margin-top: 1.5rem;
        color: #c8f542;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>${PKCE_SAME_BROWSER_MESSAGE}</h1>
      <p class="detail">${escapedDetail}</p>
      <a href="/admin/login">Back to admin login</a>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function resolveAdminAuthCallback({
  code,
  nextParam,
  exchangeCode,
}: {
  code: string | null;
  nextParam: string | null;
  exchangeCode: (
    code: string,
  ) => Promise<{ error: { message: string } | null }>;
}): Promise<
  { kind: "redirect"; path: string } | { kind: "pkce-failure"; html: string }
> {
  const next =
    nextParam && nextParam.startsWith("/admin") ? nextParam : "/admin/content";

  if (!code) {
    return { kind: "redirect", path: next };
  }

  const { error } = await exchangeCode(code);
  if (error) {
    return {
      kind: "pkce-failure",
      html: renderPkceFailurePage(error.message),
    };
  }

  return { kind: "redirect", path: next };
}
