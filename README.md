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
npm run broker:up       # start the shared local broker if needed
npm test                 # verifies against whatever's published to the broker
```

`npm test` needs a pact published to the broker first — publish one from the
`user-web-client` repo (`npm run pact:publish` there) before running this.

## Step-by-step: first deploy vs. every deploy after

These two repos share one Pact Broker. The sequence below assumes both are
checked out as sibling directories (`user-web-client/` and `user-service/`)
with `.env` in each pointed at the same broker (see "Using a local Pact
Broker" below).

### First run (bootstrapping a brand-new broker)

Run these in order — later steps depend on earlier ones having completed.

1. **(user-web-client)** `npm install`
2. **(user-web-client)** `cp .env.example .env` — fill in broker URL/credentials
3. **(user-service)** `npm install`
4. **(user-service)** `cp .env.example .env` — point at the same broker as step 2
5. **(either repo, once)** `npm run broker:up` — starts the shared local broker; skip if you're pointed at an already-running hosted broker
6. **(user-web-client)** `npm test` — runs the consumer test, writes `pacts/UserWebClient-UserService.json`
7. **(user-web-client)** `npm run pact:publish` — publishes the pact to the broker
8. **(user-service)** `npm test` — verifies the real provider against the pact from step 7, publishes the verification result to the broker
9. **(user-service)** `npm run pact:can-i-deploy -- --dry-run` — no consumer version is recorded as deployed to `production` yet on a fresh broker, so a real check always fails here; `--dry-run` prints the verdict without blocking
10. **(user-service)** deploy the provider for real, then `npm run pact:record-deployment` — this is what actually marks a `UserService` version as "deployed to `production`" in the broker; running `test` or `can-i-deploy` alone never writes that record
11. **(user-web-client)** `npm run pact:can-i-deploy` — no `--dry-run` needed here: step 10 recorded a verified `UserService` version as deployed to `production`, so this check runs for real and should pass
12. **(user-web-client)** deploy the consumer for real, then `npm run pact:record-deployment`

If step 10 is skipped (provider verified and checked, but never `record-deployment`'d), step 11 fails with *"no version is currently recorded as deployed/released in this environment"* — `can-i-deploy` is read-only, only `record-deployment` writes to the broker.

### Every run after that (day-to-day changes)

**If you changed the consumer** (`user-web-client`):

1. **(user-web-client)** `npm test` — regenerates the pact
2. **(user-web-client)** `npm run pact:publish`
3. **(user-service)** `npm test` — re-verifies the provider against the updated pact
4. **(user-service)** `npm run pact:can-i-deploy` — confirms the provider version currently in `production` still satisfies the new pact
5. **(user-web-client)** `npm run pact:can-i-deploy` — confirms this consumer version is safe against whatever provider version is in `production`
6. **(user-web-client)** deploy, then `npm run pact:record-deployment`

**If you changed the provider** (`user-service`):

1. **(user-service)** `npm test` — re-verifies against every pact already on the broker
2. **(user-service)** `npm run pact:can-i-deploy` — confirms this provider version is safe against every consumer version currently in `production`
3. **(user-service)** deploy, then `npm run pact:record-deployment`
4. Nothing needed on the consumer side unless the contract itself changed — the new provider version is simply what future `user-web-client` `can-i-deploy` checks compare against.

Drop `--dry-run` after the first bootstrap deploy — leaving it on permanently silences the safety check for good.

## Using a local Pact Broker

The `docker-compose.yml` here is identical to the one in `user-web-client`.
Both repos now use `COMPOSE_PROJECT_NAME=pact-broker` in `.env`, so running
`npm run broker:up` from either repo starts or attaches to the same local broker.
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

See "Step-by-step: first deploy vs. every deploy after" above for when
`can-i-deploy` needs `--dry-run` and why.
