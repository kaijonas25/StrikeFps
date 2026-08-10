"use client";

import { FormEvent, useEffect, useState } from "react";
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "../firebase";

type Mode = "login" | "signup" | "reset";

function friendlyError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("invalid-credential")) return "Email or password is incorrect.";
  if (code.includes("email-already-in-use")) return "An account already uses this email.";
  if (code.includes("weak-password")) return "Password must contain at least 6 characters.";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a moment and try again.";
  return "Account service is unavailable. Please try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [callsign, setCallsign] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => onAuthStateChanged(auth, (user) => { if (user) router.replace("/account"); }), [router]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (mode === "signup" && password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (mode === "signup" && callsign.trim().length < 3) { setError("Callsign must be at least 3 characters."); return; }
    setBusy(true);
    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email.trim());
        setMessage("Password reset email sent. Check your inbox.");
      } else if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: callsign.trim().toUpperCase().slice(0, 18) });
        router.replace("/account");
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        router.replace("/account");
      }
    } catch (problem) { setError(friendlyError(problem)); }
    finally { setBusy(false); }
  }

  return <main className="account-shell">
    <header className="account-topbar"><div className="account-brand"><span>STRIKE</span>YARD</div><a className="account-back" href="/">← MAIN MENU</a></header>
    <section className="auth-panel auth-form-panel">
      <div className="auth-kicker">OPERATOR IDENTIFICATION</div>
      <h1>{mode === "signup" ? <>CREATE <span>ACCOUNT</span></> : mode === "reset" ? <>RESET <span>ACCESS</span></> : <>OPERATOR <span>LOGIN</span></>}</h1>
      <p className="auth-intro">{mode === "signup" ? "Create a Strikeyard operator account to save your identity, progression, and combat record." : mode === "reset" ? "Enter your account email and Firebase will send a secure reset link." : "Enter your Strikeyard email and password to access your operator profile."}</p>
      <form className="game-auth-form" onSubmit={submit}>
        {mode === "signup" && <label>CALLSIGN<input value={callsign} onChange={(event) => setCallsign(event.target.value)} maxLength={18} autoComplete="nickname" required placeholder="OPERATOR NAME" /></label>}
        <label>EMAIL<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="operator@example.com" /></label>
        {mode !== "reset" && <label>PASSWORD<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} required placeholder="••••••••" /></label>}
        {mode === "signup" && <label>CONFIRM PASSWORD<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={6} autoComplete="new-password" required placeholder="••••••••" /></label>}
        {error && <div className="auth-feedback error">{error}</div>}{message && <div className="auth-feedback success">{message}</div>}
        <button className="auth-submit" disabled={busy}>{busy ? "PROCESSING…" : mode === "signup" ? "CREATE OPERATOR" : mode === "reset" ? "SEND RESET LINK" : "LOGIN"}</button>
      </form>
      <div className="auth-switches">
        {mode !== "login" && <button onClick={() => { setMode("login"); setError(""); setMessage(""); }}>RETURN TO LOGIN</button>}
        {mode === "login" && <><button onClick={() => { setMode("signup"); setError(""); }}>CREATE NEW ACCOUNT</button><button onClick={() => { setMode("reset"); setError(""); }}>FORGOT PASSWORD?</button></>}
      </div>
      <p className="auth-security">SECURED BY FIREBASE AUTHENTICATION · STRIKEYARD NEVER STORES YOUR PASSWORD</p>
    </section>
  </main>;
}
