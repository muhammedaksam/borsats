import { BondData, getTahvilProvider } from "~/providers/dovizcom-tahvil";

export class Bond {
  public static readonly MATURITIES = ["2Y", "5Y", "10Y"];
  private _maturity: string;
  private _dataCache: BondData | null = null;

  constructor(maturity: string) {
    this._maturity = maturity.toUpperCase();
  }

  get maturity(): string {
    return this._maturity;
  }

  private async load(): Promise<BondData | null> {
    if (!this._dataCache) {
      this._dataCache = await getTahvilProvider().getBond(this._maturity);
    }
    return this._dataCache;
  }

  get name(): Promise<string> {
    return this.load().then((d) => d?.name || "");
  }

  get yieldRate(): Promise<number | null> {
    return this.load().then((d) => (d?.yield !== undefined ? d.yield : null));
  }

  get yieldDecimal(): Promise<number | null> {
    return this.load().then((d) =>
      d?.yieldDecimal !== undefined ? d.yieldDecimal : null,
    );
  }

  get change(): Promise<number | null> {
    return this.load().then((d) => (d?.change !== undefined ? d.change : null));
  }

  get changePct(): Promise<number | null> {
    return this.load().then((d) =>
      d?.changePct !== undefined ? d.changePct : null,
    );
  }

  get info(): Promise<BondData | null> {
    return this.load();
  }
}

export async function bonds(): Promise<BondData[]> {
  const data = await getTahvilProvider().getBondYields();
  return data || [];
}

export async function riskFreeRate(): Promise<number | null> {
  return getTahvilProvider().get10YYield();
}
