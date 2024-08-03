import * as d3 from "d3";
import _ from "lodash";
import {
  formatCurrency,
  formatFloat,
  tooltip,
  skipTicks,
  type PortfolioAggregate,
  type CommodityBreakdown,
  getColorPreference,
  rem,
  svgTruncate,
  type Legend,
  darkenOrLighten
} from "./utils";

export function filterCommodityBreakdowns(
  portfolioAggregates: PortfolioAggregate[],
  commodities: string[]
): PortfolioAggregate[] {
  let pas = _.flatMap(_.cloneDeep(portfolioAggregates), (pa) => {
    const breakdowns = _.filter(pa.breakdowns, (b) => {
      return _.includes(commodities, b.commodity_name);
    });
    if (_.isEmpty(breakdowns)) {
      return [];
    }
    pa.breakdowns = breakdowns;
    return [pa];
  });
  const total = _.sumBy(pas, (pa) => _.sumBy(pa.breakdowns, (b) => b.amount));
  pas = pas.map((pa) => {
    pa.amount = _.sumBy(pa.breakdowns, (b) => b.amount);
    pa.percentage = (pa.amount / total) * 100;
    pa.breakdowns = _.map(pa.breakdowns, (b) => {
      b.percentage = (b.amount / pa.amount) * 100;
      return b;
    });
    return pa;
  });
  return _.sortBy(pas, (pa) => -pa.amount);
}

