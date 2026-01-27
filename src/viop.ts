/**
 * VİOP (Vadeli İşlem ve Opsiyon Piyasası) module for Turkish derivatives market.
 *
 * Data source: İş Yatırım (HTML scraping)
 * Note: Data is delayed by ~15 minutes
 */

import { getVIOPProvider, VIOPContract } from "@/providers/viop";

export { VIOPContract };

/**
 * VIOP class for derivatives data access
 */
export class VIOP {
  private _futuresCache: VIOPContract[] | null = null;
  private _optionsCache: VIOPContract[] | null = null;

  /**
   * Get all futures contracts
   */
  get futures(): Promise<VIOPContract[]> {
    if (this._futuresCache) return Promise.resolve(this._futuresCache);
    return getVIOPProvider()
      .getFutures("all")
      .then((data) => {
        this._futuresCache = data;
        return data;
      });
  }

  /**
   * Get stock futures contracts (Pay Vadeli İşlem)
   */
  get stockFutures(): Promise<VIOPContract[]> {
    return getVIOPProvider().getFutures("stock");
  }

  /**
   * Get index futures contracts (Endeks Vadeli İşlem)
   */
  get indexFutures(): Promise<VIOPContract[]> {
    return getVIOPProvider().getFutures("index");
  }

  /**
   * Get currency futures contracts (Döviz Vadeli İşlem)
   */
  get currencyFutures(): Promise<VIOPContract[]> {
    return getVIOPProvider().getFutures("currency");
  }

  /**
   * Get commodity futures contracts (Kıymetli Madenler)
   */
  get commodityFutures(): Promise<VIOPContract[]> {
    return getVIOPProvider().getFutures("commodity");
  }

  /**
   * Get all options contracts
   */
  get options(): Promise<VIOPContract[]> {
    if (this._optionsCache) return Promise.resolve(this._optionsCache);
    return getVIOPProvider()
      .getOptions("all")
      .then((data) => {
        this._optionsCache = data;
        return data;
      });
  }

  /**
   * Get stock options contracts (Pay Opsiyon)
   */
  get stockOptions(): Promise<VIOPContract[]> {
    return getVIOPProvider().getOptions("stock");
  }

  /**
   * Get index options contracts (Endeks Opsiyon)
   */
  get indexOptions(): Promise<VIOPContract[]> {
    return getVIOPProvider().getOptions("index");
  }

  /**
   * Get all derivatives for a specific underlying symbol
   */
  async getBySymbol(symbol: string): Promise<VIOPContract[]> {
    const upperSymbol = symbol.toUpperCase();

    const [futures, options] = await Promise.all([this.futures, this.options]);

    const all = [...futures, ...options];

    return all.filter(
      (c) =>
        c.contract.toUpperCase().includes(upperSymbol) ||
        c.code.toUpperCase().includes(upperSymbol),
    );
  }
}
