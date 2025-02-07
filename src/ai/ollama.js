import { Ollama } from "ollama";

export class OllamaService {
  constructor() {
    this.ollama = new Ollama({
      host: "http://127.0.0.1:11434"
    });
    this.model = null;
    this.isInitialized = false;
  }

  async verifyConnection() {
    try {
      const response = await this.ollama.list();
      const models = response.models || [];  // Extract the models array from response
      console.log("Available models:", JSON.stringify(response, null, 2));

      // Updated preferred models list to match common Ollama model names
      const preferredModels = ["phi3:latest"];
      
      // Find first available preferred model
      for (const modelName of preferredModels) {
        const foundModel = models.find(m => 
          m.name.toLowerCase().includes(modelName.toLowerCase())
        );
        if (foundModel) {
          this.model = foundModel.name;
          break;
        }
      }

      if (!this.model) {
        console.error(
          "No suitable model found. Please pull one of these models:",
          preferredModels.join(", ")
        );
        return false;
      }

      console.log(`Selected model: ${this.model}`);
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error("Failed to connect to Ollama:", error);
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
          "No model selected. Please install a model using 'ollama pull a model'"
        );
      }

      // Use the Ollama client to generate a response
      const response = await this.ollama.generate({
        model: this.model,
        prompt: systemPrompt,
        options: {
          temperature: 0.7,
          top_k: 50,
          top_p: 0.95,
          num_predict: 1000,
        },
      });

      // Post-process the response to ensure proper formatting
      let processedResponse = response.response
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
