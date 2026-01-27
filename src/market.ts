import { getKAPProvider } from "~/providers/kap";

export interface CompanyInfo {
  ticker: string;
  name: string;
  city: string;
}

export async function companies(): Promise<CompanyInfo[]> {
  const data = await getKAPProvider().getCompanies();
  return (data as unknown[]).map((c) => {
    const item = c as { ticker: string; name: string; city: string };
    return {
      ticker: item.ticker,
      name: item.name,
      city: item.city,
    };
  });
}

export async function searchCompanies(query: string): Promise<CompanyInfo[]> {
  const data = await getKAPProvider().search(query);
  return (data as unknown[]).map((c) => {
    const item = c as { ticker: string; name: string; city: string };
    return {
      ticker: item.ticker,
      name: item.name,
      city: item.city,
    };
  });
}
