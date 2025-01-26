export class AccountService {
  constructor() {
    // Simulated account data
    this.accounts = {
      checking: {
        id: "check123",
        type: "CHECKING",
        balance: 5000.0,
        transactions: [
          {
            date: "2024-03-15",
            description: "Netflix Subscription",
            amount: -15.99,
            category: "SUBSCRIPTION",
          },
          {
            date: "2024-03-14",
            description: "YouTube Premium",
            amount: -11.99,
            category: "SUBSCRIPTION",
          },
          {
            date: "2024-03-13",
            description: "Salary Deposit",
            amount: 3000.0,
            category: "INCOME",
          },
        ],
      },
      savings: {
        id: "save456",
        type: "SAVINGS",
        balance: 10000.0,
        transactions: [
          {
            date: "2024-03-10",
            description: "Interest Credit",
            amount: 5.5,
            category: "INTEREST",
          },
        ],
      },
    };
  }

  async getAccounts() {
    return Object.values(this.accounts);
  }

  async getTransactions(accountId) {
    const account = Object.values(this.accounts).find(
      (acc) => acc.id === accountId
    );
    return account ? account.transactions : [];
  }

  async getAllTransactions() {
    const allTransactions = [];
    for (const account of Object.values(this.accounts)) {
      allTransactions.push(
        ...account.transactions.map((t) => ({
          ...t,
          accountType: account.type,
        }))
      );
    }
    return allTransactions;
  }
}
