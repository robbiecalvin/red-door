function escapeHtml(value: string): string {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, character => entities[character]);
}

export function brandedEmail(subject: string, text: string, action?: { label: string; url: URL }) {
  const safeAction = action?.url.protocol === "https:" ? action : undefined;
  const body = text.split(/\n\n+/).map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  return {
    subject,
    text: safeAction ? `${text}\n\n${safeAction.label}: ${safeAction.url.href}` : text,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#171717;color:#f6f6f6;font:16px/1.6 Arial,sans-serif">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#171717">
        <tr><td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#343436">
            <tr><td style="padding:12px 24px;background:#050505;color:#fff;font-size:27px;font-weight:800;line-height:1.2">
              <span aria-hidden="true" style="color:#ff3331">▰</span>&nbsp; BADEHAUS X
            </td></tr>
            <tr><td style="padding:22px 30px 34px;color:#f6f6f6">
              <h1 style="margin:0 0 12px;color:#ff6258;font-size:28px;line-height:1.2">${escapeHtml(subject)}</h1>
              ${body}
              ${safeAction ? `<p><a style="color:#ff766e;font-weight:bold;text-decoration:underline" href="${escapeHtml(safeAction.url.href)}">${escapeHtml(safeAction.label)}</a></p>` : ""}
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>`
  };
}
