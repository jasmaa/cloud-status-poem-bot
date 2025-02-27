import { XMLParser } from "fast-xml-parser";

export interface Env {
  FEED_ITEMS: KVNamespace;
  GEMINI_API_KEY: string;
  MSTDN_URL: string;
  MSTDN_ACCESS_TOKEN: string;
}

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  guid: string;
  description: string;
}

interface GeminiCompletionResponse {
  candidates: {
    content: {
      parts: {
        text: string;
      }[];
      role: string;
    };
  }[];
}

export enum FeedRecordStatus {
  PENDING_POEM = "PENDING_POEM",
  PENDING_TOOT = "PENDING_TOOT",
  COMPLETE = "COMPLETE",
  FAILED = "FAILED",
}

export interface FeedRecord {
  status: FeedRecordStatus;
  item?: RssItem;
  poem?: string;
}

class ClientError extends Error { }

class ServerError extends Error { }

function generateErrorFromStatus(status: number, errorMsg: string): Error {
  if (Math.floor(status / 100) === 4) {
    return new ClientError(errorMsg);
  } else if (Math.floor(status / 100) == 5) {
    return new ServerError(errorMsg)
  } else {
    return new Error(errorMsg);
  }
}

function generatePrompt(description: string, poemStart: string) {
  return `
You are the world's best poet. You have been tasked to write high quality and funny poems about AWS incidents.

The following is an example of an incident and a poem written for it:

## Incident

At 13:00 UTC, AWS Infinidash experienced a data plane availability drop in the us-east-1 region. We have confirmed that affected dashes are unable to ingest data from S3 and Kinesis Firehose sources. We are investigating a fix and will provide an update soon.

## Poem

Roses are red,
Violets are blue,
Infinidash is down,
Oh what shall we do?

Dashes won't ingest,
Data stuck at rest.
Customers are angry,
Oh what a mess!

But soon AWS will find,
The solution in sight.
They'll fix the data plane,
And make this all right.

Please write a poem about the following AWS incident. The poem must adhere to the following criteria. If it does not, you will be fined $100:
- It must rhyme
- It must sound good
- It must be 400 or fewer characters long

## Incident

${description}

## Poem

${poemStart}`;
}

function generateToot(item: RssItem, poem: string) {
  return `## ${item.title} ##

${poem}

Source: ${item.guid}`;
}

async function getRssFeedItems(): Promise<RssItem[]> {
  console.log(`Fetching status feed...`);
  const feedRes = await fetch("https://status.aws.amazon.com/rss/all.rss");
  if (feedRes.status === 200) {
    const feedContent = await feedRes.text();
    console.log(`Successfully fetched status feed.`);

    const parser = new XMLParser();
    const feed = parser.parse(feedContent);

    const items: RssItem[] = (
      Array.isArray(feed.rss.channel.item)
        ? feed.rss.channel.item
        : [feed.rss.channel.item]
    )
      .filter((v: any) => !!v)
      .reverse();
    return items;
  } else {
    throw generateErrorFromStatus(
      feedRes.status,
      `Failed to fetch status feed: ${await feedRes.text()}`,
    );
  }
}

async function generatePoemGemini(apiKey: string, incident: string, poemStart: string): Promise<string> {
  const prompt = generatePrompt(incident, poemStart);
  const completionRes = await fetch(
    "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          },
        ],
        generationConfig: {
          maxOutputTokens: 400,
        },
      }),
    }
  );
  if (completionRes.status === 200) {
    const completionContent =
      await completionRes.json() as GeminiCompletionResponse;
    console.log(`Successfully received completion.`);

    const completion = completionContent.candidates[0].content.parts[0].text;
    return completion;
  } else {
    throw generateErrorFromStatus(
      completionRes.status,
      `Failed to generate completion: ${await completionRes.text()}`,
    );
  }
}

async function toot(url: string, accessToken: string, content: string) {
  const tootRes = await fetch(`${url}/api/v1/statuses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      status: content,
    }),
  });
  if (tootRes.status === 200) {
    console.log(`Successfully tooted poem.`);
  } else {
    throw generateErrorFromStatus(
      tootRes.status,
      `Failed to toot poem: ${await tootRes.text()}`,
    );
  }
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const poemStart = "Roses are red,\nViolets are blue,\n";

    const items = await getRssFeedItems();
    console.log(`Found ${items.length} items.`);

    for (const item of items) {

      const incident = item.description;

      const recordValue = await env.FEED_ITEMS.get(item.guid);

      try {
        let record: FeedRecord = recordValue
          ? JSON.parse(recordValue)
          : {
            status: FeedRecordStatus.PENDING_POEM,
            item,
          };

        if (record.status === FeedRecordStatus.PENDING_POEM) {
          try {
            const poem = await generatePoemGemini(env.GEMINI_API_KEY, incident, poemStart);

            record = {
              ...record,
              status: FeedRecordStatus.PENDING_TOOT,
              poem,
            };
            await env.FEED_ITEMS.put(item.guid, JSON.stringify(record));
            console.log(`Successfully generated poem for item guid=${item.guid}.`);
          } catch (err) {
            if (err instanceof ClientError) {
              record = {
                ...record,
                status: FeedRecordStatus.FAILED,
              };
              await env.FEED_ITEMS.put(item.guid, JSON.stringify(record));
              console.log(`Encountered client error when generating poem for item guid=${item.guid}. Setting to FAILED.`);
            }
          }
        }

        if (record.status === FeedRecordStatus.PENDING_TOOT) {
          const poem = record.poem;
          if (poem) {
            try {
              const tootContent = generateToot(item, poem);
              await toot(env.MSTDN_URL, env.MSTDN_ACCESS_TOKEN, tootContent);

              record = {
                ...record,
                status: FeedRecordStatus.COMPLETE,
              };
              await env.FEED_ITEMS.put(item.guid, JSON.stringify(record));
              console.log(`Successfully tooted poem for item guid=${item.guid}.`);
            } catch (err) {
              if (err instanceof ClientError) {
                record = {
                  ...record,
                  status: FeedRecordStatus.FAILED,
                };
                await env.FEED_ITEMS.put(item.guid, JSON.stringify(record));
                console.log(`Encountered client error when tooting poem for item guid=${item.guid}. Setting to FAILED.`);
              }
            }
          } else {
            console.log(`Error: poem not found for item guid=${item.guid}! Skipping.`);
          }
        }

        if (record.status === FeedRecordStatus.COMPLETE) {
          console.log(`Item guid=${item.guid} is COMPLETE.`);
        }

        if (record.status === FeedRecordStatus.FAILED) {
          console.log(`Item guid=${item.guid} is FAILED and requires manual intervention. Skipping.`);
        }
      } catch (err) {
        console.log(`Failed to process item guid=${item.guid}: ${err}`);
      }
    }
  },
};
