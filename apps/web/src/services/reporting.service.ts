import { calculateAdvanceBalance, calculateCashBalance } from "@taher/core";
import { localDb } from "@taher/db";

export interface MonthlyFinancePoint {
  month: string;
  income: number;
  cashExpenses: number;
  payroll: number;
}

export interface ExpenseCategoryPoint {
  category: string;
  amount: number;
  count: number;
}

export interface CompanyReport {
  companyId: string;
  from: string;
  to: string;
  currency: string;
  cashBalance: number;
  cashIncome: number;
  cashOutflow: number;
  expensesTotal: number;
  payrollTotal: number;
  advancesOutstanding: number;
  socialDue: number;
  workersCount: number;
  archivePending: number;
  transactionCount: number;
  monthly: MonthlyFinancePoint[];
  expenseCategories: ExpenseCategoryPoint[];
  generatedAt: string;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function monthStart(value: string): string {
  return value.slice(0, 7) + "-01";
}

function monthsBetween(from: string, to: string): string[] {
  const start = new Date(from.slice(0, 7) + "-01T00:00:00Z");
  const end = new Date(to.slice(0, 7) + "-01T00:00:00Z");
  const months: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && months.length < 120) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export async function buildCompanyReport(
  companyId: string,
  currency: string,
  from: string,
  to: string
): Promise<CompanyReport> {
  if (!companyId.trim()) throw new Error("Company is required to build a report.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error("The report date range is invalid.");
  }

  const [
    cashRows, openingRows, expenseRows, wageRows, wagePayments,
    advanceRows, socialRows, workers, archiveRows
  ] = await Promise.all([
    localDb.cashTransactions.where("company_id").equals(companyId).toArray(),
    localDb.cashOpeningBalances.where("company_id").equals(companyId).toArray(),
    localDb.expenses.where("company_id").equals(companyId).toArray(),
    localDb.wages.where("company_id").equals(companyId).toArray(),
    localDb.wagePayments.where("company_id").equals(companyId).toArray(),
    localDb.advances.where("company_id").equals(companyId).toArray(),
    localDb.socialSecurityDeclarations.where("company_id").equals(companyId).toArray(),
    localDb.workers.where("company_id").equals(companyId).toArray(),
    localDb.archives.where("company_id").equals(companyId).toArray()
  ]);

  const cash = cashRows.filter(row => row.deleted_at === null);
  const openings = openingRows.filter(row => row.deleted_at === null);
  const expenses = expenseRows.filter(row => row.deleted_at === null && row.expense_date >= from && row.expense_date <= to);
  const wages = wageRows.filter(row => row.deleted_at === null && row.wage_month >= monthStart(from) && row.wage_month <= monthStart(to));
  const payments = wagePayments.filter(row => row.payment_date >= from && row.payment_date <= to);
  const advances = advanceRows.filter(row => row.deleted_at === null && row.movement_date <= to);
  const allWagesToDate = wageRows.filter(row => row.deleted_at === null && row.wage_month <= monthStart(to));
  const social = socialRows.filter(row => row.deleted_at === null && row.declaration_period >= monthStart(from) && row.declaration_period <= monthStart(to));
  const monthKeys = monthsBetween(from, to);

  const monthly = monthKeys.map(month => {
    const income = cash
      .filter(row => row.transaction_date.startsWith(month) && row.transaction_type === "income")
      .reduce((sum, row) => sum + row.amount, 0);
    const cashExpenses = cash
      .filter(row => row.transaction_date.startsWith(month) && row.transaction_type === "expense")
      .reduce((sum, row) => sum + row.amount, 0);
    const payroll = payments
      .filter(row => row.payment_date.startsWith(month))
      .reduce((sum, row) => sum + row.amount, 0);
    return { month, income: roundMoney(income), cashExpenses: roundMoney(cashExpenses), payroll: roundMoney(payroll) };
  });

  const grouped = new Map<string, { amount: number; count: number }>();
  for (const expense of expenses) {
    const current = grouped.get(expense.expense_type) ?? { amount: 0, count: 0 };
    current.amount = roundMoney(current.amount + expense.amount_ttc);
    current.count += 1;
    grouped.set(expense.expense_type, current);
  }

  const advancesBalance = calculateAdvanceBalance(advances, allWagesToDate);
  const cashBalance = calculateCashBalance(openings, cash, to);
  const cashInRange = cash.filter(row => row.transaction_date >= from && row.transaction_date <= to);
  const company = await localDb.companies.get(companyId);

  return {
    companyId,
    from,
    to,
    currency: currency || company?.currency_code || "DZD",
    cashBalance,
    cashIncome: roundMoney(cashInRange.filter(row => row.transaction_type === "income").reduce((sum, row) => sum + row.amount, 0)),
    cashOutflow: roundMoney(cashInRange.filter(row => row.transaction_type === "expense").reduce((sum, row) => sum + row.amount, 0)),
    expensesTotal: roundMoney(expenses.reduce((sum, row) => sum + row.amount_ttc, 0)),
    payrollTotal: roundMoney(wages.reduce((sum, row) => sum + row.net_due, 0)),
    advancesOutstanding: advancesBalance.outstanding,
    socialDue: roundMoney(social.reduce((sum, row) => sum + Math.max(0, row.amount_due - row.amount_paid), 0)),
    workersCount: workers.filter(row => row.deleted_at === null && row.status === "active").length,
    archivePending: archiveRows.filter(row => row.deleted_at === null && !row.delivered_to_accountant).length,
    transactionCount: cashInRange.length,
    monthly,
    expenseCategories: [...grouped.entries()]
      .map(([category, values]) => ({ category, amount: values.amount, count: values.count }))
      .sort((a, b) => b.amount - a.amount),
    generatedAt: new Date().toISOString()
  };
}
