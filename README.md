# user-service

Provider service (pacticipant `UserService`) for the Pact contract testing
example. This is one half of a two-repo pair — the consumer lives in a
separate [`user-web-client`](../user-web-client) repo. Splitting them keeps
each service's git history, versioning, and CI pipeline independent, so a
consumer-only change doesn't force a version bump or re-verify on the
provider (and vice versa).

## Layout

```
user-service/
├── src/users-server.js                    real provider Express API
├── tests/users-provider.pact.test.js       verifies the contract
├── pact.config.js                          pacticipant names (must match the consumer's copy)
├── docker-compose.yml                      local Pact Broker (standalone use)
└── package.json
```

## How it fits with the consumer

1. The **consumer's own test** (in the `user-web-client` repo) runs its real
   HTTP client against a Pact mock server and writes a **pact file** — a JSON
   contract — describing every request/response pair it expects.
2. That pact file is published to a **Pact Broker**, a shared server both
   that repo and this one talk to.
3. **This project's test** downloads the contract from the broker, replays
   each recorded request against the *real* provider code here, and asserts
   the real response matches what the consumer expects.
4. `can-i-deploy` checks the broker before a deploy: "has this exact
   provider version been verified against every consumer version currently
   in production?" If not, the deploy is blocked.

Because each service now has its own git history, `$(git rev-parse --short HEAD)`
in the scripts below is an honest version for *this* pacticipant only — no
more scoping `git log` to specific file paths to work around a shared repo.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in real values if using a shared/hosted broker
npm run broker:up       # or point PACT_BROKER_BASE_URL at a broker already running
npm test                 # verifies against whatever's published to the broker
```

`npm test` needs a pact published to the broker first — publish one from the
`user-web-client` repo (`npm run pact:publish` there) before running this.

## Using a local Pact Broker

The `docker-compose.yml` here is identical to the one in `user-web-client`.
If you're working across both projects at once, run only one broker and
point both projects' `.env` at it via `PACT_BROKER_BASE_URL`.

## Scripts

| Script | Purpose |
|---|---|
| `test` | Verifies the real provider against the broker-hosted pact |
| `broker:up` / `broker:down` | Start/stop the local Pact Broker via Docker |
| `pact:can-i-deploy` | Checks if the current `UserService` version is safe to deploy |
| `pact:record-deployment` | Records `UserService`'s deploy to `production` |

All `pact:*` scripts read `PACT_BROKER_BASE_URL` / `PACT_BROKER_USERNAME` /
`PACT_BROKER_PASSWORD` from `.env`, defaulting to the local broker — override
them to target a hosted broker (e.g. PactFlow, which uses `--broker-token`
instead of username/password).

### Bootstrapping a fresh broker

`can-i-deploy` compares against whatever is already recorded as deployed to
`production`. On a brand-new broker there's nothing to compare against yet,
so the very first check always fails. For that one bootstrap deploy only,
append `--dry-run` (forces exit code 0 while still printing the real
verdict): `npm run pact:can-i-deploy -- --dry-run`. Don't leave `--dry-run`
in permanently — it silently disables the safety check.