export function renderPortfolioBreakdown(
  id: string,
  portfolioAggregates: PortfolioAggregate[],
  options: { small?: boolean; z?: any } = {
    small: false,
    z: null
  }
): {
  legends: Legend[];
  renderer: (portfolioAggregates: PortfolioAggregate[], color: any) => void;
} {
  const { small } = options;
  const BAR_HEIGHT = rem(25);
  const svg = d3.select(id),
    margin = { top: rem(20), right: 0, bottom: rem(10), left: rem(20) },
    fullWidth =
      Math.max(
        document.getElementById(id.substring(1)).parentElement.clientWidth,
        small ? 320 : 800
      ) - 2,
    width = fullWidth - margin.left - margin.right,
    g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  svg.attr("width", fullWidth);

  const y = d3.scaleBand().paddingInner(0.1).paddingOuter(0);

  const targetWidth = small ? width - rem(190) : rem(500);
  const targetMargin = rem(20);
  const textGroupWidth = rem(150);
  const textGroupMargin = rem(20);
  const textGroupZero = targetWidth + targetMargin;

  const x = d3.scaleLinear().range([textGroupZero + textGroupWidth + textGroupMargin, width]);
  const x1 = d3.scaleLinear().range([0, targetWidth]);

  const groups = _.chain(portfolioAggregates)
    .map((p) => p.sub_group)
    .uniq()
    .sort()
    .value();

  const aggregatesg = svg.append("g");
  const labelGroupg = svg
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  const lineg = g.append("line").classed("svg-grey-lightest", true);

  g.append("text")
    .classed("svg-text-grey", true)
    .text("%")
    .attr("text-anchor", "end")
    .attr("x", textGroupZero + textGroupWidth / 2)
    .attr("y", -5);

  g.append("text")
    .classed("svg-text-grey", true)
    .text("Amount")
    .attr("text-anchor", "end")
    .attr("x", textGroupZero + textGroupWidth)
    .attr("y", -5);

  const axisxg = g.append("g");

  const textGroupg = g.append("g");

  const treemap = d3.select(id + "-treemap");
  const treemapg = treemap.append("div");

  let rendered = false;

  let z: any;
  if (!_.isEmpty(groups)) {
    const range =
      options.z || (getColorPreference() == "dark" ? d3.schemeCategory10 : d3.schemePastel2);

    z = d3.scaleOrdinal<string>().domain(groups).range(range);
  }

  return {
    legends: groups.map((g) => {
      return {
        label: g,
        color: z ? z(g) : "",
        shape: "square"
      };
    }),
    renderer: (
      portfolioAggregates: PortfolioAggregate[],
      color: d3.ScaleOrdinal<string, string>
    ) => {
      if (_.isEmpty(portfolioAggregates)) {
        treemap.style("display", "none");
        svg.style("display", "none");
        return;
      }

      treemap.style("display", null);
      svg.style("display", null);

      const t = svg.transition().duration(rendered ? 750 : 0);
      rendered = true;
      const height = portfolioAggregates.length * BAR_HEIGHT;
      const maxX = _.chain(portfolioAggregates)
        .flatMap((t) => [t.percentage])
        .max()
        .value();
      x.domain([0, maxX]);
      x1.domain([0, maxX]);

      y.domain(portfolioAggregates.map((t) => t.id));
      y.range([0, height]);
      svg.transition(t).attr("height", height + margin.top + margin.bottom);

      const paddingTop = (BAR_HEIGHT - y.bandwidth()) / 2;

      const aggregates = aggregatesg
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
        .selectAll("rect")
        .data(portfolioAggregates, (d: any) => d.id);

      aggregates.join(
        (enter) =>
          enter
            .append("rect")
            .attr("fill", (d) => z(d.sub_group))
            .attr("data-tippy-content", "")
            .attr("x", x1(0))
            .attr("y", function (d) {
              return y(d.id) + paddingTop;
            })
            .attr("width", function (d) {
              return x1(d.percentage);
            })
            .attr("height", y.bandwidth()),
        (update) =>
          update
            .transition(t)
            .attr("y", function (d) {
              return y(d.id) + paddingTop;
            })
            .attr("width", function (d) {
              return x1(d.percentage);
            }),
        (exit) => exit.transition(t).attr("width", 0).remove()
      );

      lineg
        .attr("x1", 0)
        .attr("y1", height + 2 * paddingTop)
        .attr("x2", width - textGroupMargin)
        .attr("y2", height + 2 * paddingTop);

      axisxg
        .transition(t)
        .attr("class", "axis y")
        .attr("transform", "translate(0," + height + ")")
        .call(
          d3
            .axisTop(x1)
            .tickSize(height)
            .tickFormat(skipTicks(40, x1, (n: number) => formatFloat(n, 1)))
        );

      const labelGroup = labelGroupg
        .selectAll("g")
        .data(portfolioAggregates, (d: any) => d.percentage.toString());

      const labelGroupEnter = labelGroup.enter().append("g").attr("class", "inline-text");

      labelGroupEnter
        .append("text")
        .text((t) => formatName(t.group))
        .attr("dominant-baseline", "middle")
        .classed("svg-text-black svg-text-shadow", true)
        .attr("x", 5)
        .attr("y", (t) => y(t.id) + BAR_HEIGHT / 2)
        .each(svgTruncate(targetWidth));

      labelGroup.exit().remove();

      const textGroup = textGroupg
        .selectAll("g")
        .data(portfolioAggregates, (d: any) => d.percentage.toString());

      const textGroupEnter = textGroup.enter().append("g").attr("class", "inline-text");

      textGroupEnter
        .append("line")
        .classed("svg-grey-lightest", true)
        .attr("x1", 0)
        .attr("y1", (t) => y(t.id))
        .attr("x2", width - textGroupMargin)
        .attr("y2", (t) => y(t.id));

      textGroupEnter
        .append("text")
        .text((t) => formatFloat(t.percentage))
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .classed("svg-text-grey-dark", true)
        .attr("x", textGroupZero + textGroupWidth / 2)
        .attr("y", (t) => y(t.id) + BAR_HEIGHT / 2);

      textGroupEnter
        .append("text")
        .text((t) => formatCurrency(t.amount))
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .classed("svg-text-grey-dark", true)
        .attr("x", textGroupZero + textGroupWidth)
        .attr("y", (t) => y(t.id) + BAR_HEIGHT / 2);

      textGroup.exit().remove();

      if (!small) {
        const tree = treemapg
          .style("height", height + margin.top + margin.bottom + "px")
          .style("position", "absolute")
          .style("width", "100%")
          .selectAll("div")
          .data(portfolioAggregates, (d: any) => d.id);

        const partitionWidth = x.range()[1] - x.range()[0];

        tree
          .join("div")
          .style("position", "absolute")
          .style("left", margin.left + x(0) + "px")
          .style("top", (t) => margin.top + y(t.id) + paddingTop + "px")
          .style("height", y.bandwidth() + "px")
          .style("width", x.range()[1] - x.range()[0] + "px")
          .append("div")
          .style("position", "relative")
          .style("height", y.bandwidth() + "px")
          .each(function (pa) {
            renderPartition(this, pa, d3.treemap(), color, partitionWidth);
          });
      }
    }
  };
}

