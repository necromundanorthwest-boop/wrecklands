# WRECKLANDS: SCRAP RUN

**WRECKLANDS: SCRAP RUN** is an open-source, two-player, turn-based browser game about rival wasteland crews racing improvised vehicles through a scrapyard. Players maneuver, manage speed and Risk, collect Scrap, shoot, ram, board enemy vehicles, and race for extraction.

The current public codebase is the reviewed **0.3.0 release candidate**. The core local multiplayer game has passed independent Phase 1 and Phase 2 gate reviews. Production deployment and ordinary-player usability validation are tracked separately in `docs/KNOWN_ISSUES.md` and `docs/FINAL_ACCEPTANCE_TEST_RESULTS.md`.

## Core loop

- Create a room and share the six-character code with another player.
- Change Speed, preview a maneuver, and confirm movement.
- Choose one legal action: Shoot, Ram, Board, Scavenge, Repair, or a Boarder follow-up.
- Manage vehicle Integrity, crew availability, Scrap, and driving Risk.
- Win by recovering three Scrap and reaching your extraction zone, or by disabling the opposing vehicle.

## Architecture

WRECKLANDS intentionally uses a small, auditable architecture:

- Node.js 24 authoritative server
- same-origin browser frontend
- server-authoritative dice and action validation
- transactional SQLite room/state persistence
- append-only match event history and duplicate-action receipts
- long-lived streaming updates for two-player synchronization
- data-driven vehicles, crew, weapons, maneuvers, scenarios, and maps

The approved MVP assumes **one Node authority process per SQLite database**. Do not horizontally replicate the service against the same SQLite file.

## Run locally

Requirements: Node.js 24+

```bash
npm ci
npm start
```

Open `http://localhost:3000` in two separate browser sessions. Create a room as Player A and join with the room code as Player B.

By default, runtime state is stored in `.runtime/rooms.sqlite`. You can override the server configuration with:

```bash
HOST=0.0.0.0 PORT=3000 WRECKLANDS_DB=/path/to/rooms.sqlite npm start
```

## Test

Core rules/server tests:

```bash
npm ci
npm test
```

Full browser regression suites require Chromium/Playwright:

```bash
npx playwright install chromium
npm run test:browser
npm run test:clarifications
npm run test:corrections
npm run test:phase2
npm run test:phase3
```

Profiling helpers:

```bash
npm run profile
node tests/profile-http.js
```

## Docker

Build and run locally:

```bash
docker build -t wrecklands .
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e HOST=0.0.0.0 \
  -e WRECKLANDS_DB=/data/rooms.sqlite \
  -v wrecklands-data:/data \
  wrecklands
```

Then open `http://localhost:3000`.

## Deploy on Render

A Render Blueprint is included as `render.yaml` for the reviewed single-authority topology. It uses Docker and mounts a persistent disk at `/data`, where SQLite is stored as `/data/rooms.sqlite`.

Render persistent disks require a paid compatible service. If configuring the service manually instead of using the Blueprint:

- runtime: Docker
- Dockerfile: `./Dockerfile`
- instances: **1**
- persistent disk mount: `/data`
- `WRECKLANDS_DB=/data/rooms.sqlite`
- `HOST=0.0.0.0`
- health check: `/api/content`

Render supplies `PORT`; the application reads `process.env.PORT` automatically.

See `docs/DEPLOYMENT_GUIDE.md` for the release-validation matrix. Public deployment should not be treated as validated until the production checks in that guide have actually been run.

## Repository map

```text
src/        game, UI, rules, server, multiplayer, and state modules
data/       starter content definitions
tests/      unit, browser, regression, and profiling tests
specs/      authoritative MVP specifications and clarifications
docs/       gate reviews, deployment notes, user guide, and known issues
prompts/    staged implementation prompts retained for project provenance
deploy/     optional self-hosted Docker Compose + Caddy configuration
assets/     original project artwork
```

## Contributing

Contributions are welcome. Please read `CONTRIBUTING.md` before opening a pull request. Gameplay changes should be proposed separately from bug fixes or presentation changes so that authoritative rules remain reviewable.

For security issues, see `SECURITY.md`.

## Open-source licensing

- Source code and repository documentation: **MIT License** — see `LICENSE`.
- Original visual assets in `assets/`: **CC BY 4.0** — see `ASSET_LICENSE.md`.

Third-party dependencies retain their own licenses.

## Project status

WRECKLANDS is intentionally scoped as a small competition MVP and open-source foundation. Campaign progression, AI opponents, accounts, matchmaking, expanded factions, and additional content are outside the current release scope.
