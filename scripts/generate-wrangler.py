import os
from dotenv import load_dotenv

load_dotenv()


if __name__ == "__main__":
    content = f"""name = "aws-status-poem-bot"
compatibility_date = "2023-07-23"

[[kv_namespaces]]
binding = "FEED_ITEMS"
id = "{os.environ.get('FEED_ITEMS_ID')}"
preview_id = "{os.environ.get('FEED_ITEMS_PREVIEW_ID')}"

[triggers]
crons = ["* * * * *"]

[vars]
MSTDN_URL = "{os.environ.get('MSTDN_URL')}"

# Secrets
# - OPENAI_API_KEY
# - MSTDN_ACCESS_TOKEN
"""
    with open("wrangler.toml", "w") as f:
        f.write(content)
