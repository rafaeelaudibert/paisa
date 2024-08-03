import type { SyntaxNode } from "@lezer/common";
import * as Terms from "./parser.terms";
import type { EditorState } from "@codemirror/state";
import { BigNumber } from "bignumber.js";
import { asTransaction, formatCurrency, type Posting, type SheetLineResult } from "$lib/utils";
import {
  buildAST as buildSearchAST,
  QueryAST,
  type TransactionPredicate
} from "$lib/search_query_editor";
import { type Diagnostic } from "@codemirror/lint";

const STACK_LIMIT = 1000;

export class Environment {
  scope: Record<string, any>;
  depth: number;
  postings: Posting[];

  constructor() {
    this.scope = {};
    this.depth = 0;
  }

  clone(): Environment {
    const env = new Environment();
    env.postings = this.postings;
    env.depth = this.depth;
    env.scope = { ...this.scope };
    return env;
  }

  extend(scope: Record<string, any>): Environment {
    const env = new Environment();
    env.postings = this.postings;
    env.depth = this.depth + 1;
    if (this.depth > STACK_LIMIT) {
      throw new Error("Call stack overflow");
    }
    env.scope = { ...this.scope, ...scope };
    return env;
  }
}

export class Query {
  predicate: TransactionPredicate;
  result: Posting[] | null;

  constructor(predicate: TransactionPredicate) {
    this.predicate = predicate;
    this.result = null;
  }

  resolve(env: Environment): Posting[] {
    if (this.result === null) {
      this.result = env.postings
        .map(asTransaction)
        .filter(this.predicate)
        .map((t) => t.postings[0]);
    }
    return this.result;
  }

  and(query: Query): Query {
    return new Query((t) => this.predicate(t) && query.predicate(t));
  }

  or(query: Query): Query {
    return new Query((t) => this.predicate(t) || query.predicate(t));
  }

  toString(): string {
    return "";
  }
}

abstract class AST {
  readonly id: number;
  constructor(readonly node: SyntaxNode) {
    this.id = node.type.id;
  }

  abstract validate(): Diagnostic[];

  abstract evaluate(env: Environment): any;
}

class NumberAST extends AST {
  readonly value: BigNumber;
  constructor(node: SyntaxNode, state: EditorState) {
    super(node);
    this.value = new BigNumber(state.sliceDoc(node.from, node.to).replaceAll(",", ""));
  }

  evaluate(): any {
    return this.value;
  }

  validate(): Diagnostic[] {
    return [];
  }
}

class PercentAST extends AST {
  readonly value: BigNumber;
  constructor(node: SyntaxNode, state: EditorState) {
    super(node);
    this.value = new BigNumber(
      state.sliceDoc(node.from, node.to).replaceAll(/[%,]/g, "")
    ).dividedBy(new BigNumber(100));
  }

  evaluate(): any {
    return this.value;
  }

  validate(): Diagnostic[] {
    return [];
  }
}

class IdentifierAST extends AST {
  readonly name: string;
  constructor(node: SyntaxNode, state: EditorState) {
    super(node);
    this.name = state.sliceDoc(node.from, node.to);
  }

  evaluate(env: Environment): any {
    if (env.scope[this.name] === undefined) {
      throw new Error(`Undefined variable ${this.name}`);
    }
    return env.scope[this.name];
  }

  validate(): Diagnostic[] {
    return [];
  }
}

class UnaryExpressionAST extends AST {
  readonly operator: string;
  readonly value: ExpressionAST;
  constructor(node: SyntaxNode, state: EditorState) {
    super(node);
    this.operator = state.sliceDoc(node.firstChild.from, node.firstChild.to);
    this.value = new ExpressionAST(node.lastChild, state);
  }

  evaluate(env: Environment): any {
    let value: any;
    switch (this.operator) {
      case "-":
        value = this.value.evaluate(env);
        assertType("Number", value);
        return (value as BigNumber).negated();
      case "+":
        value = this.value.evaluate(env);
        assertType("Number", value);
        return value;
      default:
        throw new Error("Unexpected operator");
    }
  }

  validate(): Diagnostic[] {
    return this.value.validate();
  }
}

class BinaryExpressionAST extends AST {
  readonly operator: string;
  readonly left: ExpressionAST;
  readonly right: ExpressionAST;
  constructor(node: SyntaxNode, state: EditorState) {
    super(node);
    this.left = new ExpressionAST(node.firstChild, state);
    this.operator = state.sliceDoc(
      node.firstChild.nextSibling.from,
      node.firstChild.nextSibling.to
    );
    this.right = new ExpressionAST(node.lastChild, state);
  }

