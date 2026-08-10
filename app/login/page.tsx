import { chatGPTSignInPath, getChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getChatGPTUser();
  const destination = user ? "/account" : chatGPTSignInPath("/account");

  return <main className="account-shell">
    <header className="account-topbar"><div className="account-brand"><span>STRIKE</span>YARD</div><a className="account-back" href="/">← MAIN MENU</a></header>
    <section className="auth-panel">
      <div className="auth-kicker">OPERATOR IDENTIFICATION</div>
      <h1>ENTER THE <span>YARD</span></h1>
      <p className="auth-intro">Sign in to keep your operator profile, progression, match record, and future unlocks connected across sessions.</p>
      <div className="auth-grid">
        <article className="auth-card primary"><small>RETURNING OPERATOR</small><h2>LOGIN</h2><p>Verify your identity and continue with your existing Strikeyard operator profile.</p><a className="auth-action" href={destination}>{user ? "CONTINUE TO ACCOUNT" : "LOGIN WITH CHATGPT"}</a></article>
        <article className="auth-card"><small>NEW RECRUIT</small><h2>CREATE ACCOUNT</h2><p>Use a verified ChatGPT identity to create a new game profile. No game password is stored.</p><a className="auth-action" href={destination}>{user ? "CREATE OPERATOR PROFILE" : "SIGN UP WITH CHATGPT"}</a></article>
      </div>
    </section>
  </main>;
}
