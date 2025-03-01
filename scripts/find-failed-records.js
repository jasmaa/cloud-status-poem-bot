require('dotenv').config({ path: '.dev.vars' });

const { program } = require('commander');

program
  .requiredOption('--account-id <accountId>', "Cloudflare account id")
  .requiredOption("--namespace-id <namespaceId>", "Feed items namespace id")

program.parse();

const options = program.opts();

(async () => {
  const { accountId, namespaceId } = options;
  const accessKey = process.env.CLOUDFLARE_API_TOKEN;

  const listKeysRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessKey}`
    },
  });
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
      if (record.status === "FAILED") {
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
