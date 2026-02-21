const fs = require("fs");
require("dotenv").config();
const { request } = require("playwright");

const LEAGUE_ID = process.env.LEAGUE_ID || "71wm5vfrmg5kp4my";
const AUTH_STATE = process.env.AUTH_STATE || "auth.json";

if (!fs.existsSync(AUTH_STATE)) {
  console.error(`Missing ${AUTH_STATE}. You need auth.json present in this folder.`);
  process.exit(1);
}

// Your provided teams (source of truth)
const TEAMS = [
  { teamName: "Le Machine a laver", teamId: "62nylldamg5kp4n9" },
  { teamName: "bombo balboni", teamId: "dv4xjllimg5kp4n8" },
  { teamName: "default", teamId: "fed8sp5ymg5kp4n7" },
  { teamName: "derek summers", teamId: "r019uq07mg5kp4n6" },
  { teamName: "gay cowboy rapper", teamId: "ep6rovqsmg5kp4n2" },
  { teamName: "Lord Blueberry", teamId: "yumiw4e8mg5kp4n8" },
  { teamName: "Meme au lait", teamId: "t45lmaukmg5kp4n3" },
  { teamName: "phoebe cates", teamId: "pzx4616vmg5kp4n5" },
  { teamName: "swedish energy", teamId: "4sn4uyz1mg5kp4nb" },
  { teamName: "The blacockos", teamId: "0ywrnu9vmg5kp4n4" },
  { teamName: "swayzaurs", teamId: "0b95pp3amg5kp4n3" },
  { teamName: "zack & miri", teamId: "3k9bqxlwmg5kp4na" },
];

function extractMinorsTotals(teamRosterInfoJson) {
  const statusTotals = teamRosterInfoJson?.responses?.[0]?.data?.miscData?.statusTotals;
  if (!Array.isArray(statusTotals)) return null;

  const minors = statusTotals.find(
    (x) => String(x?.name || "").trim().toLowerCase() === "minors"
  );
  if (!minors) return null;

  const rostered = Number(minors.total);
  const cap = Number(minors.max);

  if (!Number.isFinite(rostered) || !Number.isFinite(cap)) return null;
  return { rostered, cap };
}

function buildPayload(teamId) {
  // Matches what you captured:
  // {"msgs":[{"method":"getTeamRosterInfo","data":{"leagueId":"...","teamId":"..."}}], ...}
  return {
    msgs: [{ method: "getTeamRosterInfo", data: { leagueId: LEAGUE_ID, teamId } }],
    uiv: 3,
    refUrl: `https://www.fantrax.com/fantasy/league/${LEAGUE_ID}/team/roster;teamId=${teamId}`,
    dt: 0,
    at: 0,
    av: "0.0",
    tz: "America/Chicago",
    v: "179.0.1",
  };
}

async function main() {
  console.log("Creating authenticated request context from:", AUTH_STATE);

  const ctx = await request.newContext({
    storageState: AUTH_STATE,
    // Fantrax can be fussy about UA; this usually helps.
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  });

  const results = [];
  const failures = [];

  for (const t of TEAMS) {
    process.stdout.write(`Checking: ${t.teamName} … `);

    try {
      const url = `https://www.fantrax.com/fxpa/req?leagueId=${LEAGUE_ID}`;
      const payload = buildPayload(t.teamId);

      const resp = await ctx.post(url, {
        headers: { "content-type": "application/json" },
        data: payload,
        timeout: 60000,
      });

      if (!resp.ok()) {
        throw new Error(`HTTP ${resp.status()} ${resp.statusText()}`);
      }

      const json = await resp.json();

      const minors = extractMinorsTotals(json);
      if (!minors) {
        // Write the raw response for this team so we can inspect exactly what differs.
        const dump = `team_${t.teamId}_rosterInfo.json`;
        fs.writeFileSync(dump, JSON.stringify(json, null, 2));
        process.stdout.write(`FAIL (no Minors totals; dumped ${dump})\n`);
        failures.push({
          teamName: t.teamName,
          teamId: t.teamId,
          url: `https://www.fantrax.com/fantasy/league/${LEAGUE_ID}/team/roster;teamId=${t.teamId}`,
          reason: "Minors totals not found in miscData.statusTotals",
          dump,
        });
        continue;
      }

      const openSlots = minors.cap - minors.rostered;

      results.push({
        teamName: t.teamName,
        teamId: t.teamId,
        minorsRostered: minors.rostered,
        minorsCap: minors.cap,
        openSlots,
        url: `https://www.fantrax.com/fantasy/league/${LEAGUE_ID}/team/roster;teamId=${t.teamId}`,
      });

      process.stdout.write(`OK (${minors.rostered}/${minors.cap})\n`);
    } catch (e) {
      process.stdout.write("ERROR\n");
      failures.push({
        teamName: t.teamName,
        teamId: t.teamId,
        url: `https://www.fantrax.com/fantasy/league/${LEAGUE_ID}/team/roster;teamId=${t.teamId}`,
        reason: String(e?.message || e),
      });
    }
  }

  await ctx.dispose();

  fs.writeFileSync("roster_counts.json", JSON.stringify({ results, failures }, null, 2));
  console.log("\nWrote roster_counts.json\n");

  console.table(
    results
      .slice()
      .sort((a, b) => a.teamName.localeCompare(b.teamName))
      .map((r) => ({
        team: r.teamName,
        minors: `${r.minorsRostered}/${r.minorsCap}`,
        openSlots: r.openSlots,
      }))
  );

  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) =>
      console.log("-", f.teamName, "|", f.reason, f.dump ? `| dump=${f.dump}` : "")
    );
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
