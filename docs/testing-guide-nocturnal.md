# Nocturnal Wallet — Feature Testing & Screenshot Guide

A step-by-step walkthrough for manually testing and capturing screenshots of the **Nocturnal**
Canton Network wallet extension. Each step lists the exact screen, the on-screen strings/labels,
the actions to take, and a **📸 Screenshot** callout for the shots you'll want to capture.

> **Scope:** Nocturnal brand only. Covers (1) User Onboarding, (2) Transfer Canton Coin / Amulet,
> (3) Transaction History, (4) Connect dApp & Swap on Kairo, (5) Elfa AI features.

---

## Before you start

- **Pin the extension.** Open the Nocturnal wallet from the Chrome toolbar (click the puzzle-piece
  icon and pin **Nocturnal** so it's always visible).
- **Use the Devnet network** throughout this guide. On the first screen (and in the dashboard header)
  there's a network selector — set it to **Devnet**. Devnet gives you a **faucet** for free test
  Canton Coin and a **block explorer** link on completed transfers, so you can run every step without
  real funds.
- Have a **Google account** ready — sign-in is via Google.

> ⚠️ **Switching network signs you out.** Changing the network from the dashboard header clears your
> session and returns you to the Unlock/Welcome screen. Pick **Devnet** *before* onboarding so you
> don't have to unlock again.

---

## 1. User Onboarding

Onboarding opens in a **full browser tab** (the popup closes if it loses focus), so most of these
shots are full-tab captures.

**Happy path (new user):**
`Welcome → Google sign-in → Create Password → Show Private Key → Acknowledgment → Typed Confirm → Dashboard`

### Step 1.1 — Welcome

- **You see:** Nocturnal logo, title **"Nocturnal"**, subtitle **"Securely manage your Canton
  Network tokens"**, over the skyline background.
- **Network selector** (top): colored dot + current network + chevron. For the preview build the
  choices are **Devnet** (blue) and **Mainnet** (green).
- **Primary button:** **"Sign in with Google"** (Google icon). While signing in: spinner +
  **"Signing in…"**.

**Action:** Set the network to **Devnet**, then click **Sign in with Google**. (This opens a new
browser tab and starts the Google sign-in automatically.)

> 📸 **Screenshot 1** — Welcome screen with the network selector visible.
> 📸 **Screenshot 2** — Network selector dropdown open (Devnet / Mainnet).

### Step 1.2 — Google OAuth

- Google's account chooser / consent screen appears (requesting basic profile + email).

**Action:** Choose your Google account and approve. You're returned to the wallet to set a password.

> 📸 **Screenshot 3** — Google account/consent screen (optional; may contain personal email).

### Step 1.3 — Create Password

- **You see:** title **"Create Password"**, subtitle **"This password encrypts your private key
  locally."**, two inputs **"Password"** / **"Confirm Password"** (each with a show/hide eye toggle),
  and a live rules checklist:
  - "At least 8 characters", "Uppercase letter", "Lowercase letter", "A digit",
    "Special character".
- **"Passwords do not match"** warning shows on mismatch.
- **Buttons:** **"Continue"** (enabled only when all rules pass and passwords match);
  **"Sign out & reset"**.

**Action:** Enter a strong password twice, then **Continue**.

> 📸 **Screenshot 4** — Create Password with the rules checklist all green.

### Step 1.4 — Show Private Key *(new-key path only)*

- Title **"Your Private Key"**, amber warning **"Save this key securely. You will need it to recover
  your wallet. Never share it with anyone."**
- **Format toggle:** **"Base64"** / **"Hex"**. Key box is masked by default with **"Reveal"/"Hide"**
  and **"Copy"/"Copied"**.
- Button **"I've Saved My Key"**.

**Action:** Reveal, copy the key somewhere safe, then **I've Saved My Key**.

> 📸 **Screenshot 5** — Show Private Key screen (key **masked** — do not reveal a real key in a shared shot).

### Step 1.5 — Security Acknowledgment

- Title **"Security Acknowledgment"**, subtitle **"Please confirm you understand the following."**
- Three checkboxes (all required):
  - "I understand that I am fully responsible for keeping my private key safe."
  - "I understand that if I lose my private key, my funds cannot be recovered."
  - "I understand that anyone who has my private key can access my funds."
- Button **"Continue"** (enabled once all three are checked).

**Action:** Check all three, then **Continue**.

> 📸 **Screenshot 6** — Acknowledgment with all three boxes checked.

### Step 1.6 — Typed Confirm

- Title **"Confirm"**, subtitle **"Type the following phrase exactly to confirm:"**
- Phrase to type: **"I accept full responsibility for my wallet keys and backups."**
- Button **"Complete Setup"** (enabled on exact match; spinner while completing).

**Action:** Type the phrase exactly, then **Complete Setup** → lands on the **Dashboard**.

> 📸 **Screenshot 7** — Typed Confirm with the phrase entered and the button enabled.

### Step 1.7 — Unlock (returning user)

Reopen the popup after onboarding (or after auto-lock) to capture the returning-user path.

- Lock icon, title **"Wallet Locked"**, subtitle **"Enter your password to unlock"**, and a chip
  showing your signed-in email.
- Password input (autofocus, Enter submits). Button **"Unlock"**. Wrong password → **"Invalid
  password"**.
- Secondary: **"Sign in with a different account"**.

> 📸 **Screenshot 8** — Unlock screen.

> **Auto-lock note:** the wallet locks itself after **15 minutes** of inactivity, sending you back to
> this Unlock screen. Re-lock is inactivity-only — closing/reopening the popup or leaving it briefly
> idle no longer bumps you to Unlock.

---

## 2. Transfer Canton Coin / Amulet

The dashboard has a bottom tab bar: **Wallet · Send · Offers · History · Insights**. The header shows the Nocturnal logo, the network
selector, a Settings gear, and an expand-to-tab button, plus an account strip with your email and
truncated **party id** (`hint::first10…last10`) with a copy button.

> 📸 **Screenshot 9** — Dashboard header + account strip (party id + copy button).

### Step 2.1 — Wallet / Balances tab

- Section header **"Tokens"** + **"Refresh"** button.
- Token rows (fixed order): **Canton Coin** (Amulet, symbol CC), **Canton Bitcoin** (CBTC),
  **Canton USD Coin** (USDCx), then others. Each row: icon, name, **"Available: {amount}"**, total on
  the right, and an amber **"Locked: {amount}"** line when funds are locked.

> ℹ️ **Transfer pre-approval is automatic.** The backend registers a transfer pre-approval for your
> party during onboarding, so you can receive Canton Coin right away. You should **not** see a
> "Register Transfer Pre-Approval" banner here — if it appears, wait a moment and Refresh.

**Action:** Just confirm the Wallet tab lists **Canton Coin** and the other tokens.

> 📸 **Screenshot 10** — Balances/Wallet tab showing Canton Coin and the token list.

### Step 2.2 — Get test funds (Faucet) — Devnet only

Tap the **Canton Coin** row to open **Token Details** (header **"Token Details"**, large **$CC**
total, an **Available/Locked** breakdown, and a **Token Info** card — Decimals 10, Min Transfer 10).

- **Faucet card** (only for Canton Coin on Devnet): header **"Faucet"**, helper **"Request test
  Canton Coin tokens on Devnet (max 10,000)."**, an amount input (default **"10"**), a password
  input **"Enter password to sign"**, and a button **"Request {amount} CC"**.
- Success: **"Faucet request sent!"**

**Action:** Enter an amount (e.g. 100), your password, and **Request … CC**. Wait ~30s and Refresh
the Wallet tab to see the balance.

> 📸 **Screenshot 11** — Token Details for Canton Coin with the Faucet card.
> 📸 **Screenshot 12** — "Faucet request sent!" confirmation.

> **Receiving:** there is no QR/Receive screen. Others send to your **party id** (copy it from the
> dashboard header). Receiving requires the transfer pre-approval from Step 2.1.

### Step 2.3 — Send / Transfer flow

Open the **Send** tab. Flow: **form → confirm → success**.

**Form (heading "Transfer"):**
- **"Token"** select — options read like **"CC — Canton Coin"**, "CBTC — Canton Bitcoin",
  "USDCx — Canton USD Coin". Default is Canton Coin. Below: **"Available: {amount}"** (and Locked if any).
- **"Recipient Party ID"** — text input, placeholder **"Enter party ID"**.
- **"Amount (min: 10)"** — text input, placeholder **"0.00"**, with a **"MAX"** button.
- Button **"Continue"** (enabled once recipient + amount are set).

> 📸 **Screenshot 13** — Transfer form filled in (token = Canton Coin, recipient, amount).

**Confirm (heading "Confirm Transfer"):**
- Summary card: **Token** (Canton Coin), **Amount**, **Recipient** (full party id).
- Fee section (when a fee is present).
- **"Password to sign"** input, placeholder **"Enter password"**.
- Buttons **"Cancel"** and **"Sign & Send"**.

> 📸 **Screenshot 14** — Confirm Transfer screen with summary + password field.

**Action:** Enter your password, click **Sign & Send**.

**Success:**
- Green check, heading **"Transfer Sent"**, body **"{amount} CC sent to recipient"**.
- **"View on Explorer"** link — on Devnet this deep-links to
  `https://lighthouse.devnet.cantonloop.com/transactions/{updateId}` for this transfer.
- **"New Transfer"** button.

> 📸 **Screenshot 15** — "Transfer Sent" success screen (with the "View on Explorer" link).
> 📸 **Screenshot 15b** — (optional) The Lighthouse explorer page for the transaction after clicking through.

> **Amulet vs token-standard:** Canton Coin (Amulet) settles directly via pre-approval. Other tokens
> (CBTC/USDCx) create a two-step **transfer offer** the recipient must Approve (see §3/Offers).

---

## 3. Transaction History

### Step 3.1 — History tab

Open the **History** tab. It lists transfer/transaction records, 5 per page.

Each row shows:
- **{amount} {token name}** (e.g. "100 Canton Coin").
- A **status badge**: APPROVED (green ✓), AUTO APPROVED (green shield), CANCELLED / REJECTED (red ✗),
  LOCKED (amber lock), EXPIRED (gray).
- **Timestamp** of the last update.
- Counterparties: **{sender} → {receiver}** (truncated party ids).

- **Empty state:** **"No history"**.
- **Error:** **"Failed to load history"** + **"Retry"**.
- **Pagination** (when >1 page): **"Prev"** / **"Next"** and a **"{page} / {total}"** indicator.

**Action:** After completing a transfer (§2.3) and/or a faucet request, open History to see the new
record. Page through if you have more than 5.

> 📸 **Screenshot 16** — History tab with at least one record + status badge.
> 📸 **Screenshot 17** — Empty state "No history" (capture on a fresh account, before any transfer).
> 📸 **Screenshot 18** — Pagination controls (if you have >5 records).

### Step 3.2 — Offers (optional, related)

The **Offers** tab has **Incoming** / **Outgoing** sub-tabs (token-standard transfers create these).
- **Incoming** card: amount + token, **"From: {sender}"**, and **Reject** / **Approve** buttons; after
  clicking, an inline **"Enter password to sign"** field appears with **"Confirm Approve/Reject"**.
- **Outgoing** card: amber **"Locked"** badge, **"To: {receiver}"**, and a **"Withdraw"** action
  (inline password → **"Confirm Withdraw"**).

> 📸 **Screenshot 19** — Offers tab (Incoming or Outgoing) — optional, if exercising token-standard transfers.

---

## 4. Connect dApp & Swap on Kairo

**What Kairo is here:** Kairo is the Canton DEX. The **swap happens on a separate web app** — Nocturnal
is the wallet that web app connects to for approvals and signing. There is no swap screen inside the
wallet itself; a swap shows up in Nocturnal as an **"Execute Transaction"** approval.

> ⚠️ **Password to sign.** Signing requests (Execute Transaction / Sign Message) show a **"Password
> to sign"** field in the approval popup — enter your wallet password to approve; a wrong password
> shows an error and keeps the popup open. **Connect** has no password field (it doesn't sign). The
> wallet must still be unlocked to connect.

### Step 4.1 — Open the Kairo DEX and detect the wallet
- Navigate to the Kairo DEX web app in the same Chrome profile.
- The site detects Nocturnal automatically and lists it as an available wallet ("Nocturnal").

> 📸 **Screenshot 20** — Kairo DEX page showing the wallet detected / "Nocturnal" as a wallet option.

### Step 4.2 — Connect approval
Clicking **Connect** on the DEX opens a Nocturnal approval popup.

- **You see:** Nocturnal logo, title **"Connect Request"**, subtitle **"A dApp is requesting
  permission to connect"**, an **"Origin"** card (the Kairo DEX URL), and **"Approve"** / **"Reject"**
  buttons. (Closing the window counts as **Reject**.)

**Action:** Click **Approve**.

> 📸 **Screenshot 21** — "Connect Request" approval popup showing the Kairo origin + Approve/Reject.
> 📸 **Screenshot 22** — Kairo DEX after connect, showing your Nocturnal account/party connected.

### Step 4.3 — Perform a swap → Execute Transaction approval
When you submit a swap on Kairo, Nocturnal opens an approval popup for the transaction:

- **You see:** title **"Execute Transaction Request"**, subtitle **"A dApp is requesting permission
  to execute transaction"**, a **"Parameters"** card showing the transaction details (the swap
  commands), and **"Approve"** / **"Reject"**.
- On **Approve**, the wallet signs and submits the transaction. On **Reject**, Kairo shows a
  "User rejected the transaction" error.

**Action:** Set up a small swap in Kairo, submit, then in the popup enter your **wallet password** and click **Approve**.

> 📸 **Screenshot 23** — "Execute Transaction Request" popup with the swap Parameters JSON.
> 📸 **Screenshot 24** — Kairo swap success/result after approval.
> 📸 **Screenshot 25** — The swap reflected in Nocturnal (Balances change and/or History row).

> **Note:** you'll need the actual Kairo DEX web-app URL to run this flow. Make sure the network the
> DEX is using matches Nocturnal's selected network (Devnet).

---

## 5. Elfa AI Features

Elfa is reached via the **Insights** tab (bottom nav, trending-up icon). Every sub-tab footer reads
**"Powered by Elfa"**. You must be **signed in** to use it.

The Insights screen has a segmented control: **Tokens · Narratives · Search · Chat**, plus a shared
**24h / 7d** window toggle (Tokens & Narratives only) and a **Refresh** button.

> 📸 **Screenshot 26** — Insights tab with the Tokens · Narratives · Search · Chat control + "Powered by Elfa" footer.

### Step 5.1 — Tokens (trending)
*`TrendingTokensView`*
- Ranked list by social mentions: rank, ticker, **"{n} mentions"**, a green/red change % with arrow,
  and a **mindshare bar** with a `%` share label.
- Legend: **"Change = mentions vs prior {window} · bar = share of top {n} · tap for mentions"** and
  footer **"Trending signal — differs from Elfa Chat's full-corpus totals."**
- A pinned **Canton Coin** card (**"Canton-native · not on Elfa"** + USD price) when available.
- Empty: **"No trending tokens right now."**

**Action:** Toggle 24h/7d; tap a token to open its **"{TOKEN} · top mentions"** detail
(`ElfaTokenDetail`), which lists mention rows. Empty: **"No mentions found for this token."**

> 📸 **Screenshot 27** — Trending Tokens list with mindshare bars + the pinned Canton Coin card.
> 📸 **Screenshot 28** — Token detail "top mentions" view.

### Step 5.2 — Narratives
*`NarrativesView` / `NarrativeCard`*
- Collapsible cards of trending narrative clusters; **"Show N source(s)"** / **"Hide N source(s)"**
  reveals `@handle` source links.
- Empty: **"No trending narratives right now."**

> 📸 **Screenshot 29** — Narratives list, one card expanded to show sources.

### Step 5.3 — Search
*`ElfaSearch`*
- Search box placeholder **"Search mentions (e.g. canton)"** with a submit button.
- Quick chips: **Canton, CC, cBTC, cETH, SPCX**.
- Idle text: **"Search social mentions for any token or keyword."**; results are mention rows;
  empty: **"No mentions found for \"{query}\"."**
- Each mention row (`ElfaMentionRow`): `@handle`, timestamp, **"· {n} views"**, external link, and a
  chevron **"Account credibility"** expander → Smart followers, Avg reach, Followers, Engagement %.

**Action:** Tap the **Canton** chip (or type a query) and submit; expand a row's credibility.

> 📸 **Screenshot 30** — Search results for "canton" (or a chip query).
> 📸 **Screenshot 31** — A mention row with the "Account credibility" stats expanded.

### Step 5.4 — Chat (AI market chat)
*`ElfaChat`*
- Empty state: **"Ask Elfa about the market."**
- Composer: a textarea, placeholder **"Ask about the market…"**, and a **Send** button.
  **Enter** sends, **Shift+Enter** = newline. Max **2,000 chars** (over-limit shows **"Messages can
  be up to 2,000 characters."**).
- Top-right **"New chat"** clears the thread.
- On send: your message bubble appears (right-aligned), then a **"Thinking…"** assistant placeholder,
  then the reply (left-aligned). The transcript is persisted (capped at ~10 turns).
- Errors: rate-limit → **"You've reached the chat limit. Try again in a minute."**; generic →
  **"Chat isn't available right now."**; signed-out → **"Not signed in"**.

**Action:** Ask something like *"What's trending on Canton right now?"* and wait for the reply.

> 📸 **Screenshot 32** — Empty Chat state ("Ask Elfa about the market.").
> 📸 **Screenshot 33** — Chat with a user message + "Thinking…" placeholder.
> 📸 **Screenshot 34** — Chat with a completed AI reply.

> **Not in this build:** "Auto pending trades" (Elfa Auto → Canton swaps) is not available in this
> build. Nothing to screenshot for that feature here.

---

## Screenshot Checklist (quick reference)

| # | Feature | Shot |
|---|---------|------|
| 1–2 | Onboarding | Welcome + network selector |
| 3 | Onboarding | Google OAuth (optional) |
| 4 | Onboarding | Create Password (rules green) |
| 5 | Onboarding | Show Private Key (masked) |
| 6 | Onboarding | Acknowledgment (all checked) |
| 7 | Onboarding | Typed Confirm |
| 8 | Onboarding | Unlock screen |
| 9 | Transfer | Dashboard header + party id |
| 10 | Transfer | Balances / Wallet tab (Canton Coin + token list) |
| 11–12 | Transfer | Token Details + Faucet (Devnet) |
| 13–15 | Transfer | Transfer form → confirm → sent (15b: explorer page, optional) |
| 16–18 | History | List, empty state, pagination |
| 19 | History | Offers tab (optional) |
| 20–22 | dApp/Kairo | Detect, Connect approval, connected |
| 23–25 | dApp/Kairo | Execute Transaction approval, swap result, wallet reflect |
| 26 | Elfa | Insights tab overview |
| 27–28 | Elfa | Trending Tokens + token detail |
| 29 | Elfa | Narratives |
| 30–31 | Elfa | Search + credibility |
| 32–34 | Elfa | Chat empty / thinking / reply |