  evaluate(env: Environment): any {
    const left = this.left.evaluate(env);
    const right = this.right.evaluate(env);
    switch (this.operator) {
      case "+":
        assertType("Number", left);
        assertType("Number", right);
        return (left as BigNumber).plus(right);
      case "-":
        assertType("Number", left);
        assertType("Number", right);
        return (left as BigNumber).minus(right);
      case "*":
        assertType("Number", left);
        assertType("Number", right);
        return (left as BigNumber).times(right);
      case "/":
        assertType("Number", left);
        assertType("Number", right);
        return (left as BigNumber).dividedBy(right);
      case "^":
        assertType("Number", left);
        assertType("Number", right);
        return (left as BigNumber).exponentiatedBy(right);
      case "AND":
        assertType("Query", left);
        assertType("Query", right);
        return (left as Query).and(right);
      case "OR":
        assertType("Query", left);
        assertType("Query", right);
        return (left as Query).or(right);
      default:
        throw new Error("Unexpected operator");
    }
  }

  validate(): Diagnostic[] {
    return [...this.left.validate(), ...this.right.validate()];
  }
}

class FunctionCallAST extends AST {
  readonly identifier: string;
  readonly arguments: ExpressionAST[];
  constructor(node: SyntaxNode, state: EditorState) {
    super(node);
    this.identifier = state.sliceDoc(node.firstChild.from, node.firstChild.to);
    this.arguments = childrens(node.firstChild.nextSibling).map(
      (node) => new ExpressionAST(node, state)
    );
  }

  evaluate(env: Environment): any {
    const fun = env.scope[this.identifier];
    if (typeof fun !== "function") {
      throw new Error(`Undefined function ${this.identifier}`);
    }
    return fun(env, ...this.arguments.map((arg) => arg.evaluate(env)));
  }

  validate(): Diagnostic[] {
    return this.arguments.flatMap((arg) => arg.validate());
  }
}

class PostingsAST extends AST {
  readonly predicate: TransactionPredicate;
  readonly value: QueryAST;
  constructor(node: SyntaxNode, state: EditorState) {
    super(node);
    this.value = buildSearchAST(state, node.lastChild.firstChild.nextSibling);
  }

  evaluate(): Query {
    return new Query(this.value.evaluate());
  }

  validate(): Diagnostic[] {
    return this.value.validate();
  }
}

class ExpressionAST extends AST {
  readonly value:
    | NumberAST
    | IdentifierAST
    | UnaryExpressionAST
    | BinaryExpressionAST
    | ExpressionAST
    | FunctionCallAST
    | PostingsAST;
  constructor(node: SyntaxNode, state: EditorState) {
    super(node);
    switch (node.firstChild.type.id) {
      case Terms.Literal:
        switch (node.firstChild.firstChild.type.id) {
          case Terms.Number:
            this.value = new NumberAST(node.firstChild, state);
            break;
          case Terms.Percent:
            this.value = new PercentAST(node.firstChild, state);
            break;
          default:
            throw new Error("Unexpected node type");
        }
        break;
      case Terms.UnaryExpression:
        this.value = new UnaryExpressionAST(node.firstChild, state);
        break;
      case Terms.BinaryExpression:
        this.value = new BinaryExpressionAST(node.firstChild, state);
        break;

      case Terms.Grouping:
        this.value = new ExpressionAST(node.firstChild.firstChild, state);
        break;

      case Terms.Identifier:
        this.value = new IdentifierAST(node.firstChild, state);
        break;

      case Terms.FunctionCall:
        this.value = new FunctionCallAST(node.firstChild, state);
        break;

      case Terms.Postings:
        this.value = new PostingsAST(node.firstChild, state);
        break;

      default:
        throw new Error("Unexpected node type");
    }
  }

  evaluate(env: Environment): any {
    return this.value.evaluate(env);
  }

  validate(): Diagnostic[] {
    return this.value.validate();
  }
}

class AssignmentAST extends AST {
  readonly identifier: string;
  readonly value: ExpressionAST;
  constructor(node: SyntaxNode, state: EditorState) {
    super(node);
    this.identifier = state.sliceDoc(node.firstChild.from, node.firstChild.to);
    this.value = new ExpressionAST(node.lastChild, state);
  }

  evaluate(env: Environment): any {
    env.scope[this.identifier] = this.value.evaluate(env);
    return env.scope[this.identifier];
  }

  validate(): Diagnostic[] {
    return this.value.validate();
  }
}

class HeaderAST extends AST {
  readonly text: string;
  constructor(node: SyntaxNode, state: EditorState) {
    super(node);
    this.text = state.sliceDoc(node.from, node.to);
  }

