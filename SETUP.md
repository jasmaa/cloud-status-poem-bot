# Setup

## Generate Open AI API key

Create an Open AI account and go to
https://platform.openai.com/account/api-keys.

Create an API key. This will be `OPEN_AI_API_KEY`.


## Generate Mastodon API key

Go to Mastodon instance of choice and create an account.

Go to Settings->Development and click "New application".

Create an app with the following permissions:
  - `write:statuses`

Copy the access token from the app. This will be `MSTDN_ACCESS_TOKEN`.


# Setup Cloudflare worker

Setup KV namespaces:

```
wrangler kv:namespace create FEED_ITEMS
wrangler kv:namespace create FEED_ITEMS --preview
```

Upload respective secrets via Wrangler:

```
wrangler secret put OPENAI_API_KEY
wrangler secret put MSTDN_ACCESS_TOKEN
```

Create `.env` from `sample.env` and fill with proper values (the default
Mastodon instance is botsin.space).

Generate `wrangler.toml` with script:

```
pip install -r "requirements.txt"
pyhon scripts/generate_wrangler.py
```

Deploy worker with:

```
yarn deploy
```
