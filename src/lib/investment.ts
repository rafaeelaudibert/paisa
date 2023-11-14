import * as d3 from "d3";
import legend from "d3-svg-legend";
import _ from "lodash";
import {
  forEachMonth,
  formatCurrency,
  formatCurrencyCrude,
  formatFloat,
  type Posting,
  secondName,
  skipTicks,
  tooltip,
  type InvestmentYearlyCard,
  rem,
  now
} from "./utils";
import { generateColorScheme } from "./colors";
import type dayjs from "dayjs";

function financialYear(card: InvestmentYearlyCard) {
  return `${card.start_date.format("YYYY")} - ${card.end_date.format("YY")}`;
}

export function renderMonthlyInvestmentTimeline(postings: Posting[]) {
  const id = "#d3-investment-timeline";
  const timeFormat = "MMM-YYYY";
  const MAX_BAR_WIDTH = rem(40);
  const svg = d3.select(id),
    margin = { top: rem(40), right: rem(30), bottom: rem(60), left: rem(40) },
    width =
      document.getElementById(id.substring(1)).parentElement.clientWidth -
      margin.left -
      margin.right,
    height = +svg.attr("height") - margin.top - margin.bottom,
    g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  const groups = _.chain(postings)
    .map((p) => secondName(p.account))
    .uniq()
    .sort()
    .value();
  const groupKeys = _.flatMap(groups, (g) => [g + "-credit", g + "-debit"]);

  const defaultValues = _.zipObject(
    groupKeys,
    _.map(groupKeys, () => 0)
  );

  const start = _.min(_.map(postings, (p) => p.date)),
    end = now().startOf("month");
  const ts = _.groupBy(postings, (p) => p.date.format(timeFormat));

  interface Point {
    month: string;
    [key: string]: number | string | dayjs.Dayjs;
  }
  const points: Point[] = [];

  forEachMonth(start, end, (month) => {
    const postings = ts[month.format(timeFormat)] || [];
    const values = _.chain(postings)
      .groupBy((t) => secondName(t.account))
      .flatMap((postings, key) => [
        [
          key + "-credit",
          _.sum(
            _.filter(
              _.map(postings, (p) => p.amount),
              (a) => a >= 0
            )
          )
        ],
        [
          key + "-debit",
          _.sum(
            _.filter(
              _.map(postings, (p) => p.amount),
              (a) => a < 0
            )
          )
        ]
      ])
      .fromPairs()
      .value();

    points.push(
      _.merge(
        {
          month: month.format(timeFormat),
          postings: postings
        },
        defaultValues,
        values
      )
    );
  });

  const x = d3.scaleBand().range([0, width]).paddingInner(0.1).paddingOuter(0);
  const y = d3.scaleLinear().range([height, 0]);

  const sum = (filter: (n: number) => boolean) => (p: Point) =>
    _.sum(
      _.filter(
        _.map(groupKeys, (k) => p[k]),
        filter
      )
    );
  x.domain(points.map((p) => p.month));
  y.domain([
    d3.min(
      points,
      sum((a) => a < 0)
    ),
    d3.max(
      points,
      sum((a) => a > 0)
    )
  ]);

  const z = generateColorScheme(groups);

  g.append("g")
    .attr("class", "axis x")
    .attr("transform", "translate(0," + height + ")")
    .call(
      d3
        .axisBottom(x)
        .ticks(5)
        .tickFormat(skipTicks(30, x, (d) => d.toString()))
    )
    .selectAll("text")
    .attr("y", 10)
    .attr("x", -8)
    .attr("dy", ".35em")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end");

  g.append("g")
    .attr("class", "axis y")
    .call(d3.axisLeft(y).tickSize(-width).tickFormat(formatCurrencyCrude));

  g.append("g")
    .selectAll("g")
    .data(
      d3.stack().offset(d3.stackOffsetDiverging).keys(groupKeys)(
        points as { [key: string]: number }[]
      )
    )
    .enter()
    .append("g")
    .attr("fill", function (d) {
      return z(d.key.split("-")[0]);
    })
    .selectAll("rect")
    .data(function (d) {
      return d;
    })
    .enter()
    .append("rect")
    .attr("data-tippy-content", (d) => {
      const postings: Posting[] = (d.data as any).postings;
      const total = _.sumBy(postings, (p) => p.amount);
      return tooltip(
        _.sortBy(
          postings.map((p) => [
            _.drop(p.account.split(":")).join(":"),
            [formatCurrency(p.amount), "has-text-weight-bold has-text-right"]
          ]),
          (r) => r[0]
        ),
        { total: formatCurrency(total), header: postings[0]?.date.format("MMM YYYY") }
      );
    })
    .attr("x", function (d) {
      return (
        x((d.data as any).month) + (x.bandwidth() - Math.min(x.bandwidth(), MAX_BAR_WIDTH)) / 2
      );
    })
    .attr("y", function (d) {
      return y(d[1]);
    })
    .attr("height", function (d) {
      return y(d[0]) - y(d[1]);
    })
    .attr("width", Math.min(x.bandwidth(), MAX_BAR_WIDTH));

  svg.append("g").attr("class", "legendOrdinal").attr("transform", "translate(40,0)");

  const legendOrdinal = legend
    .legendColor()
    .shape("rect")
    .orient("horizontal")
    .shapePadding(100)
    .labels(groups)
    .scale(z);

  svg.select(".legendOrdinal").call(legendOrdinal as any);
}

