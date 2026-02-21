import fs from "node:fs";
import path from "node:path";

const LEAGUE_NAME = "L'Petites Amies"; // <-- FIX #1: correct league title

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function build() {
  const roster = readJson("roster_counts.json");
  const picks = readJson("picks_2026_milb_report.json");

  const rosterRows = Array.isArray(roster?.results) ? roster.results : [];
  const pickRows = Array.isArray(picks?.report) ? picks.report : [];

  // Build map: teamName -> required roster spots from picks report
  // Try a few likely key names (because earlier scripts varied)
  const picksByTeam = new Map();
  for (const r of pickRows) {
    const team =
      r.teamName ?? r.team ?? r.team_name ?? r.teamNameFromSheet ?? r.team_from_sheet ?? null;

    const required =
      r.requiredRosterSpots ?? r.requiredSpots ?? r.picksRequired ?? r.count ?? r.required ?? null;

    if (team != null) {
      picksByTeam.set(norm(team), safeNum(required));
    }
  }

  const rows = rosterRows.map((t) => {
    const teamName = t.teamName;
    const openSlots = safeNum(t.openSlots);

    const requiredSpots = picksByTeam.get(norm(teamName));
    const delta =
      openSlots != null && requiredSpots != null ? openSlots - requiredSpots : null;

    // FIX #2: 0 is GOOD (green check). Only negative is warning.
    const status = delta == null ? "unknown" : delta < 0 ? "warn" : "ok";

    return {
      teamName,
      teamId: t.teamId,
      url: t.url,
      minorsRostered: t.minorsRostered,
      minorsCap: t.minorsCap,
      openSlots,
      requiredSpots,
      delta,
      status,
    };
  });

  // Sort “most in trouble” first (most negative delta)
  rows.sort((a, b) => {
    const aa = a.delta == null ? 999999 : a.delta;
    const bb = b.delta == null ? 999999 : b.delta;
    return aa - bb;
  });

  const outDir = path.join("public");
  fs.mkdirSync(outDir, { recursive: true });

  const generatedAt = new Date().toISOString();

  const data = {
    leagueName: LEAGUE_NAME,
    generatedAt,
    rows,
  };

  fs.writeFileSync(path.join(outDir, "data.json"), JSON.stringify(data, null, 2));

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${LEAGUE_NAME} — Draft/Roster Tally</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; }
    h1 { margin: 0 0 6px; }
    .meta { color: #666; margin: 0 0 18px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #eee; padding: 10px 8px; text-align: left; vertical-align: top; }
    th { font-size: 12px; color: #444; text-transform: uppercase; letter-spacing: .04em; }
    .mono { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
    .ok { background: #e7f7ec; color: #116329; }
    .warn { background: #fff6db; color: #7a5a00; }
    .unknown { background: #eee; color: #333; }
    a { color: inherit; }
  </style>
</head>
<body>
  <h1>${LEAGUE_NAME}</h1>
  <p class="meta">Auto-updated. Data timestamp: <span id="ts" class="mono"></span></p>

  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Team</th>
        <th>Minors</th>
        <th>Open Slots</th>
        <th>Required Spots</th>
        <th>Delta (Open − Required)</th>
      </tr>
    </thead>
    <tbody id="tbody"></tbody>
  </table>

<script>
(async function () {
  const res = await fetch('./data.json', { cache: 'no-store' });
  const data = await res.json();
  document.getElementById('ts').textContent = data.generatedAt;

  const tbody = document.getElementById('tbody');

  function badge(status, delta) {
    if (status === 'ok') return '<span class="tag ok">✅ OK</span>';       // 0 is OK
    if (status === 'warn') return '<span class="tag warn">⚠️ Tight</span>'; // only negative deltas
    return '<span class="tag unknown">?</span>';
  }

  for (const r of data.rows) {
    const tr = document.createElement('tr');

    const minors = (r.minorsRostered != null && r.minorsCap != null)
      ? (r.minorsRostered + '/' + r.minorsCap)
      : '';

    const open = (r.openSlots == null) ? '' : String(r.openSlots);
    const req  = (r.requiredSpots == null) ? '' : String(r.requiredSpots);
    const del  = (r.delta == null) ? '' : String(r.delta);

    tr.innerHTML = \`
      <td>\${badge(r.status, r.delta)}</td>
      <td><a href="\${r.url}" target="_blank" rel="noreferrer">\${r.teamName}</a></td>
      <td class="mono">\${minors}</td>
      <td class="mono">\${open}</td>
      <td class="mono">\${req}</td>
      <td class="mono">\${del}</td>
    \`;

    tbody.appendChild(tr);
  }
})();
</script>
</body>
</html>`;

  fs.writeFileSync(path.join(outDir, "index.html"), html);
  console.log("Built public/index.html and public/data.json");
}

build();
