---
name: contest-leaderboard
description: Build a leaderboard that backs a real prize contest — identity, server-side score validation, a datastore that survives concurrent submits, entry-flow ordering, anti-abuse, and a private admin dashboard. Use when adding a leaderboard, high-score table, or competition backend to a game or app, especially on Cloudflare Workers.
---

# A leaderboard with a prize attached

A promo high-score board and a contest leaderboard look identical and are not
the same system. The moment a real prize is attached, a lost write is money and
credibility. Written from Will Hill: Player One — a 3-day contest with a
real-world prize.

## ⚠️ Pick the datastore by the LOAD, not the shape of the data

The first build put the whole board in **one Cloudflare KV key**, read →
modified → written on every submit. "A list of scores" *looks* like a KV value.
It fails in two ways that are both on page one of KV's own documentation:

- **No compare-and-swap.** Two players finishing at the same moment both read
  the old list, and the second write silently erases the first.
- **~1 write per second, per key.** A launch party is a queue against one key.

Use a **relational store** (Cloudflare D1 / SQLite) and let the database own the
rule:

```sql
INSERT INTO runs (id, name, score, updated) VALUES (?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  score   = MAX(runs.score, excluded.score),
  updated = CASE WHEN excluded.score > runs.score
                 THEN excluded.updated ELSE runs.updated END;
```

"Keep the highest" becomes a guarantee instead of application code that happens
to run alone. A hundred plays a day is a hundred cheap upserts.

### Split the read path from the write path

Reads are what scale, writes are not — a hundred players make a hundred writes
across an evening and *thousands* of reads, because everyone sits on the board
screen.

- **Writes go straight to the database.** Never cached.
- **`/top` is cached ~2 seconds at the edge.** Invisible to a human, and it
  takes essentially all read load off the database.

Note this is the exact inverse of the failed design, which used an eventually
consistent store for the thing needing consistency and cached nothing that
didn't.

---

## Identity is the contact detail, not the display name

Key entries on **the phone number (or email) the prize will be claimed on**,
normalised — digits only, country prefix stripped — then hashed:

```js
id = sha256('salt:' + digits).slice(0, 10)   // opaque, public-safe
```

Two people called Will are two people; one person can type six different names
between runs. Keying on the name merges strangers AND lets one player hold
several places by renaming.

**The public board carries only `{id, name, score}`.** Contact details live in a
**separate table** the public endpoint never selects from — so it cannot leak a
phone number even if somebody writes a careless query later. That is a
structural guarantee, not a convention, and it is worth a test.

### On SMS verification

Usually not worth it. A web page cannot stop someone typing a made-up number,
and fingerprinting/localStorage are weak and clearable. **What protects a
contest is that the prize is claimed on the number given** — a fake entry wins
nothing, so it costs nothing to allow.

---

## Validate the score on the server, always

The client submits a **compact event log** (what was collected, when), never a
score. The server re-adds it with its own rules. A player editing a number in
memory achieves nothing.

Then add the checks that catch a log somebody **built** rather than played:

- **A measured ceiling.** Walk the real level data and count what can actually
  be scored. Anything above it is synthesised however well-formed it looks.
- **A floor on run length**, and a **score-per-second** bound.
- **Monotonic timestamps** inside the claimed duration.

⚠️ **Keep the server's rules in sync with the client's event types.** If the
two disagree about, say, what a doubled pickup is worth, every boosted run is
silently rejected as fraudulent.

---

## ⚠️ Entry-flow ordering: test BOTH orders

Someone can register **before** playing or **after** a run. These are different
code paths and the after path is the common one.

> The submit fired at the *moment of death* — before the panel had offered the
> contest — and the submit function returned early when nobody was registered.
> So: play, die, decide to enter, and **the run just played was discarded**.
> The before path worked, which is exactly why it survived every test: whoever
> wrote one wrote the half that worked.

**Hold the finished run and flush it when registration completes.** Assert
both orders, and assert the held run is sent exactly once.

---

## Anti-abuse, in layers

**At the edge, before code runs:** per-IP rate limits on the submit route, a
bot check (Turnstile) verified server-side, WAF rules, and a billing alert so a
hammering costs a notification rather than a bill.

**In the worker:**

- **Lock CORS to your own origin.** A wildcard means any page on the internet
  can enter your contest. This is the single most commonly shipped hole.
- **Replay protection.** A finished event log can be posted twice — or somebody
  else's good run posted under your own number, which is the cheapest cheat
  available and takes no skill. Mint a **UUID at run start**, submit it, and
  let a `PRIMARY KEY` refuse the duplicate. Use the key as the lock, not a
  read-then-check: there is no window between the two for a racer to slip in.
- **Honeypots.** Two kinds, both nearly free:
  - a hidden form field (off-screen, `tabindex="-1"`, `aria-hidden`, **not**
    `display:none` — capable bots skip hidden fields) that no human can fill;
  - a **decoy field the real client never sends** — e.g. `score`. The server
    computes the score, so anything that *sends* one is poking the API by
    definition.
  Answer both with the **shape of success**, so a prober learns nothing and
  does not come back with something different.
- **Bounded input:** body size cap, event count cap, length-clamped strings,
  and parameterised SQL everywhere so injection is structurally impossible.
- **Fail closed.** Returning `String(e.message)` hands an attacker a free map
  of your internals, one malformed request at a time. Log it; say nothing.
- **Log every refusal with a reason** — abuse is only worth seeing *during* the
  contest, and a rejection feed is how you see it.

---

## The admin dashboard is a SEPARATE service

It is less code to add an `/admin` route to the game worker, and that is exactly
what makes it worse: the game worker is the thing every phone is hammering and
the thing an attacker already has a URL for.

- **Its own hostname, its own worker**, read-only on the same database. It is
  the only place that joins the public board to the contact details.
- **Access by rotatable secret link** if the client wants share-by-link with no
  login — long random token, constant-time compare, **404 on a bad token** (a
  403 confirms there is something to find), `noindex` and `no-referrer` so the
  token cannot walk out in a search index or an outbound click.
- **Rotation is the kill switch.** A share link is forwardable and the page
  shows real phone numbers. One command must invalidate every link ever sent,
  and it should be used the day the contest closes. Say this out loud to the
  client rather than letting them discover it.
- Show **everyone**, not the top N — plus filtering to isolate the winners, and
  CSV export for the call-down.

---

## ⚠️ What code cannot fix

The client is public. A determined, skilled person can synthesise an event log
that passes every check, because the real game produces exactly such logs and
there is no secret you can hide in a page anyone can read. Every measure above
raises the cost; none makes it impossible.

**The backstop is human.** The prize is claimed on a real phone and a real
address, so before paying out, manually review the top few — score against the
measured ceiling, run duration, when they entered. Five minutes on three
people. Say this to the client plainly; any contest that claims otherwise is
bluffing.

---

## Degrade quietly

The board should never show an error. If the backend is unreachable — or simply
not deployed yet — bank runs locally and show the player their own recent
scores. A phone on bad signal at a party is the normal case, not the edge case,
and "could not load" is worse than a short local board.

Keep the backend URL empty until it is deployed, and make the client treat that
as "local only" rather than as a failure.
