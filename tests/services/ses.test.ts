import { describe, it, expect, vi } from "vitest";
import { createSesService } from "../../src/services/ses.js";

describe("SesService.getMaxSendRate", () => {
  it("returns the account max send rate", async () => {
    const mockClient = {
      send: vi.fn().mockResolvedValue({
        SendQuota: { MaxSendRate: 14, Max24HourSend: 50000, SentLast24Hours: 100 },
      }),
    };

    const ses = createSesService(mockClient as any);
    const rate = await ses.getMaxSendRate();

    expect(rate).toBe(14);
  });

  it("defaults to 1 when send quota is unavailable", async () => {
    const mockClient = {
      send: vi.fn().mockResolvedValue({}),
    };

    const ses = createSesService(mockClient as any);
    const rate = await ses.getMaxSendRate();

    expect(rate).toBe(1);
  });

  it("defaults to 1 when the API call fails", async () => {
    const mockClient = {
      send: vi.fn().mockRejectedValue(new Error("AccessDenied")),
    };

    const ses = createSesService(mockClient as any);
    const rate = await ses.getMaxSendRate();

    expect(rate).toBe(1);
  });
});

describe("SesService send tracking", () => {
  function mockClient() {
    return { send: vi.fn().mockResolvedValue({ MessageId: "abc" }) };
  }

  const sendArgs = [
    "News <news@example.com>",
    "alice@example.com",
    "Subject",
    "<p>hi</p>",
    "reply@example.com",
    "my-list",
    "my-topic",
  ] as const;

  it("attaches ConfigurationSetName and EmailTags to SendEmail when provided", async () => {
    const client = mockClient();
    const ses = createSesService(client as any);

    await ses.sendEmail(...sendArgs, {
      configurationSetName: "newsletter-tracking",
      emailTags: [
        { name: "campaign", value: "2026-08-05-launch" },
        { name: "source", value: "newsletter" },
      ],
    });

    const input = client.send.mock.calls[0][0].input;
    expect(input.ConfigurationSetName).toBe("newsletter-tracking");
    expect(input.EmailTags).toEqual([
      { Name: "campaign", Value: "2026-08-05-launch" },
      { Name: "source", Value: "newsletter" },
    ]);
  });

  it("omits both fields from SendEmail when tracking is not provided", async () => {
    const client = mockClient();
    const ses = createSesService(client as any);

    await ses.sendEmail(...sendArgs);

    const input = client.send.mock.calls[0][0].input;
    expect("ConfigurationSetName" in input).toBe(false);
    expect("EmailTags" in input).toBe(false);
    expect(input.ListManagementOptions).toEqual({
      ContactListName: "my-list",
      TopicName: "my-topic",
    });
  });

  it("omits EmailTags when the tag array is empty", async () => {
    const client = mockClient();
    const ses = createSesService(client as any);

    await ses.sendEmail(...sendArgs, {
      configurationSetName: "newsletter-tracking",
      emailTags: [],
    });

    const input = client.send.mock.calls[0][0].input;
    expect(input.ConfigurationSetName).toBe("newsletter-tracking");
    expect("EmailTags" in input).toBe(false);
  });

  it("attaches ConfigurationSetName and DefaultEmailTags to SendBulkEmail", async () => {
    const client = {
      send: vi.fn().mockResolvedValue({ BulkEmailEntryResults: [] }),
    };
    const ses = createSesService(client as any);

    await ses.sendBulkEmail({
      from: "News <news@example.com>",
      replyTo: "reply@example.com",
      templateName: "my-template",
      entries: [{ to: "alice@example.com" }],
      configurationSetName: "newsletter-tracking",
      emailTags: [{ name: "campaign", value: "my-template" }],
    });

    const input = client.send.mock.calls[0][0].input;
    expect(input.ConfigurationSetName).toBe("newsletter-tracking");
    // SendBulkEmail exposes DefaultEmailTags, not EmailTags.
    expect(input.DefaultEmailTags).toEqual([
      { Name: "campaign", Value: "my-template" },
    ]);
  });

  it("omits both fields from SendBulkEmail when not provided", async () => {
    const client = {
      send: vi.fn().mockResolvedValue({ BulkEmailEntryResults: [] }),
    };
    const ses = createSesService(client as any);

    await ses.sendBulkEmail({
      from: "News <news@example.com>",
      replyTo: "reply@example.com",
      templateName: "my-template",
      entries: [{ to: "alice@example.com" }],
    });

    const input = client.send.mock.calls[0][0].input;
    expect("ConfigurationSetName" in input).toBe(false);
    expect("DefaultEmailTags" in input).toBe(false);
  });
});
