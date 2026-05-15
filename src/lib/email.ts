export function extractEmail(fromAddress: string): string {
  const match = fromAddress.match(/<([^>]+)>/);
  return match ? match[1] : fromAddress;
}
