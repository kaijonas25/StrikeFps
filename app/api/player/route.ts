import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { playerMatchResults, players } from "../../../db/schema";

const FIREBASE_API_KEY = "AIzaSyBblKzSnl4XD7afgjqXETtVEhZyADn4-3s";
const ADMIN_EMAIL = "kaigarcia2510@gmail.com";
type FirebaseAccount = { localId: string; email: string; displayName?: string };

async function verifiedAccount(request: Request): Promise<FirebaseAccount | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: authorization.slice(7) }),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { users?: FirebaseAccount[] };
  return payload.users?.[0] ?? null;
}

export async function GET(request: Request) {
  const account = await verifiedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const fallbackCallsign = account.email.split("@")[0].replace(/[^a-z0-9_-]/gi, "").slice(0, 18).toUpperCase() || "OPERATOR";
  const callsign = account.displayName?.trim().slice(0, 18).toUpperCase() || fallbackCallsign;
  const db = getDb();
  await db.insert(players).values({ id: account.localId, email: account.email, callsign }).onConflictDoUpdate({ target: players.id, set: { email: account.email, callsign } });
  const [player] = await db.select().from(players).where(eq(players.id, account.localId)).limit(1);
  return Response.json({
    isAdmin: account.email.toLowerCase() === ADMIN_EMAIL,
    player: {
      ...player,
      loadout: JSON.parse(player.loadoutJson),
      operator: JSON.parse(player.operatorJson),
      loadoutJson: undefined,
      operatorJson: undefined,
    },
  });
}

export async function PUT(request: Request) {
  const account = await verifiedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json() as { loadout?: unknown; operator?: unknown };
  const updates: { loadoutJson?: string; operatorJson?: string; updatedAt: string } = { updatedAt: new Date().toISOString() };
  if (payload.loadout && typeof payload.loadout === "object") updates.loadoutJson = JSON.stringify(payload.loadout);
  if (payload.operator && typeof payload.operator === "object") updates.operatorJson = JSON.stringify(payload.operator);
  if (!updates.loadoutJson && !updates.operatorJson) return Response.json({ error: "No preferences supplied" }, { status: 400 });
  if ((updates.loadoutJson?.length ?? 0) > 8_000 || (updates.operatorJson?.length ?? 0) > 8_000) return Response.json({ error: "Preferences are too large" }, { status: 413 });
  const db = getDb();
  const existing = await db.select({ id: players.id }).from(players).where(eq(players.id, account.localId)).limit(1);
  if (!existing.length) {
    const fallbackCallsign = account.email.split("@")[0].replace(/[^a-z0-9_-]/gi, "").slice(0, 18).toUpperCase() || "OPERATOR";
    await db.insert(players).values({ id: account.localId, email: account.email, callsign: account.displayName?.trim().slice(0, 18).toUpperCase() || fallbackCallsign, ...updates });
  } else {
    await db.update(players).set(updates).where(eq(players.id, account.localId));
  }
  return Response.json({ saved: true });
}

export async function PATCH(request: Request) {
  const account = await verifiedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json() as { callsign?: string };
  const callsign = payload.callsign?.trim().replace(/\s+/g, " ").toUpperCase() ?? "";
  if (callsign.length < 3 || callsign.length > 18) return Response.json({ error: "Nickname must be 3–18 characters." }, { status: 400 });
  if (!/^[A-Z0-9 _-]+$/.test(callsign)) return Response.json({ error: "Use letters, numbers, spaces, dashes, or underscores." }, { status: 400 });
  const db = getDb();
  const existing = await db.select({ id: players.id }).from(players).where(eq(players.id, account.localId)).limit(1);
  if (!existing.length) await db.insert(players).values({ id: account.localId, email: account.email, callsign });
  else await db.update(players).set({ callsign, updatedAt: new Date().toISOString() }).where(eq(players.id, account.localId));
  return Response.json({ callsign });
}

export async function POST(request: Request) {
  const account = await verifiedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json() as { matchId?: string; kills?: number; deaths?: number; won?: boolean };
  const matchId = payload.matchId?.trim() ?? "";
  const kills = payload.kills, deaths = payload.deaths;
  if (!/^[A-Z0-9 _:-]{8,80}$/i.test(matchId) || !Number.isInteger(kills) || !Number.isInteger(deaths) || kills! < 0 || deaths! < 0 || kills! > 500 || deaths! > 500 || typeof payload.won !== "boolean") {
    return Response.json({ error: "Invalid match result" }, { status: 400 });
  }
  const db = getDb();
  const fallbackCallsign = account.email.split("@")[0].replace(/[^a-z0-9_-]/gi, "").slice(0, 18).toUpperCase() || "OPERATOR";
  await db.insert(players).values({ id: account.localId, email: account.email, callsign: account.displayName?.trim().slice(0, 18).toUpperCase() || fallbackCallsign }).onConflictDoNothing();
  const resultId = `${account.localId}:${matchId}`;
  const inserted = await db.insert(playerMatchResults).values({ id: resultId, playerId: account.localId, matchId, kills: kills!, deaths: deaths!, won: payload.won }).onConflictDoNothing().returning({ id: playerMatchResults.id });
  if (inserted.length) {
    await db.update(players).set({
      matchesPlayed: sql`${players.matchesPlayed} + 1`,
      wins: sql`${players.wins} + ${payload.won ? 1 : 0}`,
      kills: sql`${players.kills} + ${kills!}`,
      deaths: sql`${players.deaths} + ${deaths!}`,
      updatedAt: new Date().toISOString(),
    }).where(eq(players.id, account.localId));
  }
  const [player] = await db.select().from(players).where(eq(players.id, account.localId)).limit(1);
  return Response.json({ saved: true, duplicate: !inserted.length, player });
}
