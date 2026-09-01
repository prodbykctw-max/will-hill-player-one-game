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
id = sha256('salt:' + digits).slice(0, 10)   // opaque INTERNALLY — see below
```

Two people called Will are two people; one person can type six different names
between runs. Keying on the name merges strangers AND lets one player hold
several places by renaming.

Contact details live in a **separate table** the public endpoint never selects
from, so no careless query can put a phone NUMBER on the public path. That is a
structural guarantee, not a convention, and it is worth a test.

### ⚠️ But do not publish the id. A hash of a phone number IS a phone number

This skill used to call that id "public-safe" and say the public board carries
`{id, name, score}`. Both were wrong, and shipping them meant a live contest
endpoint served a reversible encoding of every entrant's number for weeks.

A hash is one-way only when the input is unguessable, and a phone number is one
of about 10^10 strings. With a fixed prefix and no per-entrant salt, a complete
table of every possible input is minutes of GPU time. Truncation does not help:
80 bits is still far more than the 34 bits the input space needs.

**The public board carries `{name, score}`.** The id is an internal key — the
primary key, the join key, fine anywhere behind auth (the admin view shows the
real number anyway). It is not a field, and the endpoint must not select it.

Salting per entrant would make the hash genuinely opaque, but the salt has to
be derivable from the phone number to look a returning player up, so it buys
much less than it looks — and re-deriving ids orphans every row in every table
keyed on them. Not publishing the value is the cheap fix and the complete one.

The test to write: fetch the public endpoint and assert the response contains
**only** the fields the board renders. Fields leak by accretion — someone adds
a column to a `SELECT` for debugging and it ships.

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

### ⚠️ Derive the floor from the SHORTEST legitimate run, not the longest

The floor is the one of these that refuses honest players, and it did: set at
60s from "four stages cannot be crossed in under two minutes", which is the
time to CLEAR the game. Almost no run ends that way — runs end in death. Every
player who died in the first minute got `invalid run` back, which reads like an
accusation, and the live abuse log filled with them: 93 refusals against 2
accepted runs, every one this check, not one anywhere near the rate bound.

The floor also has **no anti-abuse value** above a few seconds, and this is
worth working out before choosing a number. A fabricator aiming at the ceiling
must satisfy score-per-second, so they must claim `ceiling / rate` seconds
whatever the floor says — the rate bound already forces a long duration for a
big score. All a high floor can refuse is a SMALL score from a SHORT run, which
is exactly what an early death looks like. Set it low enough to be a
sanity check on zero (a few seconds, so the rate divide has a denominator) and
let the rate bound do the actual work.

**Read the rejection log before the contest, grouped by reason and by detail.**
It is the only place this class of bug surfaces: the players it hits see one
error and leave, and never file anything.

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

### Ask every time, and put the form OVER the destination

Two things that both looked like details and were not.

**A "we already asked" latch makes the gate unreachable for the person it is
for.** The first version wrote a flag on first offer and never asked again, and
also gated on "has this device banked a run", so a brand-new player — the whole
target — saw it never or once. Ask on every start until they are actually
registered. Nothing is stored; being registered is the only thing that stops it.

**Make the form a layer over where declining lands, not a screen you navigate
to.** When the sign-up is its own full screen, NOT NOW has to know a
destination, and that destination differs by how the player arrived — before a
run it is the tutorial, after one it is the board. Two hardcoded destinations
became one variable and then, once the form was an overlay, became nothing at
all: the view it declines to is already painted underneath, so every exit is
just "hide the layer". A whole class of navigation bug stops existing.

⚠️ It has to be a SIBLING of the panel's view container, not another view in
it. If the artwork is the panel's own background, the panel cannot show
anything behind it, and a single-view show() will hide one to show the other.

⚠️ And the scrim must eat pointer events. The view underneath is live — in this
game its footer button starts the run — so a tap that reaches it launches the
game out from under a half-filled form.

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

### ⚠️ A persisted outbox needs to tell a verdict from a hiccup

Holding a failed run and retrying it is right — a phone on bad signal at a
party is the normal case. But "failed" cannot mean *any* non-2xx, and this
shipped as `settle(res.ok)`:

- **A 4xx is a verdict.** The server looked at that log and refused it, and it
  will refuse the identical bytes every time. Retrying is guaranteed waste.
- **A 409 means it is already on the board.** Done, not failed — record it so
  the next boot does not ask again.
- **408 and 429 are the 4xx that ARE transient.** Keep holding those.
- **5xx and dead connections** are what the outbox exists for.

Get this wrong and one refused run is re-POSTed at every boot, every reconnect
and after every later run, forever. In the live log that was one payload
recorded 15 times in 14 minutes — and since the rejection log *is* the abuse
view, real abuse during the contest would have been buried under one player's
own retries.

**Grade all four answers.** The harness here stubbed only a dead connection and
a 200, so the bug had no way to show up: both graded cases behaved identically
under the broken code and the fixed one.
