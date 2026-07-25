// Provider (UserService) pipeline.
//
// Verifies this repo's real Express API against every contract published
// to the Pact Broker by the UserWebClient consumer pipeline, then publishes
// the verification result back to the broker (handled by the Verifier
// options in tests/users-provider.pact.test.js — publishVerificationResult
// is already true there).
//
// Triggered automatically at the end of the consumer (client) pipeline via
// a `build job:` step — see Jenkinsfile in the user-web-client repo. Can
// also be run standalone/on its own SCM trigger to re-verify against
// whatever is currently on the broker.
pipeline {
    agent {
        docker {
            image 'node:20-bullseye'
            // Socket mount lets this container drive the host's Docker
            // daemon to start docker-compose.yml's Pact Broker (see the
            // "Start Pact Broker" stage below). --network host puts the
            // container on the host's network so it can then reach that
            // broker at localhost:9292 — Linux Docker hosts only, since
            // host networking isn't supported on Docker Desktop.
            // -u root:root overrides the Docker Pipeline plugin's default
            // of running as the Jenkins host user (uid:gid) — that user
            // can't apt-get install the Docker CLI or reliably use the
            // mounted socket, so this stage needs root inside the container.
            args '-v /var/run/docker.sock:/var/run/docker.sock --network host -u root:root'
        }
    }

    // Fires this pipeline on every push to this repo (e.g. a provider code
    // change), independent of the consumer-triggered `build job:` step in
    // the UserWebClient Jenkinsfile. Uses polling rather than a GitHub
    // webhook since this Jenkins isn't reachable from the public internet.
    triggers {
        pollSCM('H/5 * * * *')
    }

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        // Bound from Jenkins credentials (Manage Jenkins > Credentials).
        // Use "Secret text" credentials so both this pipeline and the
        // consumer's use the exact same broker connection details.
        // PACT_BROKER_BASE_URL should be http://localhost:9292 to match the
        // broker started by the stage below.
        PACT_BROKER_BASE_URL = credentials('pact-broker-base-url')
        PACT_BROKER_USERNAME = credentials('pact-broker-username')
        PACT_BROKER_PASSWORD = credentials('pact-broker-password')

        // Consumed by docker-compose.yml's postgres/pact-broker services.
        // Only reachable from inside the broker's own docker network, so
        // not treated as a secret like the PACT_BROKER_* creds above.
        POSTGRES_DB = credentials('postgres-db')
        POSTGRES_USER = credentials('postgres-user')
        POSTGRES_PASSWORD = credentials('postgres-password')

        // Overrides Jenkins' auto-populated GIT_COMMIT (a full 40-char SHA)
        // with the short SHA, so the version recorded here matches the one
        // package.json's pact:can-i-deploy / pact:record-deployment scripts
        // use ($(git rev-parse --short HEAD)). A mismatch here would make
        // the broker unable to find "this version" across the two flows.
        GIT_COMMIT = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
        // Multibranch pipelines expose the real branch name via BRANCH_NAME;
        // Jenkins' own GIT_BRANCH is often "origin/<branch>" (checked out in
        // detached HEAD), which would get published as a bogus branch name.
        GIT_BRANCH = "${env.BRANCH_NAME ?: 'main'}"
    }

    stages {
        stage('Start Pact Broker') {
            steps {
                // node:20-bullseye has no Docker CLI baked in — install it
                // so this container can drive the host daemon via the
                // socket mounted in `agent` above.
                sh '''
                    apt-get update -qq
                    apt-get install -y -qq curl
                    curl -fsSL https://get.docker.com | sh
                '''
                // Shared with the UserWebClient job (same -p project name):
                // if that job already started it (the usual trigger path),
                // this is a no-op. Needed here too since this pipeline can
                // also run standalone/on its own SCM trigger.
                sh 'docker compose -p pact-broker up -d'
                sh '''
                    for i in $(seq 1 30); do
                        curl -sf http://localhost:9292/diagnostic/status/heartbeat && exit 0
                        sleep 2
                    done
                    echo "Pact Broker did not become healthy in time" >&2
                    exit 1
                '''
            }
            // No teardown here either — see the same note in the
            // UserWebClient Jenkinsfile. The broker is shared, long-lived
            // infra; stop it manually with `npm run broker:down`.
        }

        stage('Install dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Verify contract against provider') {
            steps {
                // Runs tests/users-provider.pact.test.js: pulls the latest
                // applicable pacts from the broker (main branch + anything
                // deployed/released), replays them against the real
                // Express app, and publishes the verification result.
                sh 'npm test'
            }
            post {
                always {
                    junit 'reports/junit.xml'
                }
            }
        }
    }

    post {
        cleanup {
            // Wipes node_modules etc. so the next build's `npm ci` starts
            // from an empty workspace instead of fighting a tree left half
            // torn-down by a prior failed/interrupted build — that
            // half-torn-down state plus Docker Desktop's bind-mount sync
            // lag is what produces ENOENT/ENOTEMPTY spam during npm ci.
            // Requires the Workspace Cleanup plugin.
            cleanWs()
        }
    }
}
