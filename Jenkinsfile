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
        docker { image 'node:20-bullseye' }
    }

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        // Bound from Jenkins credentials (Manage Jenkins > Credentials).
        // Use "Secret text" credentials so both this pipeline and the
        // consumer's use the exact same broker connection details.
        PACT_BROKER_BASE_URL = credentials('pact-broker-base-url')
        PACT_BROKER_USERNAME = credentials('pact-broker-username')
        PACT_BROKER_PASSWORD = credentials('pact-broker-password')

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
}
