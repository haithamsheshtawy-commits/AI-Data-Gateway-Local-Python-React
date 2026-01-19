const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = 3001;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Store the last uploaded CSV file path for code execution
let lastUploadedCSVPath = null;

// Helper function to generate response from a model
const generateFromModel = (modelPath, prompt, maxTokens = 500) => {
  return new Promise((resolve, reject) => {
    const mlxCommand =
      "/Users/tapteam/Documents/AI/apple_llama/mlx-env/bin/mlx_lm.generate";
    const command = `${mlxCommand} --model "${modelPath}" --max-tokens ${maxTokens} --prompt "${prompt.replace(/"/g, '\\"')}"`;

    console.log(`Executing command for ${modelPath}:`, command);

    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error with ${modelPath}:`, error);
        reject(error);
      } else {
        if (stderr) {
          console.error("stderr:", stderr);
        }
        console.log(`Response from ${modelPath}:`, stdout);
        resolve(stdout);
      }
    });
  });
};

// Endpoint to generate response from both Llama and Mistral models
app.post("/api/generate", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const mistralPath =
    "/Users/tapteam/Documents/AI/apple_llama/models/mistral-7b-instruct-mlx";
  const llamaPath =
    "/Users/tapteam/Documents/AI/apple_llama/models/Meta-Llama-3-8B-Instruct";

  try {
    // Run both models in parallel
    const [mistralResponse, llamaResponse] = await Promise.all([
      generateFromModel(mistralPath, prompt).catch((err) => ({
        error: err.message,
      })),
      generateFromModel(llamaPath, prompt).catch((err) => ({
        error: err.message,
      })),
    ]);

    res.json({
      mistral: typeof mistralResponse === "string" ? mistralResponse : null,
      llama: typeof llamaResponse === "string" ? llamaResponse : null,
      mistralError:
        typeof mistralResponse === "object" ? mistralResponse.error : null,
      llamaError:
        typeof llamaResponse === "object" ? llamaResponse.error : null,
    });
  } catch (err) {
    console.error("Generation Error:", err);
    res
      .status(500)
      .json({ error: "Failed to generate response", details: err.message });
  }
});

// Helper function to parse CSV file
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
};

// Helper function to analyze CSV data
const analyzeCSVData = (data) => {
  const analysis = {
    rows: data.length,
    columns: Object.keys(data[0] || {}).length,
    columnNames: Object.keys(data[0] || {}),
  };

  return analysis;
};

// Endpoint to analyze CSV file
app.post("/api/analyze-csv", upload.single("csvFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload a CSV file" });
    }

    const userQuestion =
      req.body.question || "Provide general insights about this CSV file.";

    // Parse CSV file
    const data = await parseCSV(req.file.path);

    // Get basic analysis
    const basicAnalysis = analyzeCSVData(data);

    // Create a prompt for the LLM with CSV data summary
    const prompt = `Analyze this CSV file and answer the following question: "${userQuestion}"

File Summary:
- Rows: ${basicAnalysis.rows}
- Columns: ${basicAnalysis.columnNames.join(", ")}
- Sample data (first 5 rows): ${JSON.stringify(data.slice(0, 5), null, 2)}

Please provide detailed insights based on this data.`;

    const mistralPath =
      "/Users/tapteam/Documents/AI/apple_llama/models/mistral-7b-instruct-mlx";
    const llamaPath =
      "/Users/tapteam/Documents/AI/apple_llama/models/Meta-Llama-3-8B-Instruct";

    console.log("Analyzing CSV with both LLMs...");

    // Store the file path for later code execution
    lastUploadedCSVPath = req.file.path;

    try {
      // Run both models in parallel
      const [mistralResponse, llamaResponse] = await Promise.all([
        generateFromModel(mistralPath, prompt).catch((err) => ({
          error: err.message,
        })),
        generateFromModel(llamaPath, prompt).catch((err) => ({
          error: err.message,
        })),
      ]);

      console.log("Analysis complete");
      res.json({
        mistral: typeof mistralResponse === "string" ? mistralResponse : null,
        llama: typeof llamaResponse === "string" ? llamaResponse : null,
        mistralError:
          typeof mistralResponse === "object" ? mistralResponse.error : null,
        llamaError:
          typeof llamaResponse === "object" ? llamaResponse.error : null,
        basicAnalysis,
        dataPreview: data.slice(0, 10),
        fullData: data,
      });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({
        error: "Failed to analyze CSV",
        details: error.message,
        basicAnalysis,
      });
    }
  } catch (error) {
    console.error("CSV Analysis Error:", error);
    res
      .status(500)
      .json({ error: "Failed to process CSV files", details: error.message });
  }
});

// Endpoint to execute code
app.post("/api/execute-code", (req, res) => {
  const { code, language } = req.body;

  if (!code) {
    return res.status(400).json({ error: "Code is required" });
  }

  if (!language || !["python", "javascript"].includes(language)) {
    return res
      .status(400)
      .json({ error: "Language must be 'python' or 'javascript'" });
  }

  const timestamp = Date.now();

  // Replace file references in code with actual CSV path
  let modifiedCode = code;

  if (lastUploadedCSVPath) {
    // Replace ALL CSV file references with the actual uploaded CSV path
    modifiedCode = modifiedCode
      .replace(/open\(['"][^'"]*\.csv['"]/g, `open('${lastUploadedCSVPath}'`)
      .replace(
        /read_csv\(['"][^'"]*\.csv['"]/g,
        `read_csv('${lastUploadedCSVPath}'`,
      )
      .replace(/=\s*['"][^'"]*\.csv['"]/g, `= '${lastUploadedCSVPath}'`);

    console.log(`Replaced CSV paths with: ${lastUploadedCSVPath}`);
  }

  let command;
  const tempFilePath = path.join(__dirname, "uploads", `temp_${timestamp}`);

  if (language === "python") {
    const pythonFile = `${tempFilePath}.py`;
    fs.writeFileSync(pythonFile, modifiedCode);
    command = `python3 "${pythonFile}"`;
  } else if (language === "javascript") {
    const jsFile = `${tempFilePath}.js`;
    fs.writeFileSync(jsFile, modifiedCode);
    command = `node "${jsFile}"`;
  }

  console.log(`Executing ${language} code...`);

  exec(
    command,
    { maxBuffer: 1024 * 1024 * 10, timeout: 30000 },
    (error, stdout, stderr) => {
      // Clean up temp file
      const fileToDelete =
        language === "python" ? `${tempFilePath}.py` : `${tempFilePath}.js`;
      fs.unlink(fileToDelete, (err) => {
        if (err) console.error("Error deleting temp file:", err);
      });

      if (error) {
        console.error("Execution Error:", error);
        return res.status(500).json({
          error: "Code execution failed",
          output: stderr || error.message,
        });
      }

      const output =
        stdout || stderr || "Code executed successfully (no output)";
      console.log("Execution complete");

      res.json({
        output,
      });
    },
  );
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
