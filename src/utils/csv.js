/* CSV
 src/utils/csv.js
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) */
 
 // src/utils/csv.js
export function downloadCSV(filename, rows, headers) {
  // headers: [{ key, label }]
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    // CSV com "," + aspas se necessário
    const needs = /[",\n\r]/.test(s);
    const safe = s.replace(/"/g, '""');
    return needs ? `"${safe}"` : safe;
  };

  const lines = [];
  lines.push(headers.map((h) => esc(h.label)).join(","));
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h.key])).join(","));
  }

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