  evaluate(): any {
    return this.text;
  }

  validate(): Diagnostic[] {
    return [];
  }
}

class FunctionDefinitionAST extends AST {
  readonly identifier: string;
  readonly parameters: string[];
  readonly body: ExpressionAST;
  constructor(node: SyntaxNode, state: EditorState) {
    super(node);
    this.identifier = state.sliceDoc(node.firstChild.from, node.firstChild.to);
    this.parameters = childrens(node.firstChild.nextSibling).map((node) =>
      state.sliceDoc(node.from, node.to)
    );
    this.body = new ExpressionAST(node.lastChild, state);
  }

  evaluate(env: Environment): any {
    env.scope[this.identifier] = (env: Environment, ...args: any[]) => {
      const newEnv = env.extend({});
      for (let i = 0; i < args.length; i++) {
        newEnv.scope[this.parameters[i]] = args[i];
      }
      return this.body.evaluate(newEnv);
    };
    return null;
  }

  validate(): Diagnostic[] {
    return this.body.validate();
  }
}

class LineAST extends AST {
  readonly lineNumber: number;
  readonly valueId: number;
  readonly value: ExpressionAST | AssignmentAST | FunctionDefinitionAST | HeaderAST;
  constructor(node: SyntaxNode, state: EditorState) {
    super(node);
    this.lineNumber = state.doc.lineAt(node.from).number;
    const child = node.firstChild;
    this.valueId = child.type.id;
    switch (child.type.id) {
      case Terms.Expression:
        this.value = new ExpressionAST(child, state);
        break;
      case Terms.Assignment:
        this.value = new AssignmentAST(child, state);
        break;
      case Terms.FunctionDefinition:
        this.value = new FunctionDefinitionAST(child, state);
        break;
      case Terms.Header:
        this.value = new HeaderAST(child, state);
        break;
      default:
        throw new Error("Unexpected node type");
    }
  }

  evaluate(env: Environment): Record<string, any> {
    let value = this.value.evaluate(env);
    if (value instanceof BigNumber) {
      value = formatCurrency(value.toNumber());
    }
    switch (this.valueId) {
      case Terms.Assignment:
      case Terms.Expression:
        return { result: value?.toString() || "" };
      case Terms.FunctionDefinition:
        return { result: "" };
      case Terms.Header:
        return { result: value?.toString() || "", align: "left", bold: true };
      default:
        throw new Error("Unexpected node type");
    }
  }

  validate(): Diagnostic[] {
    return this.value.validate();
  }
}

class SheetAST extends AST {
  readonly lines: LineAST[];
  constructor(node: SyntaxNode, state: EditorState) {
    super(node);
    const nodes = childrens(node);
    this.lines = [];
    for (const node of nodes) {
      try {
        this.lines.push(new LineAST(node, state));
      } catch (e) {
        break;
      }
    }
  }

  evaluate(env: Environment): SheetLineResult[] {
    const results: SheetLineResult[] = [];
    let lastLineNumber = 0;
    for (const line of this.lines) {
      while (line.lineNumber > lastLineNumber + 1) {
        results.push({ line: lastLineNumber + 1, error: false, result: "" });
        lastLineNumber++;
      }
      try {
        const resultObject = line.evaluate(env);
        results.push({ line: line.lineNumber, error: false, ...resultObject } as SheetLineResult);
        lastLineNumber++;
      } catch (e) {
        results.push({ line: line.lineNumber, error: true, result: e.message });
        break;
      }
    }
    return results;
  }

  validate(): Diagnostic[] {
    return this.lines.flatMap((line) => line.validate());
  }
}

function childrens(node: SyntaxNode): SyntaxNode[] {
  if (!node) {
    return [];
  }

  const cur = node.cursor();
  const result: SyntaxNode[] = [];
  if (!cur.firstChild()) {
    return result;
  }

  do {
    result.push(cur.node);
  } while (cur.nextSibling());
  return result;
}

export function buildAST(node: SyntaxNode, state: EditorState): SheetAST {
  return new SheetAST(node, state);
}

export function assertType(type: "Number" | "Query" | "Postings", value: any) {
  let valueType = "Unknown";
  if (value instanceof BigNumber) {
    valueType = "Number";
  } else if (value instanceof Query) {
    valueType = "Query";
  } else if (value instanceof Array) {
    valueType = "Array";
  }

  if (type === "Postings") {
    if (valueType === "Query" || valueType === "Array") {
      return;
    }
    throw new Error(`Expected ${type}, got ${valueType}`);
  }

  if (type !== valueType) {
    throw new Error(`Expected ${type}, got ${valueType}`);
  }
}
