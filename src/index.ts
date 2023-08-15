import { XMLParser } from "fast-xml-parser";

export interface Env {
  FEED_ITEMS: KVNamespace;
  OPENAI_API_KEY: string;
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

interface CompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
    index: number;
  }[];
}

function generatePrompt(description: string, poemStart: string) {
  return `
The following is a poem about an AWS incident. The poem is less than 10 lines and rhymes:

Incident:
${description}

Poem:
${poemStart}`;
}

function generateToot(item: RssItem, poem: string) {
  return `## ${item.title} ##

${poem}

Source: ${item.guid}`;
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
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
      for (const item of items) {
        const recordValue = await env.FEED_ITEMS.get(item.guid);
        if (recordValue) {
          console.log(`Found record with guid=${item.guid}. Skipping...`);
        } else {
          console.log(
            `Did not find record with guid=${item.guid}. Generating...`
          );

          const incident = JSON.stringify(item, null, 2);
          const poemStart = "Roses are red,\nViolets are blue,\n";
          const prompt = generatePrompt(incident, poemStart);

          const completionRes = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                  {
                    role: "system",
                    content: prompt,
                  },
                ],
              }),
            }
          );
          if (completionRes.status === 200) {
            const completionContent: CompletionResponse =
              await completionRes.json();
            console.log(`Successfully received completion.`);

            const completion = completionContent.choices[0].message.content;
            const poem = poemStart + completion;
            const toot = generateToot(item, poem);
            const tootRes = await fetch(`${env.MSTDN_URL}/api/v1/statuses`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.MSTDN_ACCESS_TOKEN}`,
              },
              body: JSON.stringify({
                status: toot,
              }),
            });
            if (tootRes.status === 200) {
              console.log(`Successfully tooted poem.`);

              await env.FEED_ITEMS.put(item.guid, toot);
              console.log(`Successfully wrote incident record.`);
            } else {
              console.error(`Failed to toot poem: ${await tootRes.text()}`);
            }
          } else {
            console.error(
              `Failed to generate completion: ${await completionRes.text()}`
            );
          }
        }
      }
    } else {
      console.error(`Failed to fetch status feed: ${await feedRes.text()}`);
    }
  },
};
