// src/App.jsx

import { useCallback, useEffect, useState } from "react";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatINR(amountMinor) {
  return Number.isSafeInteger(amountMinor)
    ? money.format(amountMinor / 100)
    : "—";
}

async function readResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text || "Unexpected server response." };
  }
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "??";
}

const isAuthError = (status, message = "") =>
  status === 401 ||
  /unauthorized|login to continue|not authenticated|invalid token|token expired/i.test(message);

const isErrorNotice = (msg = "") =>
  /fail|error|invalid|unable|exceeded|different|greater|select/i.test(msg);

function passwordStrength(password) {
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const capped = Math.min(score, 4);
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["", "text-red-500", "text-amber-500", "text-blue-500", "text-emerald-600"];
  return { score: capped, label: labels[capped] || "Weak", color: colors[capped] || "text-red-500" };
}

// ─── Auth screen ──────────────────────────────────────────────────────────────
function AuthScreen({ onAuthSuccess }) {
  const [mode, setMode] = useState("login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400 text-xl font-black">
            B
          </div>
          <div>
            <h1 className="text-2xl font-bold">Backend Ledger</h1>
            <p className="text-sm text-slate-500">
              {mode === "login"
                ? "Sign in to your banking dashboard"
                : "Create your banking account"}
            </p>
          </div>
        </div>

        <div className="mb-6 flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
              mode === "login"
                ? "bg-slate-950 text-white shadow"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Log in
          </button>
          <button
            onClick={() => setMode("register")}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
              mode === "register"
                ? "bg-slate-950 text-white shadow"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Register
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          {mode === "login" ? (
            <LoginForm onSuccess={onAuthSuccess} onSwitch={() => setMode("register")} />
          ) : (
            <RegisterForm onSuccess={onAuthSuccess} onSwitch={() => setMode("login")} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Login form ───────────────────────────────────────────────────────────────
function LoginForm({ onSuccess, onSwitch }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.message || "Login failed.");
      onSuccess(data.user || null);
    } catch (err) {
      setError(err.message || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div>
        <label htmlFor="loginEmail" className="mb-2 block text-sm font-semibold">
          Email
        </label>
        <input
          id="loginEmail"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
          placeholder="you@example.com"
          required
        />
      </div>

      <div>
        <label htmlFor="loginPassword" className="mb-2 block text-sm font-semibold">
          Password
        </label>
        <input
          id="loginPassword"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-slate-950 px-5 py-3.5 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Logging in..." : "Log in"}
      </button>

      <p className="text-center text-sm text-slate-500">
        No account?{" "}
        <button
          type="button"
          onClick={onSwitch}
          className="font-semibold text-emerald-600 hover:underline"
        >
          Register here
        </button>
      </p>
    </form>
  );
}

// ─── Register form ────────────────────────────────────────────────────────────
function RegisterForm({ onSuccess, onSwitch }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = passwordStrength(password);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.message || "Registration failed.");
      // Pass user back — App will detect no accounts and show onboarding.
      onSuccess(data.user || null);
    } catch (err) {
      setError(err.message || "Registration failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div>
        <label htmlFor="regName" className="mb-2 block text-sm font-semibold">
          Full name
        </label>
        <input
          id="regName"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
          placeholder="Maansi Sharma"
          minLength={2}
          maxLength={80}
          required
        />
      </div>

      <div>
        <label htmlFor="regEmail" className="mb-2 block text-sm font-semibold">
          Email
        </label>
        <input
          id="regEmail"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
          placeholder="you@example.com"
          required
        />
      </div>

      <div>
        <label htmlFor="regPassword" className="mb-2 block text-sm font-semibold">
          Password
          <span className="ml-2 text-xs font-normal text-slate-400">(min. 12 characters)</span>
        </label>
        <input
          id="regPassword"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
          minLength={12}
          required
        />
        {password.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    strength.score >= level
                      ? strength.score <= 1
                        ? "bg-red-400"
                        : strength.score === 2
                          ? "bg-amber-400"
                          : strength.score === 3
                            ? "bg-blue-400"
                            : "bg-emerald-400"
                      : "bg-slate-200"
                  }`}
                />
              ))}
            </div>
            <p className={`text-xs font-medium ${strength.color}`}>{strength.label}</p>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="regConfirm" className="mb-2 block text-sm font-semibold">
          Confirm password
        </label>
        <input
          id="regConfirm"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={`w-full rounded-xl border px-4 py-3 outline-none focus:ring-4 ${
            confirmPassword.length > 0 && confirmPassword !== password
              ? "border-red-300 focus:border-red-400 focus:ring-red-50"
              : "border-slate-200 focus:border-emerald-500 focus:ring-emerald-50"
          }`}
          required
        />
        {confirmPassword.length > 0 && confirmPassword !== password && (
          <p className="mt-1 text-xs text-red-500">Passwords do not match.</p>
        )}
        {confirmPassword.length > 0 && confirmPassword === password && (
          <p className="mt-1 text-xs text-emerald-600">✓ Passwords match.</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || password !== confirmPassword || password.length < 12}
        className="w-full rounded-xl bg-emerald-500 px-5 py-3.5 font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
      >
        {loading ? "Creating account..." : "Create account"}
      </button>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitch}
          className="font-semibold text-emerald-600 hover:underline"
        >
          Log in
        </button>
      </p>
    </form>
  );
}

// ─── Onboarding screen ────────────────────────────────────────────────────────
// Shown after registration (or login) when the user has no accounts yet.
// Calls POST /api/accounts — a dedicated, auth-protected endpoint.
// Auth and account creation remain separate responsibilities.
function OnboardingScreen({ onAccountCreated }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleOpenAccount() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: "INR" }),
      });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.message || "Failed to open account.");
      onAccountCreated(data.account);
    } catch (err) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        {/* Progress indicator */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400 text-sm font-bold text-slate-950">
            ✓
          </div>
          <div className="h-0.5 flex-1 bg-emerald-400" />
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400 text-sm font-bold text-slate-950">
            2
          </div>
          <div className="h-0.5 flex-1 bg-slate-200" />
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-400">
            3
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
            <span className="text-3xl">🏦</span>
          </div>

          <h2 className="text-center text-2xl font-bold">Open your account</h2>
          <p className="mt-3 text-center text-sm leading-6 text-slate-500">
            Your profile is ready. The next step is to open an INR
            current account. This is where your balance and
            transactions will live.
          </p>

          {/* What you get */}
          <ul className="mt-6 space-y-3">
            {[
              { icon: "₹", text: "INR current account with zero balance" },
              { icon: "⇄", text: "Send and receive transfers instantly" },
              { icon: "📋", text: "Full transaction history and ledger" },
            ].map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-sm text-slate-600">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-base">
                  {item.icon}
                </span>
                {item.text}
              </li>
            ))}
          </ul>

          {error && (
            <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            onClick={handleOpenAccount}
            disabled={loading}
            className="mt-8 w-full rounded-xl bg-emerald-500 px-5 py-3.5 font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Opening account...
              </span>
            ) : (
              "Open INR account →"
            )}
          </button>

          <p className="mt-4 text-center text-xs text-slate-400">
            Additional account types can be added from the dashboard later.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [balance, setBalance] = useState(null);
  const [accountError, setAccountError] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [transactions, setTransactions] = useState([]);
  const [transactionError, setTransactionError] = useState("");
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const [activePage, setActivePage] = useState("Dashboard");
  const [showBalance, setShowBalance] = useState(true);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const selectedAccount = accounts.find(
    (a) => String(a._id) === selectedAccountId
  );

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setAccountError("");
    try {
      const res = await fetch("/api/accounts", {
        method: "GET",
        credentials: "include",
      });
      const data = await readResponse(res);
      if (!res.ok) {
        const err = new Error(data.message || "Unable to load your accounts.");
        err.status = res.status;
        throw err;
      }
      const result = Array.isArray(data)
        ? data
        : Array.isArray(data.accounts)
          ? data.accounts
          : null;
      if (!result) throw new Error("Unexpected accounts response format.");

      setAccounts(result);
      setSelectedAccountId((curr) => {
        if (result.some((a) => String(a._id) === curr)) return curr;
        const active = result.find((a) => a.status === "ACTIVE");
        return String((active || result[0])?._id || "");
      });
      return result;
    } catch (err) {
      setAccounts([]);
      setSelectedAccountId("");
      setBalance(null);
      setAccountError(err.message);
      throw err;
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  const loadBalance = useCallback(async () => {
    if (!selectedAccountId) { setBalance(null); return; }
    setLoadingBalance(true);
    try {
      const res = await fetch(`/api/accounts/balance/${selectedAccountId}`, {
        credentials: "include",
      });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.message || "Unable to load balance.");
      const value =
        data.balanceMinor ?? data.balance?.balanceMinor ?? data.balance;
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error("Unexpected balance response format.");
      setBalance(value);
    } catch (err) {
      setBalance(null);
      setAccountError(err.message);
    } finally {
      setLoadingBalance(false);
    }
  }, [selectedAccountId]);

  const loadTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    setTransactionError("");
    try {
      const res = await fetch("/api/transactions", {
        method: "GET",
        credentials: "include",
      });
      const data = await readResponse(res);
      if (!res.ok)
        throw new Error(data.message || "Unable to load transaction history.");
      const result = Array.isArray(data)
        ? data
        : Array.isArray(data.transactions)
          ? data.transactions
          : null;
      if (!result) throw new Error("Unexpected transaction history format.");
      setTransactions(result);
    } catch (err) {
      setTransactions([]);
      setTransactionError(err.message);
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  // Check existing session on mount.
  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      try {
        await loadAccounts();
        if (!cancelled) setIsLoggedIn(true);
      } catch (err) {
        if (!cancelled) {
          setIsLoggedIn(false);
          if (!isAuthError(err.status, err.message)) {
            console.warn("Session check failed:", err.message);
          }
        }
      } finally {
        if (!cancelled) setCheckingAuth(false);
      }
    }
    checkSession();
    return () => { cancelled = true; };
  }, [loadAccounts]);

  // Reload balance whenever selected account changes.
  useEffect(() => {
    if (isLoggedIn) loadBalance();
  }, [isLoggedIn, loadBalance]);

  // Load transactions once after login.
  useEffect(() => {
    if (isLoggedIn && accounts.length > 0) loadTransactions();
  }, [isLoggedIn, accounts.length, loadTransactions]);

  // Called by AuthScreen after successful login or register.
  async function handleAuthSuccess(user) {
    if (user) setCurrentUser(user);
    try {
      await loadAccounts();
    } catch {
      // loadAccounts sets its own error state; swallow here.
    }
    setIsLoggedIn(true);
  }

  // Called by OnboardingScreen after POST /api/accounts succeeds.
  function handleAccountCreated(account) {
    const normalised = account.account ?? account;
    setAccounts([normalised]);
    setSelectedAccountId(String(normalised._id));
    // Now that there's an account, load transactions (will be empty but sets up state).
    loadTransactions();
  }

  async function handleTransfer(event) {
    event.preventDefault();
    setNotice("");

    if (!selectedAccountId || selectedAccount?.status !== "ACTIVE") {
      setNotice("Select an active source account.");
      return;
    }
    const destinationId = destination.trim();
    if (!/^[a-fA-F0-9]{24}$/.test(destinationId)) {
      setNotice("Enter a valid destination account ID.");
      return;
    }
    if (destinationId === selectedAccountId) {
      setNotice("Source and destination accounts must be different.");
      return;
    }
    const rupees = Number(amount);
    const amountMinor = Math.round(rupees * 100);
    if (!Number.isFinite(rupees) || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      setNotice("Enter a valid amount greater than ₹0.00.");
      return;
    }
    if (balance !== null && amountMinor > balance) {
      setNotice("The amount exceeds your available balance.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAccount: selectedAccountId,
          toAccount: destinationId,
          amountMinor,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.message || "Transfer failed.");

      setNotice(data.message || "Transfer processed successfully.");
      setAmount("");
      setDestination("");
      await loadAccounts();
      await loadTransactions();
      setActivePage("Transactions");
    } catch (err) {
      setNotice(err.message || "Unable to complete transfer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setNotice("");
    setLoggingOut(true);
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      const data = await readResponse(res);
      if (!res.ok) { setNotice(data.message || "Logout failed."); return; }
      setIsLoggedIn(false);
      setCurrentUser(null);
      setAccounts([]);
      setSelectedAccountId("");
      setBalance(null);
      setTransactions([]);
      setActivePage("Dashboard");
      setNotice("");
    } catch {
      setNotice("Unable to contact the server to log out.");
    } finally {
      setLoggingOut(false);
    }
  }

  // ── Render states ────────────────────────────────────────────────────────────

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent" />
          <p className="text-slate-500">Checking your session...</p>
        </div>
      </div>
    );
  }

  // Not logged in → auth screen
  if (!isLoggedIn) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  // Logged in but no accounts → onboarding screen
  if (accounts.length === 0) {
    return <OnboardingScreen onAccountCreated={handleAccountCreated} />;
  }

  // Logged in with accounts → full dashboard
  const displayName = currentUser?.name || currentUser?.email || "Banking User";
  const navItems = [
    { name: "Dashboard", icon: "▦" },
    { name: "Transactions", icon: "⇄" },
    { name: "Transfer", icon: "↗" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
      {/* Sidebar */}
      <aside className="flex w-full flex-col bg-slate-950 text-white md:fixed md:inset-y-0 md:w-64">
        <div className="flex items-center gap-3 border-b border-white/10 px-6 py-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400 text-xl font-black text-slate-950">
            B
          </div>
          <div>
            <h1 className="text-lg font-bold">Backend Ledger</h1>
            <p className="text-xs text-slate-400">Personal banking</p>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-4 py-6 md:flex-col">
          {navItems.map((item) => (
            <button
              key={item.name}
              onClick={() => { setActivePage(item.name); setNotice(""); }}
              className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium ${
                activePage === item.name
                  ? "bg-emerald-400 text-slate-950"
                  : "text-slate-300 hover:bg-white/10"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="mt-auto hidden p-4 md:block">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <p className="mt-1 truncate text-xs text-slate-400">
              {currentUser?.email || ""}
            </p>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="mt-4 rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-60"
            >
              {loggingOut ? "Logging out..." : "Log out"}
            </button>
          </div>
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="mx-4 mb-4 rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-60 md:hidden"
        >
          {loggingOut ? "Logging out..." : "Log out"}
        </button>
      </aside>

      {/* Main */}
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 md:ml-64 md:px-10 md:py-9">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Personal account</p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
              {activePage === "Dashboard" ? "Your dashboard" : activePage}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold">{displayName}</p>
              <p className="text-xs text-slate-500">INR · India</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800">
              {initials(displayName)}
            </div>
          </div>
        </header>

        {notice && (
          <div
            role="status"
            className={`mb-6 rounded-xl border p-4 text-sm ${
              isErrorNotice(notice)
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {notice}
          </div>
        )}

        {accountError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {accountError}
          </div>
        )}

        {activePage === "Dashboard" && (
          <>
            <section className="grid gap-5 lg:grid-cols-3">
              <div className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-sm sm:p-8 lg:col-span-2">
                <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full border-[35px] border-white/5" />
                <div className="relative">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-300">Available balance</p>
                    <button
                      onClick={() => setShowBalance((v) => !v)}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10"
                    >
                      {showBalance ? "Hide" : "Show"} balance
                    </button>
                  </div>

                  <h3 className="mt-4 text-3xl font-bold sm:text-4xl">
                    {loadingAccounts || loadingBalance
                      ? "Loading..."
                      : balance === null
                        ? "Balance unavailable"
                        : showBalance
                          ? formatINR(balance)
                          : "₹ ••••••••"}
                  </h3>

                  <p className="mt-3 break-all text-sm text-slate-400">
                    {selectedAccount
                      ? `Account: ${selectedAccount._id}`
                      : "No account selected"}
                  </p>

                  {accounts.length > 1 && (
                    <label className="mt-4 block max-w-sm">
                      <span className="mb-2 block text-xs text-slate-400">
                        Switch account
                      </span>
                      <select
                        value={selectedAccountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                        className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white"
                      >
                        {accounts.map((a) => (
                          <option key={a._id} value={a._id}>
                            {a.currency || "INR"} · {a.status} ·{" "}
                            {String(a._id).slice(-6)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="mt-8 flex flex-wrap gap-3">
                    <button
                      onClick={() => setActivePage("Transfer")}
                      className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-300"
                    >
                      ↗ Send money
                    </button>
                    <button
                      onClick={() => setActivePage("Transactions")}
                      className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold hover:bg-white/10"
                    >
                      View activity
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-xl">
                  ⇄
                </div>
                <p className="mt-6 text-sm text-slate-500">Account status</p>
                <p className="mt-2 text-2xl font-bold">
                  {selectedAccount?.status || "—"}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {selectedAccount?.currency || "INR"} account
                </p>
                <p className="mt-4 break-all text-xs text-slate-400">
                  ID: {selectedAccount?._id || "—"}
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(String(selectedAccount?._id || ""));
                    setNotice("Account ID copied to clipboard.");
                  }}
                  className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Copy account ID
                </button>
              </div>
            </section>

            <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {[
                { title: "Transfer money", description: "Send funds to another account.", icon: "↗", page: "Transfer" },
                { title: "Transaction history", description: "Review your account activity.", icon: "⇄", page: "Transactions" },
                { title: "Account security", description: "Backend-validated account access.", icon: "♧", page: "Dashboard" },
              ].map((item) => (
                <button
                  key={item.title}
                  onClick={() => setActivePage(item.page)}
                  className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                >
                  <span className="text-2xl text-emerald-700">{item.icon}</span>
                  <h3 className="mt-4 font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
                </button>
              ))}
            </section>

            <TransactionTable
              transactions={transactions.slice(0, 5)}
              loading={loadingTransactions}
              error={transactionError}
              selectedAccountId={selectedAccountId}
            />
          </>
        )}

        {activePage === "Transactions" && (
          <TransactionTable
            transactions={transactions}
            loading={loadingTransactions}
            error={transactionError}
            selectedAccountId={selectedAccountId}
          />
        )}

        {activePage === "Transfer" && (
          <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h3 className="text-2xl font-bold">Transfer money</h3>
            <p className="mb-7 mt-2 text-sm leading-6 text-slate-500">
              Select a source account and enter the destination account ID.
            </p>

            <form onSubmit={handleTransfer} className="space-y-5">
              <div>
                <label htmlFor="source" className="mb-2 block text-sm font-semibold">
                  Source account
                </label>
                <select
                  id="source"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
                  required
                >
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id} disabled={a.status !== "ACTIVE"}>
                      {a.currency || "INR"} · {String(a._id).slice(-6)} · {a.status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="destination" className="mb-2 block text-sm font-semibold">
                  Destination account ID
                </label>
                <input
                  id="destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="24-character account ID"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm"
                  required
                />
                <p className="mt-1 text-xs text-slate-400">
                  Ask the recipient to copy their account ID from their dashboard.
                </p>
              </div>

              <div>
                <label htmlFor="amount" className="mb-2 block text-sm font-semibold">
                  Amount (INR)
                </label>
                <input
                  id="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3"
                  required
                />
              </div>

              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Available balance</span>
                  <span className="font-semibold">
                    {balance === null ? "Unavailable" : formatINR(balance)}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  submitting ||
                  loadingAccounts ||
                  !selectedAccountId ||
                  selectedAccount?.status !== "ACTIVE"
                }
                className="w-full rounded-xl bg-slate-950 px-5 py-3.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Submitting...
                  </span>
                ) : (
                  "Submit transfer"
                )}
              </button>
            </form>
          </section>
        )}

        <footer className="mt-10 border-t border-slate-200 py-5 text-xs text-slate-400">
          Backend Ledger · Portfolio project
        </footer>
      </main>
    </div>
  );
}

// ─── Transaction table ────────────────────────────────────────────────────────
function TransactionTable({ transactions, loading, error, selectedAccountId }) {
  function direction(tx) {
    if (!selectedAccountId) return null;
    if (String(tx.fromAccount) === selectedAccountId) return "debit";
    if (String(tx.toAccount) === selectedAccountId) return "credit";
    return null;
  }

  return (
    <section className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h3 className="text-lg font-bold">Recent transactions</h3>
        <p className="mt-1 text-sm text-slate-500">
          Transaction history from the backend
        </p>
      </div>

      {loading ? (
        <p className="p-6 text-sm text-slate-500">Loading transactions...</p>
      ) : error ? (
        <p role="alert" className="p-6 text-sm text-amber-700">{error}</p>
      ) : transactions.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-2xl">⇄</p>
          <p className="mt-2 text-sm font-medium text-slate-600">No transactions yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Make your first transfer to see activity here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((tx) => {
                const dir = direction(tx);
                return (
                  <tr key={tx._id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <p className="font-semibold">
                        {dir === "debit" ? (
                          <span className="text-red-600">↑ Sent</span>
                        ) : dir === "credit" ? (
                          <span className="text-emerald-600">↓ Received</span>
                        ) : (
                          tx.transactionType || "TRANSFER"
                        )}
                      </p>
                      <p className="mt-1 break-all text-xs text-slate-400">
                        {tx._id}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                      {tx.createdAt
                        ? new Date(tx.createdAt).toLocaleString("en-IN")
                        : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          tx.status === "SUCCESS"
                            ? "bg-emerald-100 text-emerald-700"
                            : tx.status === "PENDING"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {tx.status || "UNKNOWN"}
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap px-6 py-4 text-right font-bold ${
                        dir === "debit"
                          ? "text-red-600"
                          : dir === "credit"
                            ? "text-emerald-600"
                            : ""
                      }`}
                    >
                      {dir === "debit" ? "−" : dir === "credit" ? "+" : ""}
                      {formatINR(tx.amountMinor)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default App;