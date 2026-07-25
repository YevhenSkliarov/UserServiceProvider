const { execSync } = require('child_process');
require('dotenv').config({ quiet: true });
const { Verifier } = require('@pact-foundation/pact');
const { createApp } = require('../src/users-server');
const { PROVIDER_NAME } = require('../pact.config');

// Matches the version `pact-broker record-deployment` looks up (see
// pact:record-deployment in package.json). This repo only contains the
// provider, so the whole repo's HEAD is an honest version for it — no
// scoping to specific file paths needed (that was a workaround for
// sharing one repo with the consumer).
const GIT_SHORT_SHA = execSync('git rev-parse --short HEAD').toString().trim();

const PORT = 8081;
let server;
let users;

describe('User Service Provider Contract Verification', () => {
  beforeEach((done) => {
    // Every interaction has its own provider state (see stateHandlers
    // below), so there's nothing to seed by default here — an empty
    // starting point makes sure each interaction's state handler is what
    // actually puts the provider in the right shape, not test order.
    users = [];
    const app = createApp(users);
    server = app.listen(PORT, done);
  });

  afterEach((done) => {
    server.close(done);
  });

  test('validates the expectations of UserWebClient', () => {
    const opts = {
      provider: PROVIDER_NAME,
      providerBaseUrl: `http://localhost:${PORT}`,

      // Verifies against contracts published to a Pact Broker by the
      // consumer (user-web-client) repo. Requires `docker-compose up -d`
      // (see docker-compose.yml) and the pact published from that repo via
      // `npm run pact:publish`. The broker in this repo's docker-compose
      // uses HTTP basic auth (not a token), matching PACT_BROKER_BASIC_AUTH_*
      // there.
      pactBrokerUrl: process.env.PACT_BROKER_BASE_URL,
      pactBrokerUsername: process.env.PACT_BROKER_USERNAME,
      pactBrokerPassword: process.env.PACT_BROKER_PASSWORD,
      consumerVersionSelectors: [
        { mainBranch: true },
        { deployedOrReleased: true },
      ],
      // Lets a consumer publish new interactions without instantly breaking
      // this build: unverified ("pending") pacts and work-in-progress pacts
      // from other branches are still reported, but don't fail verification.
      enablePending: true,
      includeWipPactsSince: '2020-01-01',
      publishVerificationResult: true,
      providerVersion: process.env.GIT_COMMIT || GIT_SHORT_SHA,
      providerVersionBranch: process.env.GIT_BRANCH || 'main',
      // Broker round-trips (fetching selectors, publishing results) can be
      // slow on a cold connection — give it more room than the client's
      // default before treating it as a hang.
      timeout: 30000,

      // Provider states referenced by `.given(...)` in the consumer test are
      // resolved here, so the provider is put into the right state before
      // each interaction is replayed against it. Parameters passed to
      // `.given(name, params)` on the consumer side arrive here as the
      // handler's argument, so state setup isn't tied to hardcoded values.
      stateHandlers: {
        'a user exists': (parameters) => {
          users.length = 0;
          users.push({
            id: parameters.id,
            name: parameters.name,
            email: parameters.email,
          });
          return Promise.resolve(`Set up: user ${parameters.id} exists`);
        },
        'a user does not exist': (parameters) => {
          users.length = 0;
          return Promise.resolve(`Set up: user ${parameters.id} does not exist`);
        },
        'no users exist': () => {
          users.length = 0;
          return Promise.resolve('Set up: no users exist');
        },
      },

      logLevel: 'warn',
    };

    return new Verifier(opts).verifyProvider();
  }, 30000);
});
