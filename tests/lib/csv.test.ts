import { describe, it, expect } from "vitest";
import { parseCsv } from "../../src/lib/csv.js";

describe("parseCsv", () => {
  it("parses a valid CSV with all fields", () => {
    const csv = `email,name,company,added_date
alice@example.com,Alice,Acme,2026-01-15
bob@example.com,Bob,Initech,2026-02-01`;

    const result = parseCsv(csv);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      email: "alice@example.com",
      name: "Alice",
      company: "Acme",
      addedDate: "2026-01-15",
    });
    expect(result[1]).toEqual({
      email: "bob@example.com",
      name: "Bob",
      company: "Initech",
      addedDate: "2026-02-01",
    });
  });

  it("handles missing optional fields", () => {
    const csv = `email,name,company,added_date
alice@example.com,,,`;

    const result = parseCsv(csv);

    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("alice@example.com");
    expect(result[0].name).toBeUndefined();
    expect(result[0].company).toBeUndefined();
  });

  it("skips empty lines", () => {
    const csv = `email,name,company,added_date
alice@example.com,Alice,,2026-01-15

bob@example.com,Bob,,2026-02-01
`;

    const result = parseCsv(csv);

    expect(result).toHaveLength(2);
  });

  it("returns empty array for header-only CSV", () => {
    const csv = `email,name,company,added_date`;

    const result = parseCsv(csv);

    expect(result).toHaveLength(0);
  });

  it("handles CSV with only email column populated", () => {
    const csv = `email,name,company,added_date
test@example.com,,,
another@example.com,,,`;

    const result = parseCsv(csv);

    expect(result).toHaveLength(2);
    expect(result[0].email).toBe("test@example.com");
    expect(result[1].email).toBe("another@example.com");
  });
});
