import { DataNotAvailableError } from "~/exceptions";
import { getPineFacadeProvider } from "~/providers/pine-facade";
import { resilientTest } from "../../helpers/network-utils";

describe("PineFacade Provider Tests (Integration)", () => {
  jest.setTimeout(30000);

  test(
    "PineFacade getIndicator with standard indicator",
    resilientTest(async () => {
      const provider = getPineFacadeProvider();
      const metadata = await provider.getIndicator("RSI");
      expect(metadata).toBeDefined();
      expect(metadata.pineId).toBeDefined();
    }, 1),
  );

  test(
    "PineFacade getIndicator not found",
    resilientTest(async () => {
      const provider = getPineFacadeProvider();
      try {
        await provider.getIndicator("NONEXISTENT_INDICATOR_THAT_DOES_NOT_EXIST");
      } catch (e) {
        expect(
          e instanceof DataNotAvailableError ||
            (e as Error).message.includes("not found") ||
            (e as Error).message.includes("404"),
        ).toBe(true);
      }
    }, 1),
  );

  test(
    "PineFacade getIndicator caching",
    resilientTest(async () => {
      const provider = getPineFacadeProvider();
      await provider.getIndicator("SMA");
      await provider.getIndicator("SMA");
    }, 1),
  );
});
