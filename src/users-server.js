const express = require('express');

/**
 * Real provider (UserService) implementation.
 * `users` is injected so tests can control state (see stateHandlers
 * in tests/users-provider.pact.test.js) without a real database.
 */
function createApp(users) {
  const app = express();
  app.use(express.json());

  app.get('/users/:id', (req, res) => {
    const id = Number(req.params.id);
    const user = users.find((u) => u.id === id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json(user);
  });

  app.post('/users', (req, res) => {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'name and email are required' });
    }

    const id = users.reduce((maxId, u) => Math.max(maxId, u.id), 0) + 1;
    const user = { id, name, email };
    users.push(user);

    return res.status(201).json(user);
  });

  return app;
}

module.exports = { createApp };
