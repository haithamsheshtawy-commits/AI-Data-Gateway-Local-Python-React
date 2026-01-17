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

// Endpoint to generate response from Mistral model
app.post("/api/generate", (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const modelPath =
    "/Users/tapteam/Documents/AI/apple_llama/models/mistral-7b-instruct-mlx";
  const mlxCommand =
    "/Users/tapteam/Documents/AI/apple_llama/mlx-env/bin/mlx_lm.generate";
  const command = `${mlxCommand} --model "${modelPath}" --max-tokens 500 --prompt "${prompt.replace(/"/g, '\\"')}"`;

  console.log("Executing command:", command);

  exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    if (error) {
      console.error("Error:", error);
      return res
        .status(500)
        .json({ error: "Failed to generate response", details: error.message });
    }

    if (stderr) {
      console.error("stderr:", stderr);
    }

    console.log("Response:", stdout);
    res.json({ response: stdout });
  });
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

    const modelPath =
      "/Users/tapteam/Documents/AI/apple_llama/models/mistral-7b-instruct-mlx";
    const mlxCommand =
      "/Users/tapteam/Documents/AI/apple_llama/mlx-env/bin/mlx_lm.generate";
    const command = `${mlxCommand} --model "${modelPath}" --max-tokens 500 --prompt "${prompt.replace(/"/g, '\\"')}"`;

    console.log("Analyzing CSV files with LLM...");

    // Store the file path for later code execution
    lastUploadedCSVPath = req.file.path;

    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      // Don't delete uploaded file yet - keep it for code execution

      if (error) {
        console.error("Error:", error);
        return res.status(500).json({
          error: "Failed to analyze CSV",
          details: error.message,
          basicAnalysis,
        });
      }

      console.log("Analysis complete");
      res.json({
        response: stdout,
        basicAnalysis,
        dataPreview: data.slice(0, 10),
        fullData: data, // Send full data for chart processing
      });
    });
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
  const outputDir = path.join(__dirname, "uploads");
  const chartFilename = `chart_${timestamp}.png`;
  const chartPath = path.join(outputDir, chartFilename);

  if (lastUploadedCSVPath) {
    // Replace ALL CSV file references with the actual uploaded CSV path
    // This catches: open('file.csv'), pd.read_csv('...'), variable = '...', etc.
    modifiedCode = modifiedCode
      .replace(/open\(['"][^'"]*\.csv['"]/g, `open('${lastUploadedCSVPath}'`)
      .replace(
        /read_csv\(['"][^'"]*\.csv['"]/g,
        `read_csv('${lastUploadedCSVPath}'`,
      )
      .replace(/=\s*['"][^'"]*\.csv['"]/g, `= '${lastUploadedCSVPath}'`);

    console.log(`Replaced CSV paths with: ${lastUploadedCSVPath}`);
  }

  // Auto-convert csv module code to pandas with visualization
  if (
    language === "python" &&
    code.includes("csv") &&
    !code.includes("pandas") &&
    !code.includes("matplotlib") &&
    !code.includes("plt.")
  ) {
    const csvToPandasWrapper = `
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd

# Original CSV code
${modifiedCode}

# Convert collected data to pandas DataFrame for visualization
try:
    if 'data' in locals() and isinstance(data, list) and len(data) > 0:
        df = pd.DataFrame(data)
        print(f"\\n📊 Loaded {len(df)} rows and {len(df.columns)} columns from CSV")
        print(f"Columns: {', '.join(df.columns.tolist())}")
        print(f"\\nFirst 10 rows:")
        print(df.head(10).to_string())
        
        # Limit to reasonable size for visualization
        viz_df = df.head(50) if len(df) > 50 else df
        
        # Get numeric columns for pie chart
        numeric_cols = viz_df.select_dtypes(include=['number']).columns.tolist()
        
        if len(numeric_cols) >= 1:
            # Use first non-numeric column as index if available
            non_numeric = [c for c in viz_df.columns if c not in numeric_cols]
            if non_numeric:
                viz_df = viz_df.set_index(non_numeric[0])
                numeric_cols = [c for c in numeric_cols if c in viz_df.columns]
            
            # Create pie chart(s)
            if len(numeric_cols) > 1:
                num_cols = len(numeric_cols)
                num_rows = (num_cols + 1) // 2
                fig, axes = plt.subplots(num_rows, 2, figsize=(16, 6 * num_rows))
                fig.suptitle('Pie Charts - Data Visualization', fontsize=18, fontweight='bold', y=0.995)
                
                axes_flat = axes.flatten() if num_rows > 1 else ([axes] if num_cols == 1 else axes)
                
                for idx, col in enumerate(numeric_cols):
                    ax_current = axes_flat[idx] if num_cols > 1 else axes_flat[0]
                    values = viz_df[col].dropna()
                    
                    if len(values) > 0 and values.sum() > 0:
                        ax_current.pie(values, labels=values.index, autopct='%1.1f%%', 
                                      startangle=90, counterclock=False, 
                                      colors=plt.cm.Set3.colors)
                        ax_current.set_title(f'{col}', fontsize=14, fontweight='bold', pad=15)
                    else:
                        ax_current.text(0.5, 0.5, f'No data for {col}', 
                                       ha='center', va='center', fontsize=12)
                        ax_current.set_xlim(-1, 1)
                        ax_current.set_ylim(-1, 1)
                
                for idx in range(num_cols, len(axes_flat)):
                    axes_flat[idx].axis('off')
            else:
                fig, ax = plt.subplots(figsize=(12, 8))
                values = viz_df[numeric_cols[0]].dropna()
                
                if len(values) > 0 and values.sum() > 0:
                    ax.pie(values, labels=values.index, autopct='%1.1f%%', 
                          startangle=90, counterclock=False,
                          colors=plt.cm.Set3.colors)
                    ax.set_title(f'Pie Chart - {numeric_cols[0]}', fontsize=16, fontweight='bold', pad=20)
                else:
                    ax.text(0.5, 0.5, 'No data available', ha='center', va='center', fontsize=14)
            
            plt.tight_layout()
            plt.savefig('${chartPath}', bbox_inches='tight', dpi=150)
            plt.close()
            print("\\n✓ Pie chart generated successfully")
        else:
            print("\\n✗ No numeric columns found for pie chart")
    else:
        print("\\n✗ No data variable found or data is empty")
except Exception as e:
    print(f"\\n✗ Visualization error: {str(e)}")
`;
    modifiedCode = csvToPandasWrapper;
    console.log(
      `CSV to pandas conversion enabled with pie chart: ${chartPath}`,
    );
  }

  // Auto-generate chart visualization for pandas DataFrames
  if (
    language === "python" &&
    code.includes("pandas") &&
    !code.includes("matplotlib") &&
    !code.includes("plt.") &&
    !code.includes("csv")
  ) {
    // Wrap the code to capture and visualize the last DataFrame result
    const vizWrapper = `
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd

# Store the last DataFrame result
_last_df = None

# Original code with result capture
${modifiedCode}

# Auto-visualize if we have DataFrame output
try:
    # Try to find a DataFrame in locals
    _dfs = [v for v in locals().values() if isinstance(v, pd.DataFrame) and not v.empty]
    
    if _dfs:
        _last_df = _dfs[-1]  # Get the last DataFrame
        print(f"\\n📊 Found DataFrame with {len(_last_df)} rows and {len(_last_df.columns)} columns")
        print(f"Columns: {', '.join(_last_df.columns.tolist())}")
        print(f"\\nFirst 10 rows:")
        print(_last_df.head(10).to_string())
        
        # Limit to reasonable size for visualization
        if len(_last_df) > 50:
            _last_df = _last_df.head(50)
            print(f"\\n(Limited to first 50 rows for visualization)")
        
        fig, ax = plt.subplots(figsize=(14, 8))
        
        # Check if suitable for pie chart
        numeric_cols = _last_df.select_dtypes(include=['number']).columns.tolist()
        
        if len(numeric_cols) >= 1:
            # Use first column as index if not already set meaningfully
            if _last_df.index.name is None and len(_last_df.columns) > len(numeric_cols):
                non_numeric = [c for c in _last_df.columns if c not in numeric_cols]
                if non_numeric:
                    _last_df = _last_df.set_index(non_numeric[0])
                    numeric_cols = [c for c in numeric_cols if c in _last_df.columns]
            
            # Create pie chart(s)
            if len(numeric_cols) > 1:
                # Multiple numeric columns - create subplots for each
                num_cols = len(numeric_cols)
                num_rows = (num_cols + 1) // 2
                fig, axes = plt.subplots(num_rows, 2, figsize=(16, 6 * num_rows))
                fig.suptitle('Pie Charts - Data Visualization', fontsize=18, fontweight='bold', y=0.995)
                
                # Flatten axes array for easier iteration
                if num_cols == 1:
                    axes = [axes]
                elif num_rows == 1:
                    axes = axes
                else:
                    axes = axes.flatten()
                
                for idx, col in enumerate(numeric_cols):
                    ax_current = axes[idx] if num_cols > 1 else ax
                    values = _last_df[col].dropna()
                    
                    # Only plot if we have positive values
                    if len(values) > 0 and values.sum() > 0:
                        ax_current.pie(values, labels=values.index, autopct='%1.1f%%', 
                                      startangle=90, counterclock=False, 
                                      colors=plt.cm.Set3.colors)
                        ax_current.set_title(f'{col}', fontsize=14, fontweight='bold', pad=15)
                    else:
                        ax_current.text(0.5, 0.5, f'No data for {col}', 
                                       ha='center', va='center', fontsize=12)
                        ax_current.set_xlim(-1, 1)
                        ax_current.set_ylim(-1, 1)
                
                # Hide extra subplots if odd number of columns
                for idx in range(num_cols, len(axes)):
                    axes[idx].axis('off')
            else:
                # Single numeric column - one pie chart
                values = _last_df[numeric_cols[0]].dropna()
                
                if len(values) > 0 and values.sum() > 0:
                    ax.pie(values, labels=values.index, autopct='%1.1f%%', 
                          startangle=90, counterclock=False,
                          colors=plt.cm.Set3.colors)
                    ax.set_title(f'Pie Chart - {numeric_cols[0]}', fontsize=16, fontweight='bold', pad=20)
                else:
                    ax.text(0.5, 0.5, 'No data available', ha='center', va='center', fontsize=14)
                    ax.set_xlim(-1, 1)
                    ax.set_ylim(-1, 1)
            
            plt.tight_layout()
            plt.savefig('${chartPath}', bbox_inches='tight', dpi=150)
            plt.close()
            print("\\n✓ Chart generated successfully")
        else:
            print("\\n✗ No numeric columns found for visualization")
except Exception as e:
    print(f"\\n✗ Chart generation error: {str(e)}")
`;
    modifiedCode = vizWrapper;
    console.log(`Auto-chart generation enabled for: ${chartPath}`);
  }

  // Add chart saving code for Python with matplotlib
  if (
    language === "python" &&
    (code.includes("matplotlib") || code.includes("plt."))
  ) {
    // Inject Agg backend at the very beginning to prevent display issues
    const backendCode = "import matplotlib\nmatplotlib.use('Agg')\n";

    // Add backend before any matplotlib imports
    if (modifiedCode.includes("import matplotlib")) {
      modifiedCode = backendCode + modifiedCode;
    } else if (modifiedCode.includes("from matplotlib")) {
      modifiedCode = backendCode + modifiedCode;
    }

    // First, replace any plt.show() with savefig
    if (code.includes("plt.show()")) {
      modifiedCode = modifiedCode.replace(
        /plt\.show\(\)/g,
        `plt.savefig('${chartPath}', bbox_inches='tight', dpi=150)\nplt.close()`,
      );
    } else {
      // If no plt.show() found, add savefig at the end
      modifiedCode += `\nplt.savefig('${chartPath}', bbox_inches='tight', dpi=150)\nplt.close()`;
    }

    console.log(`Chart will be saved to: ${chartPath}`);
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

      // Check if chart file was created
      const chartUrl = fs.existsSync(chartPath)
        ? `http://localhost:${PORT}/uploads/${chartFilename}`
        : null;

      console.log(`Chart file exists: ${fs.existsSync(chartPath)}`);
      console.log(`Chart URL: ${chartUrl}`);

      res.json({
        output,
        chartUrl,
        chartFilename: chartUrl ? chartFilename : null,
      });
    },
  );
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
