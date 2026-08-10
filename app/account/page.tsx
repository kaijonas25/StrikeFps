"use client";

import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "../firebase";

type Player = { callsign: string; level: number; experience: number; matchesPlayed: number; wins: number; kills: number; deaths: number };

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);

  useEffect(() => onAuthStateChanged(auth, async (currentUser) => {
    if (!currentUser) { router.replace("/login"); return; }
    setUser(currentUser);
    const token = await currentUser.getIdToken();
    const response = await fetch("/api/player", { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) setPlayer((await response.json()).player);
  }), [router]);

  if (!user || !player) return <main className="account-shell account-loading"><div>LOADING OPERATOR RECORD…</div></main>;

  return <main className="account-shell">
    <header className="account-topbar"><div className="account-brand"><span>STRIKE</span>YARD</div><a className="account-back" href="/">← MAIN MENU</a></header>
    <section className="profile-header"><div><small>ACTIVE OPERATOR PROFILE</small><h1><span>ACCOUNT</span> RECORD</h1></div><button className="signout" onClick={async () => { await signOut(auth); router.replace("/"); }}>SIGN OUT</button></section>
    <section className="profile-grid">
      <article className="profile-card identity-card"><small>IDENTIFICATION</small><strong>{player.callsign}</strong><p>{user.email}</p><div className="level-badge"><b>{player.level}</b><span>OPERATOR LEVEL</span></div></article>
      <article className="profile-card"><small>COMBAT RECORD</small><div className="stat-grid"><div><strong>{player.matchesPlayed}</strong><span>MATCHES</span></div><div><strong>{player.wins}</strong><span>WINS</span></div><div><strong>{player.kills}</strong><span>KILLS</span></div><div><strong>{player.deaths}</strong><span>DEATHS</span></div></div><p className="profile-note">This Firebase identity is connected to your persistent Strikeyard operator record.</p></article>
    </section>
  </main>;
}
