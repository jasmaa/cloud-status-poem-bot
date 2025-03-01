/*
 * Generates `wrangler.toml` from env vars.
 */

require('dotenv').config();
const fs = require('node:fs');

const content = `name = "aws-status-poem-bot"
compatibility_date = "2023-07-23"
account_id = "${process.env.CLOUDFLARE_ACCOUNT_ID}"

[[kv_namespaces]]
binding = "FEED_ITEMS"
id = "${process.env.FEED_ITEMS_ID}"
preview_id = "${process.env.FEED_ITEMS_PREVIEW_ID}"

[triggers]
crons = ["* * * * *"]

[observability]
enabled = true

[vars]
MSTDN_URL = "${process.env.MSTDN_URL}"

# Secrets
# - GEMINI_API_KEY
# - MSTDN_ACCESS_TOKEN`;

fs.writeFileSync('wrangler.toml', content);