require('dotenv').config();
const { program } = require('commander');

program
  .description("Resets records from FAILED to PENDING_POEM");

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
  const failedRecords = [];
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
        if (record.status === "FAILED") {
          failedRecords.push({
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

  console.log(`Found ${failedRecords.length} failed record(s).`);

  let bulkPutCounter = 0;
  while (bulkPutCounter < failedRecords.length) {
    const chunkedRecords = failedRecords.slice(bulkPutCounter, bulkPutCounter + 100);

    const updatedChunkedRecords = chunkedRecords.map(({ key, value }) => {
      return {
        key,
        value: {
          ...value,
          status: "PENDING_POEM",
        }
      }
    })

    const bulkPutValueRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatedChunkedRecords.map(({ key, value }) => {
        return {
          key,
          value: JSON.stringify(value),
        }
      }))
    });

    const data = await bulkPutValueRes.json();
    if (data.success) {
      console.log(`Updated ${data.result.successful_key_count} records.`);
    } else {
      throw new Error(`error updating records: ${data}`);
    }

    bulkPutCounter += 100;
  }
})();
