// src/lib/markdown.js
// Minimal, XSS-safe markdown -> HTML for reading content.
// IMPORTANT: HTML is escaped FIRST, so any markup in the model output (or anywhere)
// is rendered inert before our own safe tags are introduced. Unit-tested in tests/.

export function renderReportHtml(md) {
  if (!md) return '';
  return String(md)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^---$/gim, '<hr/>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .split('\n\n').map((p) => {
      if (p.startsWith('<h') || p.startsWith('<hr') || p.startsWith('<li')) return p;
      if (p.trim() === '') return '';
      return '<p>' + p.replace(/\n/g, '<br/>') + '</p>';
    }).join('\n')
    .replace(/(<li>.*?<\/li>\n?)+/g, (m) => '<ul>' + m + '</ul>');
}

export function renderReport(md) {
  return { __html: renderReportHtml(md) };
}
