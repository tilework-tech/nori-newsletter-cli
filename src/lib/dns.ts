import dns from "node:dns/promises";

export interface DnsResolver {
  resolveMx(
    domain: string
  ): Promise<Array<{ priority: number; exchange: string }>>;
  resolveTxt(domain: string): Promise<string[][]>;
  resolveCname(hostname: string): Promise<string[]>;
}

export function createDnsResolver(): DnsResolver {
  return {
    resolveMx: (domain) => dns.resolveMx(domain),
    resolveTxt: (domain) => dns.resolveTxt(domain),
    resolveCname: (hostname) => dns.resolveCname(hostname),
  };
}