export function renderYearlyInvestmentTimeline(yearlyCards: InvestmentYearlyCard[]) {
  const id = "#d3-yearly-investment-timeline";
  const BAR_HEIGHT = rem(20);
  const svg = d3.select(id),
    margin = { top: rem(50), right: rem(20), bottom: rem(20), left: rem(70) },
    width =
      document.getElementById(id.substring(1)).parentElement.clientWidth -
      margin.left -
      margin.right,
    g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  const groups = _.chain(yearlyCards)
    .flatMap((c) => c.postings)
    .map((p) => secondName(p.account))
    .uniq()
    .sort()
    .value();
  const groupKeys = _.flatMap(groups, (g) => [g + "-credit", g + "-debit"]);

  const defaultValues = _.zipObject(
    groupKeys,
    _.map(groupKeys, () => 0)
  );

  const start = _.min(_.map(yearlyCards, (c) => c.start_date)),
    end = _.max(_.map(yearlyCards, (c) => c.end_date));

  const height = BAR_HEIGHT * (end.year() - start.year());
  svg.attr("height", height + margin.top + margin.bottom);

  interface Point {
    year: string;
    [key: string]: number | string | dayjs.Dayjs;
  }
  const points: Point[] = [];

  _.each(yearlyCards, (card) => {
    const postings = card.postings;
    const values = _.chain(postings)
      .groupBy((t) => secondName(t.account))
      .flatMap((postings, key) => [
        [
          key + "-credit",
          _.sum(
            _.filter(
              _.map(postings, (p) => p.amount),
              (a) => a >= 0
            )
          )
        ],
        [
          key + "-debit",
          _.sum(
            _.filter(
              _.map(postings, (p) => p.amount),
              (a) => a < 0
            )
          )
        ]
      ])
      .fromPairs()
      .value();

    points.push(
      _.merge(
        {
          year: financialYear(card),
          postings: postings
        },
        defaultValues,
        values
      )
    );
  });

  const x = d3.scaleLinear().range([0, width]);
  const y = d3.scaleBand().range([height, 0]).paddingInner(0.1).paddingOuter(0);

  const sum = (filter: (n: number) => boolean) => (p: Point) =>
    _.sum(
      _.filter(
        _.map(groupKeys, (k) => p[k]),
        filter
      )
    );
  y.domain(points.map((p) => p.year));
  x.domain([
    d3.min(
      points,
      sum((a) => a < 0)
    ),
    d3.max(
      points,
      sum((a) => a > 0)
    )
  ]);

  const z = generateColorScheme(groups);

  g.append("g")
    .attr("class", "axis y")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x).tickSize(-height).tickFormat(formatCurrencyCrude));

  g.append("g").attr("class", "axis y dark").call(d3.axisLeft(y));

  g.append("g")
    .selectAll("g")
    .data(
      d3.stack().offset(d3.stackOffsetDiverging).keys(groupKeys)(
        points as { [key: string]: number }[]
      )
    )
    .enter()
    .append("g")
    .attr("fill", function (d) {
      return z(d.key.split("-")[0]);
    })
    .selectAll("rect")
    .data(function (d) {
      return d;
    })
    .enter()
    .append("rect")
    .attr("data-tippy-content", (d) => {
      let grandTotal = 0;
      return tooltip(
        _.sortBy(
          groupKeys.flatMap((k) => {
            const total = d.data[k];
            if (total == 0) {
              return [];
            }
            grandTotal += total;
            return [
              [
                k.replace("-credit", "").replace("-debit", ""),
                [formatCurrency(total), "has-text-weight-bold has-text-right"]
              ]
            ];
          }),
          (r) => r[0]
        ),
        { total: formatCurrency(grandTotal), header: d.data.year as any }
      );
    })
    .attr("x", function (d) {
      return x(d[0]);
    })
    .attr("y", function (d) {
      return y((d.data as any).year) + (y.bandwidth() - Math.min(y.bandwidth(), BAR_HEIGHT)) / 2;
    })
    .attr("width", function (d) {
      return x(d[1]) - x(d[0]);
    })
    .attr("height", y.bandwidth());

  svg.append("g").attr("class", "legendOrdinal").attr("transform", `translate(${margin.top},0)`);

  const legendOrdinal = legend
    .legendColor()
    .shape("rect")
    .orient("horizontal")
    .shapePadding(rem(100))
    .labels(groups)
    .scale(z);

  svg.select(".legendOrdinal").call(legendOrdinal as any);
}

