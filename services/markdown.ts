/**
 * Minimal markdown → HTML renderer.
 *
 * Used for the release-letter admin preview AND duplicated inline in
 * api/admin/send-release-letter.ts (per the PR #71 lesson — Vercel
 * serverless functions can't reliably import relative TS files outside
 * /api/).
 *
 * Supported subset:
 *   - # / ## / ### headings
 *   - **bold**, *italic*, `code` (inline)
 *   - bullet lists (`- ` prefix) and numbered lists (`1. ` prefix)
 *   - [text](url) links and ![alt](url) images
 *   - Blank-line-separated paragraphs
 *   - Horizontal rule `---`
 *   - > blockquotes
 *
 * Not supported (kept out for safety):
 *   - HTML pass-through
 *   - Code fences (```)
 *   - Tables
 *
 * Output is intentionally minimal HTML — caller wraps in their own
 * styled container (admin preview wraps in `<div class="prose">`,
 * email wraps in inline-styled `<div>`).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(s: string): string {
  let out = escapeHtml(s);
  // Images first (because the syntax overlaps with links): ![alt](url)
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, url) =>
    `<img src="${url}" alt="${alt}" style="max-width:100%;height:auto;border-radius:8px;margin:8px 0;" />`
  );
  // Links: [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) =>
    `<a href="${url}" style="color:#1e3a8a;text-decoration:underline;">${text}</a>`
  );
  // Bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic: *text* (avoid matching ** by requiring no surrounding *)
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  // Inline code: `text`
  out = out.replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.9em;">$1</code>');
  return out;
}

export function markdownToHtml(md: string): string {
  if (!md || !md.trim()) return '';
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      out.push('<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0;" />');
      i++;
      continue;
    }
    // Headings
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const sizes = ['', '24px', '20px', '17px'];
      out.push(`<h${level} style="font-size:${sizes[level]};font-weight:600;color:#111827;margin:24px 0 12px;">${renderInline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote style="margin:16px 0;padding:8px 16px;border-left:3px solid #c7d2fe;color:#4b5563;font-style:italic;">${renderInline(buf.join(' '))}</blockquote>`);
      continue;
    }
    // Bullet list
    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        items.push(`<li style="margin:6px 0;">${renderInline(lines[i].replace(/^-\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul style="margin:12px 0;padding-left:24px;">${items.join('')}</ul>`);
      continue;
    }
    // Numbered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li style="margin:6px 0;">${renderInline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol style="margin:12px 0;padding-left:24px;">${items.join('')}</ol>`);
      continue;
    }
    // Blank line: paragraph break
    if (line.trim() === '') {
      i++;
      continue;
    }
    // Paragraph: gather contiguous non-empty, non-special lines
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3}\s+|>|---+\s*$|-\s+|\d+\.\s+)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p style="margin:12px 0;line-height:1.6;color:#1f2937;">${renderInline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}
