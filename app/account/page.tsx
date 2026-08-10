import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { players } from "../../db/schema";
import { chatGPTSignOutPath, requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

function defaultCallsign(email: string) {
  const base = email.split("@")[0]?.replace(/[^a-z0-9_-]/gi, "").slice(0, 18);
  return (base || "OPERATOR").toUpperCase();
}

export default async function AccountPage() {
  const user = await requireChatGPTUser("/account");
  const db = getDb();
  await db.insert(players).values({ id: user.userId, email: user.email, callsign: defaultCallsign(user.email) }).onConflictDoUpdate({ target: players.id, set: { email: user.email } });
  const [player] = await db.select().from(players).where(eq(players.id, user.userId)).limit(1);

  return <main className="account-shell">
    <header className="account-topbar"><div className="account-brand"><span>STRIKE</span>YARD</div><a className="account-back" href="/">← MAIN MENU</a></header>
    <section className="profile-header"><div><small>ACTIVE OPERATOR PROFILE</small><h1><span>ACCOUNT</span> RECORD</h1></div><a className="signout" href={chatGPTSignOutPath("/")}>SIGN OUT</a></section>
    <section className="profile-grid">
      <article className="profile-card identity-card"><small>IDENTIFICATION</small><strong>{player.callsign}</strong><p>{user.email}</p><div className="level-badge"><b>{player.level}</b><span>OPERATOR LEVEL</span></div></article>
      <article className="profile-card"><small>COMBAT RECORD</small><div className="stat-grid"><div><strong>{player.matchesPlayed}</strong><span>MATCHES</span></div><div><strong>{player.wins}</strong><span>WINS</span></div><div><strong>{player.kills}</strong><span>KILLS</span></div><div><strong>{player.deaths}</strong><span>DEATHS</span></div></div><p className="profile-note">Your account is ready. Match results and progression can now be connected to this persistent operator record.</p></article>
    </section>
  </main>;
}
