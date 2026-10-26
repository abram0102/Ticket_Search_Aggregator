const path = require('path');

// All services (wherever their cwd ends up under npm workspaces) load the
// single .env file at the repo root, so there is one place to configure keys.
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
