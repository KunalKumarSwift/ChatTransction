import { AccountService } from "./api/accountService.js";
import { OllamaService } from "./ai/ollama.js";
import { TransactionAnalyzer } from "./utils/transactionAnalyzer.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function restartOllama() {
  try {
    // Kill both the app and the serve process
    console.log("Stopping existing Ollama processes...");

    // Kill Ollama.app process
    await execAsync("pkill -f Ollama.app").catch(() => {
      // Ignore error if no process found
    });

    // Kill any ollama serve processes
    await execAsync("pkill -f 'ollama serve'").catch(() => {
      // Ignore error if no process found
    });

    // Force kill any remaining processes on port 11434
    await execAsync("lsof -ti:11434 | xargs kill -9").catch(() => {
      // Ignore error if no process found
    });

    // Wait longer for processes to clean up
    console.log("Waiting for processes to clean up...");
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Increased to 5 seconds

    // Start new Ollama instance
    console.log("Starting new Ollama instance...");
    const ollamaProcess = exec(
      "/Applications/Ollama.app/Contents/Resources/ollama serve",
      { maxBuffer: 1024 * 1024 * 10 } // Increase buffer size to 10MB
    );

    let serverError = null;

    // Log Ollama output
    ollamaProcess.stdout?.on("data", (data) => {
      const message = data.toString().trim();
      if (!message.includes("llama_")) {
        console.log("Ollama:", message);
      }
    });

    ollamaProcess.stderr?.on("data", (data) => {
      const message = data.toString().trim();
      if (message.includes("error") && !message.includes("llama_")) {
        serverError = message;
        console.error("Ollama Error:", message);
      }
    });

    // Wait for Ollama to be ready and verify connection
    let retries = 0;
    const maxRetries = 15; // Increased retries
    const retryDelay = 3000; // 3 seconds between retries

    while (retries < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));

      if (serverError) {
        console.error("Server encountered an error:", serverError);
        throw new Error(serverError);
      }

      try {
        const ollamaService = new OllamaService();
        if (await ollamaService.verifyConnection()) {
          console.log("Successfully connected to Ollama");
          return ollamaProcess;
        }
      } catch (error) {
        console.log(
          `Retry ${
            retries + 1
          }/${maxRetries}: Waiting for Ollama to be ready... (${error.message})`
        );
      }
      retries++;
    }

    throw new Error("Failed to connect to Ollama after multiple attempts");
  } catch (error) {
    console.error("Error managing Ollama process:", error);
    throw error;
  }
}

const app = express();
app.use(express.json());

// Set up EJS as the view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const accountService = new AccountService();
const ollamaService = new OllamaService();
const analyzer = new TransactionAnalyzer();

// Serve the chat interface
app.get("/", (req, res) => {
  res.render("chat");
});

app.post("/api/query", async (req, res) => {
  try {
    const { query } = req.body;

    // Get all financial data
    const transactions = await accountService.getAllTransactions();
    const accounts = await accountService.getAccounts();

    // Pre-process common queries with specific handlers
    let response;
    if (query.toLowerCase().includes("subscription")) {
      response = analyzer.getSubscriptions(transactions);
    } else if (query.toLowerCase().includes("monthly summary")) {
      response = analyzer.getMonthlySummary(transactions);
    } else {
      // Prepare data for AI analysis
      const financialData = {
        transactions: transactions,
        accounts: accounts.map((acc) => ({
          type: acc.type,
          balance: acc.balance,
          transactionCount: acc.transactions.length,
        })),
        summary: {
          totalBalance: accounts.reduce((sum, acc) => sum + acc.balance, 0),
          totalTransactions: transactions.length,
          dateRange: {
            start: transactions.reduce(
              (min, t) => (!min || t.date < min ? t.date : min),
              null
            ),
            end: transactions.reduce(
              (max, t) => (!max || t.date > max ? t.date : max),
              null
            ),
          },
        },
      };

      // Use Ollama for complex queries
      response = await ollamaService.analyze(query, financialData);
    }

    res.json({ response });
  } catch (error) {
    console.error("Error processing query:", error);
    res.status(500).json({
      response:
        "I apologize, but I encountered an error while processing your request. " +
        "Please make sure Ollama is running and try again.",
    });
  }
});

const PORT = process.env.PORT || 3000;

// Add a cleanup function for process termination
function setupCleanup(ollamaProcess) {
  const cleanup = async () => {
    console.log("\nShutting down server...");
    if (ollamaProcess) {
      ollamaProcess.kill();
      // Additional cleanup
      await execAsync("pkill -f 'ollama serve'").catch(() => {});
      await execAsync("lsof -ti:11434 | xargs kill -9").catch(() => {});
    }
    process.exit(0);
  };

  // Handle different termination signals
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGUSR2", cleanup); // For nodemon restart
}

// Update the startServer function
async function startServer() {
  try {
    const ollamaProcess = await restartOllama();

    // Set up cleanup handlers
    setupCleanup(ollamaProcess);

    app.listen(PORT, () => {
      console.log(`Financial AI agent running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
