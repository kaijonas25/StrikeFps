import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { players } from "../../../db/schema";

const FIREBASE_API_KEY = "AIzaSyBblKzSnl4XD7afgjqXETtVEhZyADn4-3s";
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
  return Response.json({ player });
}
