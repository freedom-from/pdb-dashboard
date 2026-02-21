import fs from "node:fs";
import path from "node:path";

const SPREADSHEET_ID = "1bSK7vRbCXBJbzyG1mk6OEED8fMZQtyrS";
const GID = "1555158191"; // Draft Pick Summary

// Sheet rows 14–25 inclusive (1-based)
const ROW_START = 14;
const ROW_END = 25;

// Column A = Owner (0-based index 0)
const COL_OWNER_A = 0;

// Column I = required roster spots count (A=0 ... I=8)
const COL_REQUIRED_I = 8;

// Your explicit owner->team mapping (authoritative)
const OWNER_TO_TEAM = new Map([
  ["Matthew St-Germain", "Le Machine a laver"],
  ["Jacob Vass", "bombo balboni"],
  ["Patrick Jackson", "default"],
  ["Erik Dahl", "derek summers"],
  ["Wes Schurter", "gay cowboy rapper"],
  ["Kyle Eidsness", "Lord Blueberry"],
  ["Clover Goetze", "Meme au lait"],
  ["Matthew gille", "phoebe cates"],
  ["Matthew Gille", "phoebe cates"], // guard for capitalization
  ["Andy Larson", "swedish energy"],
  ["Hank Hormann", "The blacockos"],
  ["Jesse Hoffman", "swayzaurs"],
  ["Ryan Pittman", "zack & miri"],
]);

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseCSV(csvText) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }

    if (ch === "\r") continue;

    cur += ch;
  }

  row.push(cur);
  rows.push(row);

  while (rows.length && rows[rows.length - 1].every((c) => String(c ?? "").trim() === "")) {
    rows.pop();
  }

  return rows;
}

async function fetchCSV() {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GID}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to fetch CSV (${res.status})`);
  return await res.text();
}

function loadRosterCounts() {
  const fp = path.join(process.cwd(), "roster_counts.json");
  if (!fs.existsSync(fp)) throw new Error("Missing roster_counts.json. Run roster_counts.js first.");

  const j = JSON.parse(fs.readFileSync(fp, "utf8"));
  const results = Array.isArray(j?.results) ? j.results : [];

  const byTeam = new Map();
  for (const r of results) {
    const teamName = r?.teamName;
    if (!teamName) continue;
    byTeam.set(norm(teamName), r);
  }
  return byTeam;
}

function toIntLoose(x) {
  const s = String(x ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  console.log(`Fetching Draft Pick Summary CSV (gid=${GID}) …`);
  const csv = await fetchCSV();
  const rows = parseCSV(csv);

  if (rows.length < ROW_END) {
    throw new Error(`CSV only has ${rows.length} rows; can't read through sheet row ${ROW_END}.`);
  }

  const idxStart = ROW_START - 1;
  const idxEnd = ROW_END - 1;
  const slice = rows.slice(idxStart, idxEnd + 1);

  const rosterByTeam = loadRosterCounts();

  const report = [];
  const failures = [];

  for (let i = 0; i < slice.length; i++) {
    const sheetRowNumber = ROW_START + i;
    const r = slice[i];

    const ownerRaw = String(r[COL_OWNER_A] ?? "").trim();
    const required = toIntLoose(r[COL_REQUIRED_I]);

    if (!ownerRaw) {
      failures.push({ sheetRowNumber, reason: "Missing owner in column A", row: r });
      continue;
    }
    if (required === null) {
      failures.push({ sheetRowNumber, owner: ownerRaw, reason: "Missing/invalid required roster spots in column I", row: r });
      continue;
    }

    // Resolve owner -> team via your mapping (case/spacing tolerant)
    let teamName = OWNER_TO_TEAM.get(ownerRaw);
    if (!teamName) {
      // fallback: try normalized owner keys
      const ownerN = norm(ownerRaw);
      for (const [k, v] of OWNER_TO_TEAM.entries()) {
        if (norm(k) === ownerN) {
          teamName = v;
          break;
        }
      }
    }

    if (!teamName) {
      failures.push({ sheetRowNumber, owner: ownerRaw, reason: "Owner not found in OWNER_TO_TEAM mapping" });
      continue;
    }

    const roster = rosterByTeam.get(norm(teamName));
    const minorsOpenSlots =
      roster && typeof roster.openSlots === "number" ? roster.openSlots : null;

    if (minorsOpenSlots === null) {
      failures.push({
        sheetRowNumber,
        owner: ownerRaw,
        team: teamName,
        reason: "Team not found in roster_counts.json (team name mismatch)",
      });
      continue;
    }

    report.push({
      owner: ownerRaw,
      team: teamName,
      requiredRosterSpots: required,
      minorsOpenSlots,
      open_minus_required: minorsOpenSlots - required,
    });
  }

  // Most in trouble first (most negative)
  report.sort((a, b) => a.open_minus_required - b.open_minus_required);

  const out = {
    generatedAt: new Date().toISOString(),
    sheet: {
      spreadsheetId: SPREADSHEET_ID,
      gid: GID,
      rows: `${ROW_START}-${ROW_END}`,
      columnsUsed: { owner: "A", requiredRosterSpots: "I" },
      join: "Owner(A) -> Team(mapping) -> Fantrax(openSlots)",
    },
    report,
    failures,
  };

  fs.writeFileSync("picks_2026_milb_report.json", JSON.stringify(out, null, 2));

  console.log(`\nWrote picks_2026_milb_report.json`);
  console.log(`Rows processed: ${slice.length}`);
  console.log(`Matched: ${report.length}`);
  console.log(`Failures: ${failures.length}\n`);

  console.table(
    report.map((r) => ({
      owner: r.owner,
      team: r.team,
      required: r.requiredRosterSpots,
      minorsOpenSlots: r.minorsOpenSlots,
      open_minus_required: r.open_minus_required,
    }))
  );

  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("-", f));
  }
}

main().catch((e) => {
  console.error("Fatal:", e?.stack ?? e?.message ?? e);
  process.exit(1);
});
