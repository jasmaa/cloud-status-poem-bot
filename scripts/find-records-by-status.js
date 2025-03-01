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

  const failedRecordKeys = (await Promise.all(listKeysResBody.result.map(async ({ name }) => {
    const getValueRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(name)}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessKey}`
      },
    });
    try {
      const record = await getValueRes.json();
      if (record.status === status) {
        return name;
      }
    } catch (error) {
      // Silently fail
    }
  }))).filter((v) => !!v);

  for (const name of failedRecordKeys) {
    console.log(name);
  }
})();
