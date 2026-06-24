import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  NARROW_CHART_MEDIA_QUERY,
  getEarningsChartLayout,
} from "../../earnings-page";

describe("earnings chart responsive layout", () => {
  it("uses compact chart settings below 375px", () => {
    expect(NARROW_CHART_MEDIA_QUERY).toBe("(max-width: 374px)");
    expect(getEarningsChartLayout(true)).toMatchObject({
      marginLeft: -18,
      xAxisMinTickGap: 18,
      tickFontSize: 10,
      yAxisWidth: 44,
      showLegend: false,
      barSize: 12,
    });
  });

  it("keeps the moving-average legend visible at 375px and wider", () => {
    expect(getEarningsChartLayout(false)).toMatchObject({
      marginLeft: 0,
      xAxisMinTickGap: 8,
      tickFontSize: 12,
      yAxisWidth: 60,
      showLegend: true,
      barSize: 24,
    });
  });

  it("does not reintroduce the fixed-width overflow wrapper", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/dashboard/earnings-page.tsx"),
      "utf8"
    );

    const chartSection = source.slice(
      source.indexOf("Time-series chart"),
      source.indexOf("Category breakdown")
    );

    expect(chartSection).toContain('data-testid="earnings-chart-container"');
    expect(chartSection).toContain('className="w-full min-w-0"');
    expect(chartSection).not.toContain("min-w-[500px]");
    expect(chartSection).not.toContain("overflow-x-auto");
  });
});
