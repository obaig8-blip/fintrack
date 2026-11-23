import { useEffect, useMemo, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

export default function App() {
  const [linkToken, setLinkToken] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [status, setStatus] = useState('');
  const [linked, setLinked] = useState(false);

  // On page load, ask our server for a link_token so the Plaid button works
  useEffect(() => {
    fetch('/api/link-token', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => setLinkToken(d.link_token))
      .catch(() => setStatus('Could not reach the server. Is it running?'));
  }, []);

  async function sync() {
    setStatus('Syncing transactions…');
    const r = await fetch('/api/transactions/sync', { method: 'POST' });
    const d = await r.json();
    if (!r.ok) return setStatus(d.error);
    setTransactions(d.transactions);
    setStatus(
      d.transactions.length
        ? ''
        : 'No transactions yet. Sandbox data can take a few seconds. Hit Sync again.'
    );
  }

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token) => {
      setStatus('Linking bank…');
      await fetch('/api/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token }),
      });
      setLinked(true);
      await sync();
    },
  });

  // Spending per category (only money going out, i.e. positive amounts)
  const byCategory = useMemo(() => {
    const totals = {};
    for (const t of transactions) {
      if (t.amount > 0) totals[t.category] = (totals[t.category] || 0) + t.amount;
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  return (
    <main>
      <h1>FinTrack</h1>
      <div className="actions">
        <button onClick={() => open()} disabled={!ready}>Connect a bank</button>
        <button onClick={sync} disabled={!linked}>Sync</button>
      </div>
      {status && <p className="status">{status}</p>}

      {byCategory.length > 0 && (
        <section>
          <h2>Spending by category</h2>
          <ul className="categories">
            {byCategory.map(([cat, total]) => (
              <li key={cat}>
                <span>{prettify(cat)}</span>
                <strong>${total.toFixed(2)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {transactions.length > 0 && (
        <section>
          <h2>Transactions</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Merchant</th><th>Category</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{t.name}</td>
                  <td>{prettify(t.category)}</td>
                  <td className={t.amount > 0 ? 'out' : 'in'}>
                    {t.amount > 0 ? '-' : '+'}${Math.abs(t.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

function prettify(s) {
  return s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
