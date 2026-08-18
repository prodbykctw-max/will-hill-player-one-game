#!/usr/bin/env python3
"""
Carry prior deploys' hashed assets into the next gh-pages deploy.

WHY THIS EXISTS — the outage it ends. deploy.sh publishes gh-pages as a fresh
orphan, so every deploy DELETES every previously published content-hashed
file. Meanwhile GitHub Pages serves index.html with `cache-control:
max-age=600` (the <meta> no-cache tags in the page are inert — modern
browsers ignore http-equiv cache directives), and an installed iOS PWA can
hold index.html far longer (docs/HANDOFF.md:2125 measured it as effectively
indefinite). index.html references exactly ONE hashed file — the JS bundle —
and every other asset URL lives inside that bundle.

So after every deploy there is a window where a real phone holds an
index.html whose bundle no longer exists: the module 404s, nothing runs, and
the player gets a black screen with no error (the error screen lives inside
the module that failed to load). Measured on 2026-08-18: SEVEN orphan deploys
in one day, six distinct bundle names, five deleted asset URLs spot-checked
live — all 404. That was the day the client reported "loading issues".

THE FIX: publish the UNION. The new dist/ always wins; on top of it, every
asset file from recent prior deploys is carried forward, so a stale
index.html — ten minutes old or ten days old — still finds its own bundle and
its bundle still finds its own assets. A stale client simply plays the older
build until its cache turns over. Hashed names cannot collide across builds
except with identical content, which is what makes the union safe.

WHERE PRIOR GENERATIONS COME FROM, in order:
  1. the CURRENT origin/gh-pages tree — which, once the union is in effect,
     already accumulates earlier generations, so steady-state needs nothing
     else;
  2. recent entries in .git/logs/refs/remotes/origin/gh-pages — the reflog of
     force-pushes. This is what makes the FIRST union deploy a repair: the
     orphans force-pushed away earlier are still reachable locally, so the
     players stranded by them are un-bricked the moment this ships.

AGING, so gh-pages does not grow forever: asset-ledger.json (published at the
site root) records, per file, the last date the file was part of the CURRENT
build. Files still in dist/ are always stamped today. A carried file whose
stamp is older than RETAIN_DAYS (default 14) is dropped. Fourteen days covers
every cache horizon measured here with room to spare, and RETAIN_DAYS=N in
the environment overrides it.

⚠️ SAFETY, because this writes into the deploy staging dir and the Jandé leak
is the reason deploy.sh exists: only paths matching ^assets/<flat filename>
are ever carried — no dotfiles, no subdirectories, no path with a separator
or '..' in the filename. Prior gh-pages trees were themselves dist-only, and
this filter holds even if one ever was not. deploy.sh's own source-check runs
AFTER this script, so nothing here is exempt from the existing guard.

Usage (called by tools/deploy.sh; runnable alone for a dry report):
    python3 tools/deploy_union.py <stage_dir>          # writes into stage
    python3 tools/deploy_union.py <stage_dir> --check  # report only
"""

import datetime
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RETAIN_DAYS = int(os.environ.get('RETAIN_DAYS', '14'))
REFLOG_DEPTH = 12          # how many recent force-pushed trees to mine
LEDGER = 'asset-ledger.json'
SAFE = re.compile(r'^assets/[A-Za-z0-9][A-Za-z0-9._-]*$')


def git(*args, binary=False):
    r = subprocess.run(['git', '-C', ROOT, *args],
                       capture_output=True, check=False)
    if r.returncode != 0:
        return None
    return r.stdout if binary else r.stdout.decode('utf-8', 'replace')


def tree_assets(ref):
    out = git('ls-tree', '-r', '--name-only', ref, '--', 'assets/')
    if not out:
        return []
    return [p for p in out.split('\n') if p and SAFE.match(p)]


def reflog_refs():
    """Recent gh-pages tips from the remote-tracking reflog, newest first."""
    path = os.path.join(ROOT, '.git', 'logs', 'refs', 'remotes',
                        'origin', 'gh-pages')
    try:
        lines = open(path, encoding='utf-8', errors='replace').read().split('\n')
    except OSError:
        return []
    hashes = []
    for line in reversed(lines):
        parts = line.split()
        if len(parts) >= 2 and re.fullmatch(r'[0-9a-f]{40}', parts[1]):
            if parts[1] not in hashes:
                hashes.append(parts[1])
        if len(hashes) >= REFLOG_DEPTH:
            break
    # keep only hashes whose objects still exist locally
    return [h for h in hashes if git('cat-file', '-e', f'{h}^{{commit}}') is not None]


def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage: deploy_union.py <stage_dir> [--check]')
    stage = sys.argv[1]
    check = '--check' in sys.argv
    today = datetime.date.today()

    current = set()
    stage_assets = os.path.join(stage, 'assets')
    if os.path.isdir(stage_assets):
        current = {'assets/' + f for f in os.listdir(stage_assets)
                   if SAFE.match('assets/' + f)}

    # Previous ledger, from the published site if it has one.
    ledger = {}
    raw = git('cat-file', 'blob', f'origin/gh-pages:{LEDGER}')
    if raw:
        try:
            prev = json.loads(raw)
            if isinstance(prev, dict):
                ledger = {k: v for k, v in prev.items()
                          if isinstance(v, str) and SAFE.match(k)}
        except ValueError:
            pass  # a corrupt ledger just means aging restarts today

    # Candidate trees, deduped, current published tree first.
    refs = []
    if git('rev-parse', '--verify', 'origin/gh-pages^{commit}') is not None:
        refs.append('origin/gh-pages')
    refs += [h for h in reflog_refs()]

    carried, pruned, missing = [], [], []
    seen = set(current)
    new_ledger = {p: today.isoformat() for p in sorted(current)}

    for ref in refs:
        for path in tree_assets(ref):
            if path in seen:
                continue
            seen.add(path)
            stamp = ledger.get(path, today.isoformat())
            try:
                age = (today - datetime.date.fromisoformat(stamp)).days
            except ValueError:
                age, stamp = 0, today.isoformat()
            if age > RETAIN_DAYS:
                pruned.append(path)
                continue
            blob = git('cat-file', 'blob', f'{ref}:{path}', binary=True)
            if blob is None:
                missing.append(f'{ref}:{path}')
                continue
            carried.append(path)
            new_ledger[path] = stamp
            if not check:
                dst = os.path.join(stage, path)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                with open(dst, 'wb') as f:
                    f.write(blob)

    if not check:
        with open(os.path.join(stage, LEDGER), 'w', encoding='utf-8') as f:
            json.dump(new_ledger, f, indent=1, sort_keys=True)

    mb = 0.0
    for p in carried:
        fp = os.path.join(stage, p)
        if os.path.exists(fp):
            mb += os.path.getsize(fp) / 1048576
    print(f'union: {len(current)} current, {len(carried)} carried '
          f'({mb:.1f} MB), {len(pruned)} pruned (> {RETAIN_DAYS}d), '
          f'{len(refs)} source trees')
    if missing:
        print(f'union: WARNING {len(missing)} unreadable blobs skipped: '
              + ', '.join(missing[:3]))
    if check:
        print('union: --check, nothing written')


if __name__ == '__main__':
    main()
