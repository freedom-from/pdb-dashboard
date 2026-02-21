import fs from "node:fs";
import path from "node:path";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const report = JSON.parse(fs.readFileSync("picks_2026_milb_report.json", "utf8"));

const rows = report.report
  .map((r) => {
    const flag =
      r.open_minus_required < 0 ? "🚨" : r.open_minus_required === 0 ? "⚠️" : "✅";
    return `
      <tr>
        <td>${esc(r.owner)}</td>
        <td>${esc(r.team)}</td>
        <td style="text-align:right">${r.requiredRosterSpots}</td>
        <td style="text-align:right">${r.minorsOpenSlots}</td>
        <td style="text-align:right;font-weight:700">${r.open_minus_required}</td>
        <td style="text-align:center">${flag}</td>
      </tr>`;
  })
  .join("\n");

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PDBL 2026 MiLB Roster Pressure</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:24px;color:#111}
    .meta{opacity:.75;margin:8px 0 18px}
    table{border-collapse:collapse;width:100%}
    th,td{border-bottom:1px solid #ddd;padding:10px 8px}
    th{text-align:left;background:#f6f6f6;position:sticky;top:0}
    .wrap{max-width:1100px;margin:0 auto}
    .pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#f0f0f0;font-size:12px}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>PDBL 2026 MiLB Roster Pressure</h1>
    <div class="meta">
      Updated: <span class="pill">${esc(report.generatedAt)}</span>
      &nbsp;|&nbsp; Rows: <span class="pill">${esc(report.sheet.rows)}</span>
      &nbsp;|&nbsp; Source: Fantrax minors open slots vs Sheet required spots
    </div>
    <table>
      <thead>
        <tr>
          <th>Owner</th>
          <th>Team</th>
          <th style="text-align:right">Required Spots (Sheet)</th>
          <th style="text-align:right">Open MiLB Slots (Fantrax)</th>
          <th style="text-align:right">Open − Required</th>
          <th style="text-align:center">Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</body>
</html>`;

fs.mkdirSync("public", { recursive: true });
fs.writeFileSync(path.join("public", "index.html"), html);
fs.copyFileSync("picks_2026_milb_report.json", path.join("public", "data.json"));

console.log("Wrote public/index.html and public/data.json");
