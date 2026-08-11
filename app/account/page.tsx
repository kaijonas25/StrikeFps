"use client";

import { onAuthStateChanged, signOut, updateProfile, User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "../firebase";

type Player = { callsign: string; level: number; experience: number; matchesPlayed: number; wins: number; kills: number; deaths: number };
type AdminStatus = "idle" | "saving" | "saved" | "error";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminStatus, setAdminStatus] = useState<AdminStatus>("idle");
  const [adminError, setAdminError] = useState("");
  const [nickname, setNickname] = useState("");
  const [nicknameStatus, setNicknameStatus] = useState<AdminStatus>("idle");
  const [nicknameError, setNicknameError] = useState("");

  useEffect(() => onAuthStateChanged(auth, async (currentUser) => {
    if (!currentUser) { router.replace("/login"); return; }
    setUser(currentUser);
    const token = await currentUser.getIdToken();
    const response = await fetch("/api/player", { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) {
      const data = await response.json() as { player: Player; isAdmin?: boolean };
      setPlayer(data.player);
      setNickname(data.player.callsign);
      setIsAdmin(Boolean(data.isAdmin));
    }
  }), [router]);

  const setStat = (field: Exclude<keyof Player, "callsign">, value: string) => {
    const parsed = Number(value);
    setPlayer((current) => current ? { ...current, [field]: Number.isFinite(parsed) ? Math.max(field === "level" ? 1 : 0, Math.trunc(parsed)) : field === "level" ? 1 : 0 } : current);
    setAdminStatus("idle");
  };

  const saveAdminStats = async (stats: Player) => {
    if (!user || !isAdmin) return;
    setAdminStatus("saving");
    setAdminError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/player", {
        method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ adminStats: {
          level: stats.level, experience: stats.experience, matchesPlayed: stats.matchesPlayed,
          wins: stats.wins, kills: stats.kills, deaths: stats.deaths,
        } }),
      });
      const data = await response.json() as { error?: string; player?: Partial<Player> };
      if (!response.ok) throw new Error(data.error || "Unable to save admin changes");
      setPlayer((current) => current ? { ...current, ...data.player } : current);
      setAdminStatus("saved");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to save admin changes");
      setAdminStatus("error");
    }
  };

  const saveNickname = async () => {
    if (!user) return;
    const cleaned = nickname.trim().replace(/\s+/g, " ").toUpperCase();
    if (cleaned.length < 3 || cleaned.length > 18) { setNicknameError("Nickname must be 3–18 characters."); setNicknameStatus("error"); return; }
    if (!/^[A-Z0-9 _-]+$/.test(cleaned)) { setNicknameError("Use letters, numbers, spaces, dashes, or underscores."); setNicknameStatus("error"); return; }
    setNicknameStatus("saving"); setNicknameError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/player", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ callsign: cleaned }) });
      const data = await response.json() as { callsign?: string; error?: string };
      if (!response.ok || !data.callsign) throw new Error(data.error || "Unable to save nickname.");
      setNickname(data.callsign); setPlayer((current) => current ? { ...current, callsign: data.callsign! } : current); setNicknameStatus("saved");
      try { await updateProfile(user, { displayName: data.callsign }); } catch { /* The database remains the authoritative nickname. */ }
    } catch (error) { setNicknameError(error instanceof Error ? error.message : "Unable to save nickname."); setNicknameStatus("error"); }
  };

  if (!user || !player) return <main className="account-shell account-loading"><div>LOADING OPERATOR RECORD…</div></main>;

  return <main className="account-shell">
    <header className="account-topbar"><div className="account-brand"><span>STRIKE</span>YARD</div><button type="button" className="account-back" onClick={() => window.location.assign("/")}>← MAIN MENU</button></header>
    <section className="profile-header"><div><small>ACTIVE OPERATOR PROFILE</small><h1><span>ACCOUNT</span> RECORD</h1></div><button className="signout" onClick={async () => { await signOut(auth); router.replace("/"); }}>SIGN OUT</button></section>
    <section className="profile-grid">
      <article className="profile-card identity-card"><small>IDENTIFICATION</small><strong>{player.callsign}</strong><p>{user.email}</p><div className="nickname-editor"><label htmlFor="nickname">CUSTOM NICKNAME</label><div><input id="nickname" value={nickname} maxLength={18} onChange={(event) => { setNickname(event.target.value); setNicknameStatus("idle"); }} /><button disabled={nicknameStatus === "saving" || nickname.trim().toUpperCase() === player.callsign} onClick={() => void saveNickname()}>{nicknameStatus === "saving" ? "SAVING…" : "SAVE"}</button></div><span className={nicknameStatus}>{nicknameStatus === "saved" ? "NICKNAME UPDATED" : nicknameStatus === "error" ? nicknameError : "3–18 CHARACTERS"}</span></div><div className="level-badge"><b>{player.level}</b><span>OPERATOR LEVEL</span></div></article>
      <article className="profile-card"><small>COMBAT RECORD</small><div className="stat-grid"><div><strong>{player.matchesPlayed}</strong><span>MATCHES</span></div><div><strong>{player.wins}</strong><span>WINS</span></div><div><strong>{player.kills}</strong><span>KILLS</span></div><div><strong>{player.deaths}</strong><span>DEATHS</span></div></div><p className="profile-note">This Firebase identity is connected to your persistent Strikeyard operator record.</p></article>
    </section>
    {isAdmin && <section className="admin-panel">
      <div className="admin-heading"><div><small>AUTHORIZED ACCOUNT ONLY</small><h2>DEVELOPER <span>CONTROL PANEL</span></h2></div><b>ADMIN ACCESS</b></div>
      <p>Changes apply to your persistent operator record. Wins cannot exceed matches played.</p>
      <div className="admin-stat-grid">
        {([ ["level", "LEVEL"], ["experience", "EXPERIENCE"], ["matchesPlayed", "MATCHES"], ["wins", "WINS"], ["kills", "KILLS"], ["deaths", "DEATHS"] ] as const).map(([field, label]) =>
          <label key={field}><span>{label}</span><input type="number" min={field === "level" ? 1 : 0} value={player[field]} onChange={(event) => setStat(field, event.target.value)} /></label>)}
      </div>
      <div className="admin-actions">
        <button disabled={adminStatus === "saving"} onClick={() => void saveAdminStats(player)}>{adminStatus === "saving" ? "SAVING…" : "SAVE CHANGES"}</button>
        <button className="admin-reset" disabled={adminStatus === "saving"} onClick={() => { setPlayer({ ...player, level: 1, experience: 0, matchesPlayed: 0, wins: 0, kills: 0, deaths: 0 }); setAdminStatus("idle"); }}>RESET VALUES</button>
        <span className={adminStatus}>{adminStatus === "saved" ? "CHANGES SAVED" : adminStatus === "error" ? adminError : ""}</span>
      </div>
    </section>}
  </main>;
}
