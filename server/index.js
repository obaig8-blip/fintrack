import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

const app = express();
app.use(cors());
app.use(express.json());

// --- Plaid client -----------------------------------------------------------
// Secrets live ONLY on the server (.env). The browser never sees them.
const plaid = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  })
);

// --- Temporary in-memory store ---------------------------------------------
// Step 2 replaces this with MongoDB. Restarting the server wipes it.
const store = {
  accessToken: null,          // long-lived key to the user's bank data
  cursor: null,               // where /transactions/sync left off last time
  transactions: new Map(),    // transaction_id -> transaction
};

// 1) Frontend asks for a short-lived link_token to open Plaid Link
app.post('/api/link-token', async (req, res, next) => {
  try {
    const { data } = await plaid.linkTokenCreate({
      user: { client_user_id: 'demo-user' }, // real users come with auth later
      client_name: 'FinTrack',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    res.json({ link_token: data.link_token });
  } catch (err) {
    next(err);
  }
});

// 2) After the user logs into their bank, Plaid gives the frontend a
//    one-time public_token. We swap it for a permanent access_token here,
//    server-side, so the access_token never touches the browser.
app.post('/api/exchange', async (req, res, next) => {
  try {
    const { public_token } = req.body;
    const { data } = await plaid.itemPublicTokenExchange({ public_token });
    store.accessToken = data.access_token;
    store.cursor = null;
    store.transactions.clear();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 3) Pull new/changed/removed transactions since the last cursor.
app.post('/api/transactions/sync', async (req, res, next) => {
  try {
    if (!store.accessToken) return res.status(400).json({ error: 'No bank linked yet' });

    let hasMore = true;
    while (hasMore) {
      const { data } = await plaid.transactionsSync({
        access_token: store.accessToken,
        cursor: store.cursor ?? undefined,
      });
      for (const t of [...data.added, ...data.modified]) store.transactions.set(t.transaction_id, t);
      for (const t of data.removed) store.transactions.delete(t.transaction_id);
      store.cursor = data.next_cursor;
      hasMore = data.has_more;
    }

    res.json({ transactions: listTransactions() });
  } catch (err) {
    next(err);
  }
});

app.get('/api/transactions', (req, res) => {
  res.json({ transactions: listTransactions() });
});

function listTransactions() {
  return [...store.transactions.values()]
    .map((t) => ({
      id: t.transaction_id,
      date: t.date,
      name: t.merchant_name || t.name,
      amount: t.amount, // Plaid: positive = money OUT, negative = money IN
      category: t.personal_finance_category?.primary || 'OTHER',
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// Central error handler: log Plaid's real error, send a clean message back
app.use((err, req, res, next) => {
  const plaidError = err.response?.data;
  console.error(plaidError || err);
  res.status(500).json({ error: plaidError?.error_message || 'Server error' });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`FinTrack API running on http://localhost:${PORT}`));
