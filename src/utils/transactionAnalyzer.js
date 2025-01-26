import { table } from "table";

export class TransactionAnalyzer {
  getSubscriptions(transactions) {
    const subscriptions = transactions.filter(
      (t) => t.category === "SUBSCRIPTION" && t.amount < 0
    );

    const data = [
      ["Service", "Amount", "Last Charged", "Account"],
      ...subscriptions.map((s) => [
        s.description,
        `$${Math.abs(s.amount).toFixed(2)}`,
        s.date,
        s.accountType,
      ]),
    ];

    return table(data);
  }

  getMonthlySummary(transactions) {
    const currentMonth = new Date().getMonth();
    const monthlyTransactions = transactions.filter(
      (t) => new Date(t.date).getMonth() === currentMonth
    );

    const summary = {
      income: 0,
      expenses: 0,
      subscriptions: 0,
    };

    monthlyTransactions.forEach((t) => {
      if (t.amount > 0) summary.income += t.amount;
      else {
        summary.expenses += Math.abs(t.amount);
        if (t.category === "SUBSCRIPTION") {
          summary.subscriptions += Math.abs(t.amount);
        }
      }
    });

    const data = [
      ["Category", "Amount"],
      ["Total Income", `$${summary.income.toFixed(2)}`],
      ["Total Expenses", `$${summary.expenses.toFixed(2)}`],
      ["Subscription Expenses", `$${summary.subscriptions.toFixed(2)}`],
      ["Net", `$${(summary.income - summary.expenses).toFixed(2)}`],
    ];

    return table(data);
  }
}