function renderPartition(
  element: HTMLElement,
  pa: PortfolioAggregate,
  hierarchy: any,
  color: d3.ScaleOrdinal<string, string>,
  clientWidth: number
) {
  if (_.isEmpty(pa.breakdowns)) {
    return;
  }

  const rootBreakdown: CommodityBreakdown = {
    security_id: "",
    security_name: "",
    security_type: "",
    percentage: 0,
    commodity_name: "root",
    amount: pa.amount
  };

  pa.breakdowns.unshift(rootBreakdown);

  const byName: Record<string, CommodityBreakdown> = _.chain(pa.breakdowns)
    .map((b) => [b.commodity_name, b])
    .fromPairs()
    .value();

  const div = d3.select(element),
    margin = { top: 0, right: 0, bottom: 0, left: 20 },
    width = clientWidth - margin.left - margin.right,
    height = +div.style("height").replace("px", "") - margin.top - margin.bottom;

  const percent = (d: d3.HierarchyNode<CommodityBreakdown>) => {
    return formatFloat((d.value / root.value) * 100) + "%";
  };

  const stratify = d3
    .stratify<CommodityBreakdown>()
    .id((d) => d.commodity_name)
    .parentId((d) => (d.commodity_name == "root" ? null : "root"));

  const partition = hierarchy.size([width, height]).round(true);

  const root = stratify(pa.breakdowns)
    .sum((a) => a.percentage)
    .sort(function (a, b) {
      return b.height - a.height || b.value - a.value;
    });

  partition(root);

  div
    .selectAll(".node")
    .data(root.descendants(), (d: any) => d.id)
    .join("div")
    .attr("class", "node")
    .attr("data-tippy-content", (d) => {
      const breakdown = byName[d.id];
      return tooltip([
        ["Commodity", [breakdown.commodity_name, "has-text-right"]],
        ["Security Count", [breakdown.security_id.split(",").length.toString(), "has-text-right"]],
        ["Amount", [formatCurrency(breakdown.amount), "has-text-weight-bold has-text-right"]],
        ["Percentage", [percent(d), "has-text-weight-bold has-text-right"]]
      ]);
    })
    .style("top", (d: any) => d.y0 + "px")
    .style("left", (d: any) => d.x0 + "px")
    .style("width", (d: any) => d.x1 - d.x0 + "px")
    .style("height", (d: any) => d.y1 - d.y0 + "px")
    .style("background", (d) => color(d.id))
    .style("color", (d) => darkenOrLighten(color(d.id)))
    .selectAll("p")
    .data(
      (d) => d,
      (d: any) => d.id
    )
    .join("p")
    .style("font-size", ".7rem")
    .attr("class", "has-text-weight-bold")
    .text((d) => `${d.id} ${formatFloat(d.value)}%`);
}

function formatName(name: string): string {
  const clean = name.replaceAll(
    /([#]|[*]|EQ - |\bINC\b|\bCorp\b|\bInc\b|\bLTD\b|\bLtd\b|\bLt\b|\bLimited\b|\bLIMITED\b|\(.*\)|[., ]+$)/g,
    ""
  );

  if (clean == name) {
    return clean;
  }
  return formatName(clean);
}
