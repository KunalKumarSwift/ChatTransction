# ChatTransaction

A web application for analyzing financial transactions, providing insights into subscriptions and monthly spending patterns.

## Features

- Subscription tracking and analysis
- Monthly financial summaries
- Transaction categorization
- Visual spending reports

## Installation

1. Clone the repository:
   bash
   git clone https://github.com/yourusername/chattransaction.git
   cd chattransaction
2. Install dependencies:
   bash
   npm install
3. Start the development server:
   bash
   npm start

The application will be available at `http://localhost:3000`

## Usage

Import your transactions and use the analyzer to:

- View all active subscriptions
- Get monthly spending summaries
- Track income and expenses
- Monitor subscription costs

## System Architecture

plantuml
@startuml Transaction Analyzer Architecture
package "Frontend" {
[Web UI] as UI
[Transaction Form] as Form
}
package "Utils" {
[Transaction Analyzer] as Analyzer
note right: Processes and analyzes\ntransaction data
}
database "Transaction Data" as Data {
[Transactions]
}
UI --> Form : User inputs
Form --> Analyzer : Raw transaction data
Analyzer --> Data : Processed data
Data --> UI : Display results
@enduml

## API Reference

### TransactionAnalyzer Class

#### getSubscriptions(transactions)

Returns a formatted table of all subscription transactions with the following columns:

- Service name
- Amount
- Last charged date
- Account type

#### getMonthlySummary(transactions)

Returns a formatted table with monthly financial summary including:

- Total income
- Total expenses
- Subscription expenses
- Net balance

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
