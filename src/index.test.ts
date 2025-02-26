import { describe, beforeEach, it, expect, beforeAll } from "vitest";
import { env, fetchMock, createExecutionContext, createScheduledController } from "cloudflare:test";
import handlers, { Env, FeedRecord, FeedRecordStatus } from ".";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env { }
}

function mockSuccessfulRssFeed() {
  const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title><![CDATA[Amazon Web Services Service Status]]></title>
    <link>http://status.aws.amazon.com/</link>
    <language>en-us</language>
    <lastBuildDate>Wed, 29 Mar 2023 00:05:52 PDT</lastBuildDate>
    <generator>AWS Service Health Dashboard RSS Generator</generator>
    <description><![CDATA[Amazon Web Services Service Status]]></description>
    <ttl>5</ttl>
    <!-- You seem to care about knowing about your events, why not check out https://docs.aws.amazon.com/health/latest/ug/getting-started-api.html -->


	 <item>
	  <title><![CDATA[Ode to Unit Testing]]></title>
	  <link>http://status.aws.amazon.com/</link>
	  <pubDate>Tue, 28 Mar 2023 16:52:00 PDT</pubDate>
	  <guid isPermaLink="false">http://status.aws.amazon.com/sample1</guid>
	  <description><![CDATA[Sample description 1]]></description>
	 </item>
  </channel>
</rss>`;
  fetchMock
    .get("https://status.aws.amazon.com")
    .intercept({ path: `/rss/all.rss`, method: "GET" })
    .reply(200, rssContent);
}

function mockSuccessfulGeminiCompletion() {
  const completionContent = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: "Roses are red,\nViolets are blue,\nIncreasing code coverage,\nLike eating a dry shoe."
            },
          ],
        },
      },
    ],
  };
  fetchMock
    .get("https://generativelanguage.googleapis.com")
    .intercept({ path: `/v1/models/gemini-1.5-flash:generateContent`, method: "POST" })
    .reply(200, completionContent);
}

function mockFailingGeminiCompletion() {
  fetchMock
    .get("https://generativelanguage.googleapis.com")
    .intercept({ path: `/v1/models/gemini-1.5-flash:generateContent`, method: "POST" })
    .reply(500, "internal server error");
}

function mockSuccessfulToot() {
  fetchMock
    .get(env.MSTDN_URL)
    .intercept({ path: `/api/v1/statuses`, method: "POST" })
    .reply(200, {});
}

function mockFailingToot() {
  fetchMock
    .get(env.MSTDN_URL)
    .intercept({ path: `/api/v1/statuses`, method: "POST" })
    .reply(500, "internal server error");
}

describe("test scheduled handler", () => {
  beforeAll(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  beforeEach(async () => {
    await env.FEED_ITEMS.delete("http://status.aws.amazon.com/sample1");
  });

  it("should complete record generating poem when no existing record", async () => {
    mockSuccessfulRssFeed();
    mockSuccessfulGeminiCompletion();
    mockSuccessfulToot();

    const controller = createScheduledController();
    const ctx = createExecutionContext();

    await handlers.scheduled(controller, env, ctx);

    const res = await env.FEED_ITEMS.get(
      "http://status.aws.amazon.com/sample1"
    );

    const expectedPoem = `Roses are red,
Violets are blue,
Increasing code coverage,
Like eating a dry shoe.`;

    const feedRecord: FeedRecord = JSON.parse(res!)

    expect(feedRecord.status).toBe(FeedRecordStatus.COMPLETE);
    expect(feedRecord.poem).toBe(expectedPoem);
  });

  it("should complete record without generating poem when existing PENDING_TOOT record", async () => {
    mockSuccessfulRssFeed();
    mockSuccessfulToot();

    const storedPoem = `Roses are red,
  Violets are blue,
  Service in alarm,
  And I don't know what to do.`;
    const storedFeedRecord: FeedRecord = {
      status: FeedRecordStatus.PENDING_TOOT,
      poem: storedPoem,
    }

    await env.FEED_ITEMS.put(
      "http://status.aws.amazon.com/sample1",
      JSON.stringify(storedFeedRecord),
    );

    const controller = createScheduledController();
    const ctx = createExecutionContext();

    await handlers.scheduled(controller, env, ctx);

    const res = await env.FEED_ITEMS.get(
      "http://status.aws.amazon.com/sample1"
    );
    const feedRecord: FeedRecord = JSON.parse(res!);

    const expectedPoem = `Roses are red,
  Violets are blue,
  Service in alarm,
  And I don't know what to do.`;

    expect(feedRecord.status).toBe(FeedRecordStatus.COMPLETE);
    expect(feedRecord.poem).toBe(expectedPoem);
  });

  it("should complete record without generating poem when existing COMPLETE record", async () => {
    mockSuccessfulRssFeed();

    const storedPoem = `Roses are red,
  Violets are blue,
  Service in alarm,
  And I don't know what to do.`;
    const storedFeedRecord: FeedRecord = {
      status: FeedRecordStatus.COMPLETE,
      poem: storedPoem,
    }

    await env.FEED_ITEMS.put(
      "http://status.aws.amazon.com/sample1",
      JSON.stringify(storedFeedRecord),
    );

    const controller = createScheduledController();
    const ctx = createExecutionContext();

    await handlers.scheduled(controller, env, ctx);

    const res = await env.FEED_ITEMS.get(
      "http://status.aws.amazon.com/sample1"
    );
    const feedRecord: FeedRecord = JSON.parse(res!);

    const expectedPoem = `Roses are red,
  Violets are blue,
  Service in alarm,
  And I don't know what to do.`;
    expect(feedRecord.status).toBe(FeedRecordStatus.COMPLETE);
    expect(feedRecord.poem).toBe(expectedPoem);
  });

  it("should not set record when no existing record and Gemini completion fails", async () => {
    mockSuccessfulRssFeed();
    mockFailingGeminiCompletion();

    const controller = createScheduledController();
    const ctx = createExecutionContext();

    await handlers.scheduled(controller, env, ctx);

    const res = await env.FEED_ITEMS.get(
      "http://status.aws.amazon.com/sample1"
    );

    expect(res).toBeNull();
  });

  it("should set PENDING_TOOT record when no existing record and Mastodon toot fails", async () => {
    mockSuccessfulRssFeed();
    mockSuccessfulGeminiCompletion();
    mockFailingToot();

    const controller = createScheduledController();
    const ctx = createExecutionContext();

    await handlers.scheduled(controller, env, ctx);

    const res = await env.FEED_ITEMS.get(
      "http://status.aws.amazon.com/sample1"
    );
    const feedRecord: FeedRecord = JSON.parse(res!);

    const expectedPoem = `Roses are red,
Violets are blue,
Increasing code coverage,
Like eating a dry shoe.`;
    expect(feedRecord.status).toBe(FeedRecordStatus.PENDING_TOOT);
    expect(feedRecord.poem).toBe(expectedPoem);
  });

  it("should skip when existing record cannot be parsed", async () => {
    mockSuccessfulRssFeed();

    await env.FEED_ITEMS.put(
      "http://status.aws.amazon.com/sample1",
      "invalid record",
    );

    const controller = createScheduledController();
    const ctx = createExecutionContext();

    await handlers.scheduled(controller, env, ctx);
  });
});
