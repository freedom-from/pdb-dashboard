import fs from "node:fs";

const LEAGUE_NAME = "L'Petites Amies";

function mustReadJson(fp) {
  const txt = fs.readFileSync(fp, "utf8");
  return JSON.parse(txt);
}
function escHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function norm(s) { return String(s ?? "").trim().toLowerCase(); }
function formatSigned(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return x > 0 ? `+${x}` : `${x}`;
}

const roster = mustReadJson("roster_counts.json");
const picks = mustReadJson("picks_2026_milb_report.json");

const rosterResults = Array.isArray(roster?.results) ? roster.results : [];
const pickReport = Array.isArray(picks?.report) ? picks.report : [];

const rosterByTeam = new Map();
for (const r of rosterResults) rosterByTeam.set(norm(r.teamName), r);

const rows = [];
const failures = [];

for (const p of pickReport) {
  const teamNameFromSheet = p.teamName ?? p.team ?? "";
  const rosterNeed = Number(p.requiredRosterSpots ?? p.count);

  const rr = rosterByTeam.get(norm(teamNameFromSheet));
  if (!rr) {
    failures.push({ owner: p.owner ?? "", teamNameFromSheet, reason: "Team name mismatch" });
    continue;
  }

  const openSlots = Number(rr.openSlots);
  const slotsMinusPicks =
    Number.isFinite(openSlots) && Number.isFinite(rosterNeed) ? openSlots - rosterNeed : null;

  // FIX #2: 0 is GOOD (✅). Only negative is bad.
  const status = slotsMinusPicks === null ? "unknown" : (slotsMinusPicks < 0 ? "bad" : "good");

  rows.push({
    owner: p.owner ?? "",
    teamName: rr.teamName,
    teamId: rr.teamId,
    url: rr.url,
    minors: `${rr.minorsRostered}/${rr.minorsCap}`,
    openSlots: rr.openSlots,
    requiredRosterSpots: Number.isFinite(rosterNeed) ? rosterNeed : null,
    slots_minus_picks: slotsMinusPicks,
    status,
  });
}

rows.sort((a, b) => {
  const aa = Number.isFinite(a.slots_minus_picks) ? a.slots_minus_picks : 999999;
  const bb = Number.isFinite(b.slots_minus_picks) ? b.slots_minus_picks : 999999;
  return aa - bb;
});

const payload = { leagueName: LEAGUE_NAME, generatedAt: new Date().toISOString(), rows, failures };

fs.mkdirSync("public", { recursive: true });
fs.writeFileSync("public/data.json", JSON.stringify(payload, null, 2));

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escHtml(LEAGUE_NAME)} – Draft Slot Tally</title>
<style>
:root{color-scheme:dark}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;background:#0b0f14;color:#e8eef6}
.wrap{max-width:1100px;margin:0 auto;padding:22px 18px 40px}
h1{margin:0 0 6px;font-size:22px;font-weight:700}
.meta{opacity:.75;font-size:13px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;background:#0f1620;border:1px solid #1b2a3a;border-radius:12px;overflow:hidden}
th,td{padding:10px;border-bottom:1px solid #182636;text-align:left;font-size:14px}
th{font-size:12px;text-transform:uppercase;opacity:.8;background:#0c131c}
tr:last-child td{border-bottom:0}
a{color:#9fd3ff;text-decoration:none} a:hover{text-decoration:underline}
.good{color:#7CFC9A}.bad{color:#ff7b7b}.unknown{color:#ffd479}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace}
</style>
</head>
<body>
<div class="wrap">
  <h1>${escHtml(LEAGUE_NAME)}</h1>
  <div class="meta">Auto-updated • Generated: <span class="mono">${escHtml(payload.generatedAt)}</span></div>
  <table>
    <thead>
      <tr>
        <th>Status</th><th>Team</th><th>Owner</th><th>Minors</th>
        <th class="mono">Open</th><th class="mono">Req</th><th class="mono">Open−Req</th>
      </tr>
    </thead>
    <tbody>
    ${rows.map(r=>{
      const icon = r.status==="bad" ? "⚠️" : (r.status==="good" ? "✅" : "❔");
      return `<tr>
        <td class="${r.status}">${icon}</td>
        <td><a href="${escHtml(r.url)}" target="_blank" rel="noreferrer">${escHtml(r.teamName)}</a></td>
        <td>${escHtml(r.owner)}</td>
        <td class="mono">${escHtml(r.minors)}</td>
        <td class="mono">${escHtml(r.openSlots)}</td>
        <td class="mono">${r.requiredRosterSpots ?? ""}</td>
        <td class="mono">${r.slots_minus_picks===null ? "" : escHtml(formatSigned(r.slots_minus_picks))}</td>
      </tr>`;
    }).join("")}
    </tbody>
  </table>
</div>
</body>
</html>`;
fs.writeFileSync("public/index.html", html);

console.log("Wrote public/index.html + public/data.json");
