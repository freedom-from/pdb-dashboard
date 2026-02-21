import fs from "node:fs";
import path from "node:path";

const LEAGUE_NAME = "L'Petites Amies"; // <-- fixes wrong title (was showing PDBL)

function mustReadJson(fp) {
  if (!fs.existsSync(fp)) throw new Error(`Missing required file: ${fp}`);
  const txt = fs.readFileSync(fp, "utf8");
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw new Error(`Could not parse JSON: ${fp} (${e?.message ?? e})`);
  }
}

function escHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function formatSigned(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return x > 0 ? `+${x}` : `${x}`;
}

function build() {
  const roster = mustReadJson("roster_counts.json");
  const picks = mustReadJson("picks_2026_milb_report.json");

  const rosterResults = Array.isArray(roster?.results) ? roster.results : [];
  const pickReport = Array.isArray(picks?.report) ? picks.report : [];

  // Map roster open slots by normalized teamName
  const rosterByTeam = new Map();
  for (const r of rosterResults) {
    const key = norm(r.teamName);
    rosterByTeam.set(key, {
      teamName: r.teamName,
      teamId: r.teamId,
      minorsRostered: r.minorsRostered,
      minorsCap: r.minorsCap,
      openSlots: r.openSlots,
      url: r.url,
    });
  }

  // Join picks -> roster
  const rows = [];
  const failures = [];

  for (const p of pickReport) {
    const teamNameFromSheet = p.teamName ?? p.team ?? "";
    const rosterNeed = Number(p.requiredRosterSpots ?? p.rosterSpotsRequired ?? p.roster_spots_required ?? p.count ?? p.picksRequired);

    const rosterRow = rosterByTeam.get(norm(teamNameFromSheet));

    if (!rosterRow) {
      failures.push({
        owner: p.owner ?? p.ownerName ?? "",
        teamNameFromSheet,
        reason: "Team not found in roster_counts.json (name mismatch)",
      });
      continue;
    }

    const openSlots = Number(rosterRow.openSlots);
    const slotsMinusPicks = Number.isFinite(openSlots) && Number.isFinite(rosterNeed) ? openSlots - rosterNeed : null;

    // ✅ KEY FIX: 0 is GOOD. Only negative is a problem.
    const status =
      slotsMinusPicks === null ? "unknown" : (slotsMinusPicks < 0 ? "bad" : "good");

    rows.push({
      owner: p.owner ?? p.ownerName ?? "",
      teamName: rosterRow.teamName,
      teamId: rosterRow.teamId,
      url: rosterRow.url,
      minors: `${rosterRow.minorsRostered}/${rosterRow.minorsCap}`,
      openSlots: rosterRow.openSlots,
      requiredRosterSpots: Number.isFinite(rosterNeed) ? rosterNeed : null,
      slots_minus_picks: slotsMinusPicks,
      status,
    });
  }

  // Sort: most in trouble first (most negative), then smallest margin
  rows.sort((a, b) => {
    const aa = Number.isFinite(a.slots_minus_picks) ? a.slots_minus_picks : 999999;
    const bb = Number.isFinite(b.slots_minus_picks) ? b.slots_minus_picks : 999999;
    return aa - bb;
  });

  const payload = {
    leagueName: LEAGUE_NAME,
    generatedAt: new Date().toISOString(),
    rows,
    failures,
  };

  fs.mkdirSync("public", { recursive: true });
  fs.writeFileSync("public/data.json", JSON.stringify(payload, null, 2));

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escHtml(LEAGUE_NAME)} – Draft Slot Tally</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#0b0f14; color:#e8eef6; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 22px 18px 40px; }
  h1 { margin: 0 0 6px; font-size: 22px; font-weight: 700; letter-spacing: .2px; }
  .meta { opacity: .75; font-size: 13px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; border-spacing: 0; background:#0f1620; border:1px solid #1b2a3a; border-radius: 12px; overflow: hidden; }
  th, td { padding: 10px 10px; border-bottom: 1px solid #182636; text-align: left; font-size: 14px; }
  th { font-size: 12px; letter-spacing: .5px; text-transform: uppercase; opacity: .8; background:#0c131c; }
  tr:last-child td { border-bottom: 0; }
  a { color: #9fd3ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .pill { display:inline-flex; gap:8px; align-items:center; }
  .good { color: #7CFC9A; }
  .bad  { color: #ff7b7b; }
  .unknown { color: #ffd479; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${escHtml(LEAGUE_NAME)}</h1>
  <div class="meta">Auto-updated • Generated: <span class="mono">${escHtml(payload.generatedAt)}</span></div>

  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Team</th>
        <th>Owner</th>
        <th>Minors</th>
        <th class="mono">Open Slots</th>
        <th class="mono">Required Spots</th>
        <th class="mono">Slots − Required</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(r => {
        const icon = r.status === "bad" ? "⚠️" : (r.status === "good" ? "✅" : "❔");
        const cls = r.status;
        return `<tr>
          <td><span class="pill ${cls}">${icon} <span>${escHtml(r.status)}</span></span></td>
          <td><a href="${escHtml(r.url)}" target="_blank" rel="noreferrer">${escHtml(r.teamName)}</a></td>
          <td>${escHtml(r.owner)}</td>
          <td class="mono">${escHtml(r.minors)}</td>
          <td class="mono">${escHtml(r.openSlots)}</td>
          <td class="mono">${r.requiredRosterSpots ?? ""}</td>
          <td class="mono">${r.slots_minus_picks === null ? "" : escHtml(formatSigned(r.slots_minus_picks))}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>

  ${failures.length ? `<div class="meta" style="margin-top:14px;color:#ffd479;">
    Note: ${failures.length} row(s) could not match a team name between the sheet and Fantrax.
  </div>` : ``}
</div>

<script>
(async function(){
  // Optional: live-refresh the page data without needing rebuilds for viewers
  // This only works if Actions keeps updating public/data.json.
  try {
    const res = await fetch("./data.json", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    // If you want auto-refresh UI, we can add it later.
  } catch (_) {}
})();
</script>
</body>
</html>`;

  fs.writeFileSync("public/index.html", html);

  console.log("Wrote public/data.json and public/index.html");
  console.log("Rows:", rows.length, "| Failures:", failures.length);
}

build();
