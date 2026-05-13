export interface CsvContact {
  email: string;
  name?: string;
  company?: string;
  addedDate?: string;
}

export function parseCsv(content: string): CsvContact[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];

  const results: CsvContact[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const [email, name, company, addedDate] = line.split(",").map((s) => s.trim());
    if (!email) continue;

    results.push({
      email,
      name: name || undefined,
      company: company || undefined,
      addedDate: addedDate || undefined,
    });
  }

  return results;
}
