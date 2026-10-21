
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

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

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

  const selectedAccount = accounts.find(
    (account) => String(account._id) === selectedAccountId
  );

  const isAuthenticationError = (status, message = "") =>
    status === 401 ||
    /unauthorized|login to continue|not authenticated|invalid token|token expired/i.test(
      message
    );

  // Fetch the accounts belonging to the authenticated user.
  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setAccountError("");

    try {
      const response = await fetch("/api/accounts", {
        method: "GET",
        credentials: "include",
      });

      const data = await readResponse(response);

      if (!response.ok) {
        const error = new Error(
          data.message || "Unable to load your accounts."
        );
        error.status = response.status;
        throw error;
      }

      const result = Array.isArray(data)
        ? data
        : Array.isArray(data.accounts)
          ? data.accounts
          : null;

      if (!result) {
        throw new Error(
          "Unexpected accounts response. Check your account controller."
        );
      }

      setAccounts(result);

      setSelectedAccountId((currentId) => {
        if (result.some((account) => String(account._id) === currentId)) {
          return currentId;
        }

        const active = result.find(
          (account) => account.status === "ACTIVE"
        );

        return String((active || result[0])?._id || "");
      });

      return result;
    } catch (error) {
      setAccounts([]);
      setSelectedAccountId("");
      setBalance(null);
      setAccountError(error.message);
      throw error;
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  // Fetch the selected account's current balance.
  const loadBalance = useCallback(async () => {
    if (!selectedAccountId) {
      setBalance(null);
      return;
    }

    setLoadingBalance(true);

    try {
      const response = await fetch(
        `/api/accounts/balance/${selectedAccountId}`,
        { credentials: "include" }
      );

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(data.message || "Unable to load balance.");
      }

      const value =
        data.balanceMinor ??
        data.balance?.balanceMinor ??
        data.balance;

      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(
          "Unexpected balance response. Check your balance controller."
        );
      }

      setBalance(value);
    } catch (error) {
      setBalance(null);
      setAccountError(error.message);
    } finally {
      setLoadingBalance(false);
    }
  }, [selectedAccountId]);

  // Fetch transaction history if GET /api/transactions is implemented.
  const loadTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    setTransactionError("");

    try {
      const response = await fetch("/api/transactions", {
        method: "GET",
        credentials: "include",
      });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to load transaction history."
        );
      }

      const result = Array.isArray(data)
        ? data
        : Array.isArray(data.transactions)
          ? data.transactions
          : null;

      if (!result) {
        throw new Error(
          "Unexpected transaction history response format."
        );
      }

      setTransactions(result);
    } catch (error) {
      setTransactions([]);
      setTransactionError(error.message);
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  // Check the existing browser session on page load.
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        await loadAccounts();

        if (!cancelled) {
          setIsLoggedIn(true);
        }
      } catch (error) {
        if (!cancelled) {
          setIsLoggedIn(false);

          if (isAuthenticationError(error.status, error.message)) {
            setLoginError("");
          } else {
            setLoginError(
              "Unable to verify your session. Check that the backend is running."
            );
          }
        }
      } finally {
        if (!cancelled) {
          setCheckingAuth(false);
        }
      }
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, [loadAccounts]);

  useEffect(() => {
    if (isLoggedIn) {
      loadBalance();
    }
  }, [isLoggedIn, loadBalance]);

  useEffect(() => {
    if (isLoggedIn) {
      loadTransactions();
    }
  }, [isLoggedIn, loadTransactions]);

  // Browser login: the server must establish the expected session/cookie.
  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    setLoggingIn(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(data.message || "Login failed.");
      }

      // Verify that the browser can now access a protected endpoint.
      // A successful login response alone does not prove a cookie was set.
      await loadAccounts();

      setIsLoggedIn(true);
      setPassword("");
      setLoginError("");
      setNotice("Login successful.");
    } catch (error) {
      setIsLoggedIn(false);
      setLoginError(
        error.message ||
          "Login failed. Check your credentials and authentication settings."
      );
    } finally {
      setLoggingIn(false);
      setCheckingAuth(false);
    }
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

    if (
      !Number.isFinite(rupees) ||
      !Number.isSafeInteger(amountMinor) ||
      amountMinor <= 0
    ) {
      setNotice("Enter a valid amount greater than ₹0.00.");
      return;
    }

    if (balance !== null && amountMinor > balance) {
      setNotice("The amount exceeds your available balance.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fromAccount: selectedAccountId,
          toAccount: destinationId,
          amountMinor,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(data.message || "Transfer failed.");
      }

      setNotice(
        data.message || "Transfer processed successfully."
      );
      setAmount("");
      setDestination("");

      await loadAccounts();
      await loadTransactions();

      setActivePage("Transactions");
    } catch (error) {
      setNotice(error.message || "Unable to complete transfer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setNotice("");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      const data = await readResponse(response);

      if (!response.ok) {
        setNotice(data.message || "Logout failed.");
        return;
      }

      setIsLoggedIn(false);
      setAccounts([]);
      setSelectedAccountId("");
      setBalance(null);
      setTransactions([]);
      setPassword("");
      setNotice("");
    } catch {
      setNotice("Unable to contact the server to log out.");
    }
  }

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Checking your session...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400 text-xl font-black">
              B
            </div>
            <div>
              <h1 className="text-2xl font-bold">Backend Ledger</h1>
              <p className="mt-1 text-sm text-slate-500">
                Sign in to your banking dashboard
              </p>
            </div>
          </div>

          {loginError && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {loginError}
            </p>
          )}

          <div>
            <label
              htmlFor="loginEmail"
              className="mb-2 block text-sm font-semibold"
            >
              Email
            </label>
            <input
              id="loginEmail"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label
              htmlFor="loginPassword"
              className="mb-2 block text-sm font-semibold"
            >
              Password
            </label>
            <input
              id="loginPassword"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loggingIn}
            className="w-full rounded-xl bg-slate-950 px-5 py-3.5 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loggingIn ? "Logging in..." : "Log in"}
          </button>

          <p className="text-xs leading-5 text-slate-500">
            Use the credentials of a registered test user. Your password is
            sent to your backend over this local development connection.
          </p>
        </form>
      </div>
    );
  }

  const navItems = [
    { name: "Dashboard", icon: "▦" },
    { name: "Transactions", icon: "⇄" },
    { name: "Transfer", icon: "↗" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
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
              onClick={() => {
                setActivePage(item.name);
                setNotice("");
              }}
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
            <p className="text-sm font-semibold">Secure banking</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Transfers and account access are validated by the backend.
            </p>
            <button
              onClick={handleLogout}
              className="mt-4 rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10"
            >
              Log out
            </button>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="mx-4 mb-4 rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 md:hidden"
        >
          Log out
        </button>
      </aside>

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
              <p className="text-sm font-semibold">Banking User</p>
              <p className="text-xs text-slate-500">INR · India</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800">
              BU
            </div>
          </div>
        </header>

        {notice && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-sm"
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
                    <p className="text-sm text-slate-300">
                      Available balance
                    </p>
                    <button
                      onClick={() => setShowBalance((value) => !value)}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10"
                    >
                      {showBalance ? "Hide balance" : "Show balance"}
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
                      : "No account available"}
                  </p>

                  {accounts.length > 0 && (
                    <label className="mt-4 block max-w-sm">
                      <span className="mb-2 block text-xs text-slate-400">
                        Select account
                      </span>
                      <select
                        value={selectedAccountId}
                        onChange={(event) =>
                          setSelectedAccountId(event.target.value)
                        }
                        className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white"
                      >
                        {accounts.map((account) => (
                          <option key={account._id} value={account._id}>
                            {account.currency || "INR"} · {account.status} ·{" "}
                            {String(account._id).slice(-6)}
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
              </div>
            </section>

            <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {[
                {
                  title: "Transfer money",
                  description: "Send funds to another account.",
                  icon: "↗",
                  page: "Transfer",
                },
                {
                  title: "Transaction history",
                  description: "Review your account activity.",
                  icon: "⇄",
                  page: "Transactions",
                },
                {
                  title: "Account security",
                  description: "Backend-validated account access.",
                  icon: "♧",
                  page: "Dashboard",
                },
              ].map((item) => (
                <button
                  key={item.title}
                  onClick={() => setActivePage(item.page)}
                  className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                >
                  <span className="text-2xl text-emerald-700">{item.icon}</span>
                  <h3 className="mt-4 font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {item.description}
                  </p>
                </button>
              ))}
            </section>

            <TransactionTable
              transactions={transactions.slice(0, 5)}
              loading={loadingTransactions}
              error={transactionError}
            />
          </>
        )}

        {activePage === "Transactions" && (
          <TransactionTable
            transactions={transactions}
            loading={loadingTransactions}
            error={transactionError}
          />
        )}

        {activePage === "Transfer" && (
          <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h3 className="text-2xl font-bold">Transfer money</h3>
            <p className="mb-7 mt-2 text-sm leading-6 text-slate-500">
              Select a source account and enter the destination account ID.
              The backend remains responsible for final validation.
            </p>

            <form onSubmit={handleTransfer} className="space-y-5">
              <div>
                <label htmlFor="source" className="mb-2 block text-sm font-semibold">
                  Source account
                </label>
                <select
                  id="source"
                  value={selectedAccountId}
                  onChange={(event) => setSelectedAccountId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
                  required
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option
                      key={account._id}
                      value={account._id}
                      disabled={account.status !== "ACTIVE"}
                    >
                      {account.currency || "INR"} ·{" "}
                      {String(account._id).slice(-6)} · {account.status}
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
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="Enter destination account ID"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3"
                  required
                />
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
                  onChange={(event) => setAmount(event.target.value)}
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
                {submitting ? "Submitting..." : "Submit transfer"}
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

function TransactionTable({ transactions, loading, error }) {
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
        <p role="status" className="p-6 text-sm text-amber-700">
          {error}
        </p>
      ) : transactions.length === 0 ? (
        <p className="p-6 text-sm text-slate-500">
          No transactions returned. The GET /api/transactions history endpoint
          may not be implemented yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-4">Transaction</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((transaction) => (
                <tr key={transaction._id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <p className="font-semibold">
                      {transaction.transactionType || "TRANSFER"}
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-400">
                      {transaction._id}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                    {transaction.createdAt
                      ? new Date(transaction.createdAt).toLocaleString("en-IN")
                      : "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold">
                      {transaction.status || "UNKNOWN"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right font-bold">
                    {formatINR(transaction.amountMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default App;
