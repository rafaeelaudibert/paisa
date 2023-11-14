package server

import (
	"time"

	"github.com/ananthakumaran/paisa/internal/accounting"
	"github.com/ananthakumaran/paisa/internal/query"
	"github.com/ananthakumaran/paisa/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type CashFlow struct {
	Date        time.Time       `json:"date"`
	Income      decimal.Decimal `json:"income"`
	Expenses    decimal.Decimal `json:"expenses"`
	Liabilities decimal.Decimal `json:"liabilities"`
	Investment  decimal.Decimal `json:"investment"`
	Tax         decimal.Decimal `json:"tax"`
	Checking    decimal.Decimal `json:"checking"`
	Balance     decimal.Decimal `json:"balance"`
}

func (c CashFlow) GroupDate() time.Time {
	return c.Date
}

func GetCashFlow(db *gorm.DB) gin.H {
	return gin.H{"cash_flows": computeCashFlow(db, query.Init(db), decimal.Zero)}
}

func GetCurrentCashFlow(db *gorm.DB) []CashFlow {
	balance := accounting.CostSum(query.Init(db).BeforeNMonths(3).AccountPrefix("Assets:Checking").All())
	return computeCashFlow(db, query.Init(db).LastNMonths(3), balance)
}

func computeCashFlow(db *gorm.DB, q *query.Query, balance decimal.Decimal) []CashFlow {
	var cashFlows []CashFlow

	expenses := utils.GroupByMonth(q.Clone().Like("Expenses:%").NotAccountPrefix("Expenses:Tax").All())
	incomes := utils.GroupByMonth(q.Clone().Like("Income:%").All())
	liabilities := utils.GroupByMonth(q.Clone().Like("Liabilities:%").All())
	investments := utils.GroupByMonth(q.Clone().Like("Assets:%").NotAccountPrefix("Assets:Checking").All())
	taxes := utils.GroupByMonth(q.Clone().AccountPrefix("Expenses:Tax").All())
	checkings := utils.GroupByMonth(q.Clone().AccountPrefix("Assets:Checking").All())
	postings := q.Clone().All()

	if len(postings) == 0 {
		return []CashFlow{}
	}

	end := utils.MaxTime(utils.EndOfToday(), postings[len(postings)-1].Date)
	for start := utils.BeginningOfMonth(postings[0].Date); start.Before(end); start = start.AddDate(0, 1, 0) {
		cashFlow := CashFlow{Date: start}

		key := start.Format("2006-01")
		ps, ok := expenses[key]
		if ok {
			cashFlow.Expenses = accounting.CostSum(ps)
		}

		ps, ok = incomes[key]
		if ok {
			cashFlow.Income = accounting.CostSum(ps).Neg()
		}

		ps, ok = liabilities[key]
		if ok {
			cashFlow.Liabilities = accounting.CostSum(ps).Neg()
		}

		ps, ok = investments[key]
		if ok {
			cashFlow.Investment = accounting.CostSum(ps)
		}

		ps, ok = taxes[key]
		if ok {
			cashFlow.Tax = accounting.CostSum(ps)
		}

		ps, ok = checkings[key]
		if ok {
			cashFlow.Checking = accounting.CostSum(ps)
		}

		balance = balance.Add(cashFlow.Checking)
		cashFlow.Balance = balance

		cashFlows = append(cashFlows, cashFlow)
	}

	return cashFlows
}
