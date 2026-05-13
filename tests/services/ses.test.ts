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
