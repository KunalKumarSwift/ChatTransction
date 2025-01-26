import fetch from "node-fetch";

export class OllamaService {
  constructor() {
    this.baseUrl = "http://localhost:11434";
    this.model = null; // Will be set after checking available models
    this.isInitialized = false;
  }

  async verifyConnection() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      const models = data.models || [];
      console.log("Available models:", JSON.stringify(models, null, 2));

      // Try to find the best available model in order of preference
      const preferredModels = ["llama3:latest"];
      this.model = preferredModels.find((preferredModel) =>
        models.some(
          (m) => m.name === preferredModel || m.model === preferredModel
        )
      );

      if (!this.model) {
        console.error(
          "No suitable model found. Please pull a model using 'ollama pull llama3'"
        );
        return false;
      }

      console.log(`Selected model: ${this.model}`);
      this.isInitialized = true;
      return true;
    } catch (error) {
      if (error.name === "AbortError") {
        console.error("Connection timeout while trying to reach Ollama");
      } else {
        console.error("Failed to connect to Ollama:", error);
      }
      return false;
    }
  }

  async analyze(prompt, data) {
    if (!this.isInitialized) {
      await this.verifyConnection();
    }

    const systemPrompt = `You are a financial analysis AI assistant. Your task is to analyze financial data and provide clear, structured responses.

Instructions:
1. When showing financial data, use markdown tables
2. For currency values, always show 2 decimal places
3. Provide brief explanations with your analysis
4. Focus on the specific user query

Available Account Types and Data:
${Object.entries(data)
  .map(
    ([type, transactions]) =>
      `- ${type.toUpperCase()}: ${transactions.length} transactions`
  )
  .join("\n")}

Transaction Fields:
- date: Transaction date
- description: Transaction description
- amount: Transaction amount (negative for expenses)
- category: Transaction category
- accountType: Type of account

User Question: ${prompt}

Available Data:
${JSON.stringify(data, null, 2)}

Please analyze the data and respond to the user's question.`;

    try {
      if (!this.model) {
        throw new Error(
          "No model selected. Please install a model using 'ollama pull llama3'"
        );
      }

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt: systemPrompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_k: 50,
            top_p: 0.95,
            num_predict: 1000,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Ollama API Error:", errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (!result.response) {
        console.error("Unexpected Ollama response:", result);
        throw new Error("Invalid response from Ollama");
      }

      // Post-process the response to ensure proper formatting
      let processedResponse = result.response
        .trim()
        .replace(/```markdown\n?/g, "")
        .replace(/```\n?/g, "");

      return processedResponse;
    } catch (error) {
      console.error("Error calling Ollama:", error);
      throw new Error(`Failed to get AI response: ${error.message}`);
    }
  }
}
