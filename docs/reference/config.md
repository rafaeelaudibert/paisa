---
description: "Full list of configuration options supported by Paisa along with their description"
---

# Configuration

All the configuration related to paisa is stored in a yaml file named
`paisa.yaml`. The configuration can be edited via the web
interface. The sequence in which paisa looks for the file is described
below

1. `PAISA_CONFIG` environment variable
1. via `--config` flag
1. Current working directory
1. `paisa/paisa.yaml` file inside User Documents folder.

If it can't find the configuration file, it will create a default
configuration file named `paisa/paisa.yaml` inside User Documents folder. The
default configuration is tuned for Indians, users from other countries
would have to change the `default_currency` and `locale`.

### Accounts

In many places, paisa expects you to specify a list of accounts. You
can type the full account name like `#!ledger
Account:Equity:APPL`. Paisa also supports wildcard `*`, you can use
`#!ledger Account:Equity:*` to represent all accounts under
Equity. It's also possible to use negation. `#!ledger !Expenses:Tax`
will match all accounts except Tax. If you use negation, then all the
accounts should be negation. Don't mix negation with others, if done
the behavior will be undefined.

```yaml
# Path to your journal file. It can be absolute or relative to the
# configuration file. The main journal file can refer other files using
# `include` as long as all the files are in the same or sub directory
# REQUIRED
journal_path: /home/john/Documents/paisa/main.ledger

# Path to your database file. It can be absolute or relative to the
# configuration file. The database file will be created if it does not exist.
# REQUIRED
db_path: /home/john/Documents/paisa/paisa.db

# Path to your sheets directory. It can be absolute or relative to the
# configuration file. The sheets directory will be created if it does not exist.
# By default it will be created in the same directory as the journal file.
# OPTIONAL, DEFAULT: same directory as journal file.
sheets_directory: sheets

# The ledger client to use
# OPTIONAL, DEFAULT: ledger, ENUM: ledger, hledger, beancount
ledger_cli: ledger

# The default currency to use. NOTE: Paisa tries to convert other
# currencies to default currency, so make sure it's possible to
# convert to default currency by specifying the exchange rate.
#
# OPTIONAL, DEFAULT: INR
default_currency: INR

# The precision to show in UI. NOTE: This applies only to the UI, not
# to the entries in journal.
#
# OPTIONAL, DEFAULT: 0
display_precision: 0

# The column to align the amount in the editor.
#
# OPTIONAL, DEFAULT: 52
amount_alignment_column: 52

# The locale used to format numbers. The list of locales supported
# depends on your browser. It's known to work well with en-US and en-IN.
#
# OPTIONAL, DEFAULT: en-IN
locale: en-IN

# The time zone used to parse and format dates. If not set, system
# time zone will be used. Example values are Asia/Kolkata,
# America/New_York, etc
#
# OPTIONAL, DEFAULT: system timezone
time_zone: ""

# First month of the financial year. This can be set to 1 to follow
# January to December.
#
# OPTIONAL, DEFAULT: 4
financial_year_starting_month: 4

# First day of the week. This can be set to 1 to follow Monday to
# Sunday. 0 represents Sunday, 1 represents Monday and so on.
#
# OPTIONAL, DEFAULT: 0
week_starting_day: 0

# When strict mode is enabled, all the accounts and commodities should
# be defined before use. This is same as --pedantic flag in ledger and
# --strict flag in hledger. Doesn't apply to beancount.
#
# OPTIONAL, ENUM: yes, no DEFAULT: no
strict: "no"

## Budget
budget:
  # Rollover unspent money to next month
  # OPTIONAL, ENUM: yes, no DEFAULT: yes
  rollover: "yes"

## Goals
goals:
  # Retirement goals
  retirement:
      # Goal name
      # REQUIRED
    - name: Retirement
      # Goal icon
      # REQUIRED
      icon: mdi:palm-tree
      # Safe Withdrawal Rate
      # OPTIONAL, DEFAULT: 4
      swr: 2
      # List of expense accounts
      # OPTIONAL, DEFAULT: Expenses:*
      expenses:
        - Expenses:Clothing
        - Expenses:Education
        - Expenses:Entertainment
        - Expenses:Food
        - Expenses:Gift
        - Expenses:Insurance
        - Expenses:Misc
        - Expenses:Restaurant
        - Expenses:Shopping
        - Expenses:Utilities
      # List of accounts where you keep retirement savings
      # OPTIONAL, DEFAULT: Assets:*
      savings:
        - Assets:Equity:*
        - Assets:Debt:*
      # By default, average of last 3 year expenses will be used to
      # calculate your yearly expenses. This can be overridden by setting
      # this configuration to positive value
      # OPTIONAL, DEFAULT: 0
      yearly_expenses: 0
  savings:
      # Goal name
      # REQUIRED
    - name: House
      # Goal icon
      # REQUIRED
      icon: fluent-emoji-high-contrast:house-with-garden
      # Goal target amount
      # REQUIRED
      target: 100000
      # Goal target date
      # OPTIONAL (either target_date or payment_per_period can be specified)
      target_date: "2030-01-01"
      # Expected rate of returns
      # OPTIONAL
      payment_per_period: 0
      # Expected rate of returns
      # OPTIONAL, REQUIRED if target_date or payment_per_period is set
      rate: 5
      # List of accounts where you keep the goal's savings
      # REQUIRED
      accounts:
        - Assets:Equity:**
## Schedule AL
# OPTIONAL, DEFAULT: []
schedule_al:
  # Code
  # REQUIRED, ENUM: immovable, metal, art, vehicle, bank, share,
  # insurance, loan, cash, liability
  - code: metal
    accounts:
      - Assets:Gold
  - code: bank
    accounts:
      - Assets:Checking
      - Assets:Debt:Cash:FD
  - code: share
    accounts:
      - Assets:Equity:*
  - code: insurance
    accounts:
      - Assets:Debt:Insurance

## Allocation Target
# OPTIONAL, DEFAULT: []
allocation_targets:
  - name: Debt
    target: 30
    accounts:
      - Assets:Debt:*
      - Assets:Checking
  - name: Equity
    target: 60
    accounts:
      - Assets:Equity:*
  - name: Equity Foreign
    target: 20
    accounts:
      - Assets:Equity:NASDAQ
  - name: Equity Index
    target: 20
    accounts:
      - Assets:Equity:NIFTY
  - name: Equity Active
    target: 20
    accounts:
      - Assets:Equity:PPFAS
  - name: Others
    target: 10
    accounts:
      - Assets:Gold
      - Assets:RealEstate

## Commodities
# OPTIONAL, DEFAULT: []
commodities:
  - name: NASDAQ
    # Required, ENUM: mutualfund, stock, nps, unknown
    type: mutualfund
    price:
      # Required, ENUM: in-mfapi, com-yahoo, com-purifiedbytes-nps, co-alphavantage
      provider: in-mfapi
      # differs based on provider
      code: 145552
    harvest: 1095
    # Optional, ENUM: equity65, equity35, debt, unlisted_equity
    tax_category: debt
  - name: NIFTY
    type: mutualfund
    price:
      provider: in-mfapi
      code: 120716
    harvest: 365
    tax_category: equity65
  - name: APPLE
    type: stock
    price:
      provider: com-yahoo
      code: AAPL
    harvest: 1095
    tax_category: equity65

## Display builtin templates
# OPTION, DEFAULT: FALSE
display_builtin_templates: true

## Import Templates
# OPTIONAL, DEFAULT: []
import_templates:
  - name: SBI Account Statement
    # Required
    content: |
      {{#if (isDate ROW.A "D MMM YYYY")}}
        {{date ROW.A "D MMM YYYY"}} {{ROW.C}}
        {{#if (isBlank ROW.F)}}
          {{predictAccount prefix="Expenses"}}      {{amount ROW.E}} INR
          Assets:Checking:SBI
        {{else}}
          Assets:Checking:SBI                       {{amount ROW.F}} INR
          {{predictAccount prefix="Income"}}
        {{/if}}
      {{/if}}
    # Should be a valid handlebar template

## Accounts: account customization
# OPTIONAL, DEFAULT: []
accounts:
  - name: Liabilities:CreditCard:IDFC
    # Required, name of the account
    icon: arcticons:idfc-first-bank
    # Optional, use the UI to select the icon.

## List of user accounts.
# If the list is empty, then no authentication will be performed
#
# OPTIONAL, DEFAULT: []
user_accounts:
  - username: john.doe
    # Required
    password: sha256:a96dc73edd639b1c711b006e714bd2ff5bf5c1aecd77d0b3c3370403c66d58e5
    # Required, password hashed twice with sha256, then prefixed sha256:
    # echo -n 'secret' | sha256sum | head -c 64 | sha256sum | head -c 64

## List of credit cards
# OPTIONAL, DEFAULT: []
credit_cards:
  - account: Liabilities:CreditCard:Freedom
    # Required, account name
    credit_limit: 150000
    # Required, credit limit of the card
    statement_end_day: 8
    # Required, the day of the month when the statement is generated
    due_day: 20
    # Required, the day of the month when the payment is due
    network: visa
    # Required, the network of the card
    number: "0007"
    # Required, the last 4 digits of the card number
    expiration_date: "2029-05-01"
    # Required, the expiration date of the card
```
