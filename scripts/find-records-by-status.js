require('dotenv').config();
const { program } = require('commander');

program
  .description("Find records by status")
  .option('--status <status>', "Record status. (ex. FAILED)");

program.parse();

const options = program.opts();

(async () => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = process.env.FEED_ITEMS_ID;
  const accessKey = process.env.CLOUDFLARE_API_TOKEN;
  const status = options.status || "FAILED";

  const listKeysRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessKey}`
    },
  });

  if (listKeysRes.status !== 200) {
    console.log("Error:", await listKeysRes.text());
    return;
  }

  const listKeysResBody = await listKeysRes.json();

  const keys = listKeysResBody.result.map(({ name }) => name);

  let bulkGetCounter = 0;
  const filteredRecords = [];
  while (bulkGetCounter < keys.length) {
    const currentKeys = keys.slice(bulkGetCounter, bulkGetCounter + 100);
    const bulkGetValueRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk/get`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessKey}`
      },
      body: JSON.stringify({
        keys: currentKeys,
      })
    });

    const data = await bulkGetValueRes.json();
    for (const key in data.result.values) {
      try {
        const record = JSON.parse(data.result.values[key]);
        if (record.status === status) {
          filteredRecords.push({
            key,
            value: record,
          });
        }
      } catch (err) {
        // Legacy non-JSON record. Silently fail
      }
    }

    bulkGetCounter += 100;
  }

  for (const { key } of filteredRecords) {
    console.log(key);
  }
})();
