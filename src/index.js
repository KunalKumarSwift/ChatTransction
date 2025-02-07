import { AccountService } from "./api/accountService.js";
import { OllamaService } from "./ai/ollama.js";
import { TransactionAnalyzer } from "./utils/transactionAnalyzer.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import os from 'os';

const execAsync = promisify(exec);
const platform = os.platform();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Platform-specific commands and paths
const OLLAMA_PATHS = {
  darwin: "/Applications/Ollama.app/Contents/Resources/ollama",  // Mac
  win32: "ollama",  // Windows (removed .exe extension)
  linux: "ollama"  // Linux
};

const KILL_COMMANDS = {
  darwin: [
    "pkill -f Ollama.app",
    "pkill -f 'ollama serve'",
    "lsof -ti:11434 | xargs kill -9"
  ],
  win32: [
    "taskkill /F /IM ollama.exe >nul 2>&1",  // Updated Windows commands
    "for /f \"tokens=5\" %a in ('netstat -ano | find \":11434\"') do taskkill /F /PID %a >nul 2>&1"
  ],
  linux: [
    "pkill -f ollama",
    "fuser -k 11434/tcp"
  ]
};

async function killExistingOllama() {
  const commands = KILL_COMMANDS[platform] || KILL_COMMANDS.linux;
  
  for (const cmd of commands) {
    try {
      if (platform === 'win32') {
        // Use cmd.exe explicitly for Windows commands
        await execAsync(cmd, { shell: 'cmd.exe' });
      } else {
        await execAsync(cmd);
      }
    } catch (error) {
      // Ignore errors from kill commands
    }
  }
}

async function startOllamaProcess() {
  const ollamaPath = OLLAMA_PATHS[platform] || OLLAMA_PATHS.linux;
  let command;
  
  if (platform === 'win32') {
    // On Windows, we need to use a different command structure
    command = `start /B ${ollamaPath} serve`;
  } else {
    command = `${ollamaPath} serve`;
  }
  
  return exec(command, { 
    maxBuffer: 1024 * 1024 * 10,
    windowsHide: true,
    shell: platform === 'win32' ? 'cmd.exe' : '/bin/sh'
  });
}

async function restartOllama() {
  try {
    console.log("Checking Ollama status...");
    
    const ollamaService = new OllamaService();
    
    // Try to connect first - Ollama might already be running
    try {
      if (await ollamaService.verifyConnection()) {
        console.log("Ollama is already running and responding");
        return null;
      }
    } catch (error) {
      console.log("Ollama not responding, attempting restart...");
      
      // On Windows, we need to ensure the port is actually free
      if (platform === 'win32') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await killExistingOllama();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log("Stopping existing Ollama processes...");
    await killExistingOllama();

    // Wait longer on Windows for processes to clean up
    const cleanupDelay = platform === 'win32' ? 3000 : 2000;
    await new Promise(resolve => setTimeout(resolve, cleanupDelay));

    console.log("Starting new Ollama instance...");
    const ollamaProcess = await startOllamaProcess();

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
        console.error("Ollama Error:", message);
      }
    });

    // Wait for Ollama to be ready
    let retries = 0;
    const maxRetries = 10;
    const retryDelay = 2000;

    while (retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      try {
        if (await ollamaService.verifyConnection()) {
          console.log("Successfully connected to Ollama");
          return ollamaProcess;
        }
      } catch (error) {
        console.log(`Retry ${retries + 1}/${maxRetries}: Waiting for Ollama...`);
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

// Update the cleanup function
function setupCleanup(ollamaProcess) {
  const cleanup = async () => {
    console.log("\nShutting down server...");
    if (ollamaProcess) {
      ollamaProcess.kill();
      // Give the process a moment to clean up
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGUSR2", cleanup); // For nodemon restart
}

async function startServer() {
  try {
    const ollamaProcess = await restartOllama();
    
    if (ollamaProcess) {
      setupCleanup(ollamaProcess);
    }

    app.listen(PORT, () => {
      console.log(`Financial AI agent running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
