import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { adminRoles } from "../../../db/schema";

const FIREBASE_API_KEY = "AIzaSyBblKzSnl4XD7afgjqXETtVEhZyADn4-3s";
const OWNER_EMAIL = "kaigarcia2510@gmail.com";
type FirebaseAccount = { email: string };

async function verifiedOwner(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: authorization.slice(7) }),
  });
  if (!response.ok) return false;
  const payload = await response.json() as { users?: FirebaseAccount[] };
  return payload.users?.[0]?.email?.toLowerCase() === OWNER_EMAIL;
}

export async function GET(request: Request) {
  if (!await verifiedOwner(request)) return Response.json({ error: "Owner access required" }, { status: 403 });
  const grants = await getDb().select({ email: adminRoles.email, role: adminRoles.role }).from(adminRoles);
  return Response.json({ grants: [{ email: OWNER_EMAIL, role: "owner", locked: true }, ...grants.filter((grant) => grant.email !== OWNER_EMAIL)] });
}

export async function PUT(request: Request) {
  if (!await verifiedOwner(request)) return Response.json({ error: "Owner access required" }, { status: 403 });
  const payload = await request.json() as { email?: string; role?: "owner" | "junior" | "none" };
  const email = payload.email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!payload.role || !["owner", "junior", "none"].includes(payload.role)) return Response.json({ error: "Choose an admin role." }, { status: 400 });
  if (email === OWNER_EMAIL) return Response.json({ error: "Your owner access cannot be removed or changed." }, { status: 400 });
  const db = getDb();
  if (payload.role === "none") await db.delete(adminRoles).where(eq(adminRoles.email, email));
  else await db.insert(adminRoles).values({ email, role: payload.role }).onConflictDoUpdate({ target: adminRoles.email, set: { role: payload.role, updatedAt: new Date().toISOString() } });
  return Response.json({ saved: true, email, role: payload.role });
}
