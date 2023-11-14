import _ from "lodash";
import Clusturize from "clusterize.js";
import { formatCurrency, formatFloat, postingUrl, type Posting, firstName, now } from "./utils";
import { iconText } from "./icon";
import { accountColorStyle } from "./colors";

export function renderPostings(postings: Posting[]) {
  const rows = _.map(postings, (p) => {
    const purchase = formatCurrency(p.amount);
    const date = p.date.format("DD MMM YYYY");

    let market = "",
      change = "",
      changePercentage = "",
      changeClass = "",
      price = "",
      units = "";
    if (p.commodity !== USER_CONFIG.default_currency) {
      units = formatFloat(p.quantity, 4);
      price = formatCurrency(Math.abs(p.amount / p.quantity), 4);
      const days = now().diff(p.date, "days");
      if (p.quantity > 0 && days > 0) {
        market = formatCurrency(p.market_amount);
        const changeAmount = p.market_amount - p.amount;
        if (changeAmount > 0) {
          changeClass = "has-text-success";
        } else if (changeAmount < 0) {
          changeClass = "has-text-danger";
        }
        const perYear = 365 / days;
        changePercentage = formatFloat((changeAmount / p.amount) * 100 * perYear);
        change = formatCurrency(changeAmount);
      }
    }

    let postingStatus = "";
    if (p.status == "cleared")
      postingStatus = `<span class="icon is-small">
    <i class="fa-solid fa-check"></i>
  </span>`;
    else {
      if (p.status == "pending") {
        postingStatus = `<span class="icon is-small">
    <i class="fa-solid fa-exclamation"></i>
  </span>`;
      }
    }

    const markup = `
<tr>
       <td class='whitespace-nowrap'>${date}</td>
       <td class='is-size-7' style='vertical-align: middle'>${postingStatus}<a class="secondary-link" href=${postingUrl(
         p
       )}>${p.payee}</a></td>
       <td class='custom-icon'><span style='${accountColorStyle(firstName(p.account))}'>${iconText(
         p.account
       )}</span> ${p.account}</td>
       <td class='has-text-right'>${purchase}</td>
       <td class='has-text-right'>${units}</td>
       <td class='has-text-right'>${price}</td>
       <td class='has-text-right'>${market}</td>
       <td class='${changeClass} has-text-right'>${change}</td>
       <td class='${changeClass} has-text-right'>${changePercentage}</td>
</tr>
`;
    return {
      date: date,
      markup: markup,
      posting: p
    };
  });

  const clusterTable = new Clusturize({
    rows: _.map(rows, (r) => r.markup),
    scrollId: "d3-postings-container",
    contentId: "d3-postings",
    rows_in_block: 100
  });

  return { rows, clusterTable };
}

export function filterPostings(
  rows: { date: string; posting: Posting; markup: string }[],
  filter: string
) {
  let filterRegex = new RegExp(".*", "i");
  if (filter) {
    filterRegex = new RegExp(filter, "i");
  }

  return _.filter(
    rows,
    (r) =>
      filterRegex.test(r.posting.account) ||
      filterRegex.test(r.posting.payee) ||
      filterRegex.test(r.date)
  );
}
