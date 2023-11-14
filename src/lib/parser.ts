import type { StreamParser, StringStream } from "@codemirror/language";
import _ from "lodash";

const DATE = /^\d{4}[/-]\d{2}[/-]\d{2}/;
const DATE_TIME = /^\d{4}[/-]\d{2}[/-]\d{2} \d{2}:\d{2}:\d{2}/;
const LOT_DATE = /^\[\d{4}[/-]\d{2}[/-]\d{2}\]/;
const AMOUNT = /^[+-]?(?:[0-9,])+(\.(?:[0-9,])+)?/;
const KEYWORDS = /^(?:commodity)/;
const COMMODITY = /^([A-Za-z_]+)|("[^"]+")/;
const ACCOUNT = /^[^\][(); \t\n]((?!\s{2})[^\][();\t\n])*/;

interface State {
  inTransaction: boolean;
  inPosting: boolean;
  inInclude: boolean;
  accountConsumed: boolean;
  inPrice: boolean;
}

export const ledger: StreamParser<State> = {
  name: "ledger",
  startState: function () {
    return {
      accountConsumed: false,
      inTransaction: false,
      inPosting: false,
      inInclude: false,
      inPrice: false
    };
  },
  token: function (stream: StringStream, state: State) {
    if (stream.sol()) {
      state.inTransaction = false;
      state.accountConsumed = false;
      state.inPrice = false;
    }

    if (stream.eatSpace()) return null;

    if (stream.match("include")) {
      state.inInclude = true;
      return "keyword";
    }

    if (stream.match("P ")) {
      state.inPrice = true;
      return "keyword";
    }

    if (state.inInclude) {
      state.inInclude = false;
      stream.skipToEnd();
      return "link";
    }

    if (state.inPrice && stream.match(COMMODITY)) {
      return "unit";
    }

    if (stream.match(KEYWORDS)) return "keyword";

    if (stream.match(LOT_DATE)) {
      return "tagName";
    }

    if (stream.match(DATE_TIME)) {
      state.inTransaction = false;
      state.inPosting = false;
      return "tagName";
    }

    if (stream.match(DATE)) {
      state.inTransaction = true;
      state.inPosting = false;
      return "tagName";
    }

    if (stream.match(AMOUNT)) return "number";

    const ch = stream.next();
    if (!ch) {
      return;
    }

    if (ch == ";") {
      stream.skipToEnd();
      return "comment";
    }

    if (ch == "@") {
      return "operator";
    }

    if (_.includes(["~", "="], ch)) {
      state.inTransaction = true;
      state.inPosting = false;
      return "operator";
    }

    if (_.includes(["€", "$"], ch)) {
      return "unit";
    }

    stream.backUp(1);

    if (state.inTransaction) {
      state.inTransaction = false;
      state.inPosting = true;
      stream.skipToEnd();
      return "strong";
    }

    if (state.inPosting && !state.accountConsumed && stream.match(ACCOUNT)) {
      state.accountConsumed = true;
      return "string";
    }

    if (state.inPosting && state.accountConsumed && stream.match(COMMODITY)) {
      return "unit";
    }

    stream.next();
  }
};
