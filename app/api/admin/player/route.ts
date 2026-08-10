import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { players } from "../../../../db/schema";

const FIREBASE_API_KEY = "AIzaSyBblKzSnl4XD7afgjqXETtVEhZyADn4-3s";
const ADMIN_EMAIL = "kaigarcia2510@gmail.com";

type FirebaseAccount = { localId: string; email: string };
type EditableStats = { level: number; experience: number; matchesPlayed: number; wins: number; kills: number; deaths: number };

async function verifiedAdmin(request: Request): Promise<FirebaseAccount | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: authorization.slice(7) }),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { users?: FirebaseAccount[] };
  const account = payload.users?.[0];
  return account?.email.toLowerCase() === ADMIN_EMAIL ? account : null;
}

function validInteger(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

export async function PUT(request: Request) {
  const account = await verifiedAdmin(request);
  if (!account) return Response.json({ error: "Admin access required" }, { status: 403 });
  const payload = await request.json() as Partial<EditableStats>;
  const stats: EditableStats = {
    level: payload.level as number, experience: payload.experience as number, matchesPlayed: payload.matchesPlayed as number,
    wins: payload.wins as number, kills: payload.kills as number, deaths: payload.deaths as number,
  };
  if (!validInteger(stats.level, 1, 1000) || !validInteger(stats.experience, 0, 100_000_000) ||
      !validInteger(stats.matchesPlayed, 0, 10_000_000) || !validInteger(stats.wins, 0, stats.matchesPlayed) ||
      !validInteger(stats.kills, 0, 100_000_000) || !validInteger(stats.deaths, 0, 100_000_000)) {
    return Response.json({ error: "Invalid stat values" }, { status: 400 });
  }
  const db = getDb();
  const existing = await db.select({ id: players.id }).from(players).where(eq(players.id, account.localId)).limit(1);
  if (!existing.length) return Response.json({ error: "Player record not found" }, { status: 404 });
  await db.update(players).set({ ...stats, updatedAt: new Date().toISOString() }).where(eq(players.id, account.localId));
  return Response.json({ saved: true, player: stats });
}
