# Deploying the game server

`packages/duel-server` is what makes "Play Online" work: a small Node
process holding open the WebSocket connections for every live room. It's
deployed once, to Fly.io, and the app talks to it over `wss://`.

Offline play (vs. the computer, and the guided tutorial) never touches
this -- it's all local to the phone. Skip this whole page until online
play is what you're working on.

## Why Fly.io

Compared against Railway and Render: Render's free tier sleeps after 15
minutes idle (a ~1 minute cold start on the next connection -- bad for a
live match), and its always-on tier is pricier. Railway has no region near
Colombia. Fly.io gives an always-on machine, automatic `wss://`, a region
in Virginia (`iad`) that's the closest low-latency option to Colombia
short of paying for São Paulo, and it deploys from a plain Dockerfile with
one CLI. It needs a credit card and bills pay-as-you-go -- a single
always-on `shared-cpu-1x` / 256MB machine (`fly.toml` is already set to
this) is a small, low-single-digit-dollars-to-around-ten-dollars-a-month
machine, but check the current price for that size on Fly's own pricing
page before relying on a number here, since it does change.

## One-time setup

All of this runs in a terminal (PowerShell or a Linux/WSL shell) at the
repo root, on your own machine -- not somewhere Claude can do it for you,
since it's your Fly.io account.

1. **Install the Fly CLI** (`flyctl`):
   - Windows (PowerShell): `pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"`
   - macOS/Linux: `curl -L https://fly.io/install.sh | sh`
   - Then open a new terminal so `fly` is on your PATH.
2. **Log in**: `fly auth login` -- opens a browser, log in with the
   account you already created, come back to the terminal.
3. **Pick an app name.** `fly.toml`'s `app = "duel-for-the-world"` almost
   certainly needs to change -- Fly app names are global across every
   Fly user, not just yours. Edit that line to something like
   `duel-for-the-world-<yourname>`, or leave it and let the next step
   catch the clash.
4. **Create the app and deploy:**
   ```
   fly launch --no-deploy
   ```
   This reads the existing `fly.toml`/`Dockerfile` (say no if it offers to
   overwrite them) and asks which org to use; it won't touch the region or
   VM size already set. Then:
   ```
   fly deploy
   ```
   This builds the Docker image (the whole monorepo, but only
   `duel-server` and what it depends on actually runs) and ships it. It
   prints the app's URL when it's done, e.g. `duel-for-the-world-andres.fly.dev`.

## Every deploy after that

From the repo root, whenever `packages/duel-server` (or anything it
imports: `duel-engine`, `duel-content`) changes:

```
fly deploy
```

Check on it any time with `fly status` and `fly logs`.

## Pointing the app at it

Once deployed, the server's address for the Android build is
`wss://<your-app-name>.fly.dev` -- see the "Online play from the app"
section in [docs/ANDROID.md](ANDROID.md).

For local development, nothing changes: `pnpm dev` still runs the server
on `ws://localhost:8080` and the web client still talks to that by
default.

## What the server does about dropped connections

A phone locking, a subway tunnel, a Wi-Fi handoff -- all of these just
look like the connection closing, not "I quit." So the server doesn't tear
a room down the instant a socket drops:

- Each seat gets a private reconnect token when it joins. If that socket
  closes, the seat stays reserved for `RECONNECT_GRACE_MS` (default 90
  seconds, set as a Fly secret/env var to change it) in case the same
  player's app reconnects and presents that token.
- The web client already retries a dropped connection on its own for a
  while and rejoins the same seat automatically -- nothing to build on the
  app side.
- If nobody reclaims the seat before the grace period ends, the other
  player (if still there) is told they've won by forfeit and the room is
  cleaned up.
- If the *active* player goes quiet mid-turn without disconnecting (just
  stalling), `TURN_TIMEOUT_MS` (default 90 seconds) auto-advances the
  phase for them, so a slow opponent can't stall a match forever.
- A background sweep also clears out any room that's sat completely idle
  for 30 minutes (e.g. one player created it and nobody ever joined), as a
  safety net independent of the above.