export function renderYearlyCards(yearlyCards: InvestmentYearlyCard[]) {
  const id = "#d3-yearly-investment-cards";
  const root = d3.select(id);

  const card = root
    .selectAll("div.column")
    .data(_.reverse(yearlyCards))
    .enter()
    .append("div")
    .attr("class", "column is-4")
    .append("div")
    .attr("class", "card");

  card
    .append("header")
    .attr("class", "card-header")
    .append("p")
    .attr("class", "card-header-title")
    .text((c) => financialYear(c));

  card
    .append("div")
    .attr("class", "card-content p-1")
    .append("div")
    .attr("class", "content")
    .html((card) => {
      return `
<table class="table is-narrow is-fullwidth is-size-7 is-hoverable">
  <tbody>
    <tr>
      <td>Gross Salary Income</td>
      <td class='has-text-right has-text-weight-bold'>${formatCurrency(
        card.gross_salary_income
      )}</td>
    </tr>
    <tr>
      <td>Gross Other Income</td>
      <td class='has-text-right has-text-weight-bold'>${formatCurrency(
        card.gross_other_income
      )}</td>
    </tr>
    <tr>
      <td>Tax</td>
      <td class='has-text-right has-text-weight-bold'>${formatCurrency(card.net_tax)}</td>
    </tr>
    <tr>
      <td>Net Income</td>
      <td class='has-text-right has-text-weight-bold'>${formatCurrency(card.net_income)}</td>
    </tr>
    <tr>
      <td>Net Expense</td>
      <td class='has-text-right has-text-weight-bold'>${formatCurrency(card.net_expense)}</td>
    </tr>
    <tr>
      <td>Investment</td>
      <td class='has-text-right has-text-weight-bold'>${formatCurrency(card.net_investment)}</td>
    </tr>
    <tr>
      <td>Savings Rate</td>
      <td class='has-text-right has-text-weight-bold'>${formatFloat(card.savings_rate)}</td>
    </tr>
  </tbody>
</table>
`;
    });
}
