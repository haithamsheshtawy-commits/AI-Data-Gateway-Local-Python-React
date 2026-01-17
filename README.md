# Mistral 7B Local Interface

A local web interface for interacting with the Mistral 7B model using mlx_lm. Built with React frontend and Express backend.
fully local

## Features

- Clean, modern UI for prompt input
- Real-time response from Mistral 7B model
- **CSV Analysis Mode**: Upload 2 CSV files and get AI-powered insights
- Ask specific questions about your CSV data
- REST API endpoint for external access (Postman, cURL, etc.)
- Executes mlx_lm.generate command locally

## Prerequisites

- Node.js (v14 or higher)
- mlx_lm installed and configured
- Mistral 7B model downloaded at: `/Users/tapteam/Documents/AI/apple_llama/models/mistral-7b-instruct-mlx`

## Installation

1. Install root dependencies:
```bash
npm install
```

2. Install client dependencies:
```bash
cd client
npm install
cd ..
```

Or install all dependencies at once:
```bash
npm run install-all
```

## Running the Application

### Option 1: Run both frontend and backend together (recommended)
```bash
npm run dev
```

This will start:
- Backend server on http://localhost:3001
- React frontend on http://localhost:3000

### Option 2: Run separately

**Start backend only:**
```bash
npm run server
```

**Start frontend only:**
```bash
npm run client
```

## Using the Web Interface

### Chat Mode
1. Open your browser to http://localhost:3000
2. Ensure "Chat Mode" is selected
3. Enter your prompt in the text area
4. Click "Generate Response"
5. Wait for the model to generate a response

### CSV Analysis Mode
1. Click the "CSV Analysis" button
2. Upload exactly 2 CSV files using the file selector
3. (Optional) Enter a specific question about the data
4. Click "Analyze CSV Files"
5. View the analysis results including:
   - File statistics (rows, columns, column names)
   - AI-generated insights based on your question
   - Data preview

## API Endpoints

### POST /api/generate

Send requests directly to the API from Postman or any HTTP client.

**Endpoint:** `http://localhost:3001/api/generate`

**Request Body:**
```json
{
  "prompt": "Your prompt here"
}
}
```

**Example with cURL:**
```bash
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is machine learning?"}'
```

**Example Response:**
```json
{
  "response": "Machine learning is a subset of artificial intelligence..."
}
```

### POST /api/analyze-csv

Analyze two CSV files with AI-powered insights.

**Endpoint:** `http://localhost:3001/api/analyze-csv`

**Request:** Multipart form data with:
- `csvFiles`: Two CSV files
- `question`: (Optional) Specific question about the data

**Example with cURL:**
```bash
curl -X POST http://localhost:3001/api/analyze-csv \
  -F "csvFiles=@file1.csv" \
  -F "csvFiles=@file2.csv" \
  -F "question=Compare sales data between these two files"
```

**Example Response:**
```json
{
  "response": "Based on the analysis...",
  "basicAnalysis": {
    "file1": {
      "rows": 100,
      "columns": 5,
      "columnNames": ["id", "name", "value", "date", "category"]
    },
    "file2": {
      "rows": 150,
      "columns": 4,
      "columnNames": ["id", "product", "price", "quantity"]
    }
  },
  "dataPreview": {
    "file1": [...],
    "file2": [...]
  }
}
```

## Project Structure

```
llama_interface_page/
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.js         # Main React component
│   │   └── App.css        # Styling
│   └── package.json
├── server/
│   └── index.js           # Express backend server
├── package.json           # Root package.json
└── README.md
```

## Configuration

To change the model path, edit the `modelPath` variable in [server/index.js](server/index.js):

```javascript
const modelPath = '/Users/tapteam/Documents/AI/apple_llama/models/mistral-7b-instruct-mlx';
```

## Troubleshooting

**Port already in use:**
- Backend uses port 3001
- Frontend uses port 3000
- Stop any processes using these ports or modify in the respective files

**mlx_lm command not found:**
- Ensure mlx_lm is installed and accessible from terminal
- Check that the model path is correct

**CORS errors:**
- Make sure backend is running on port 3001
- CORS is already configured in the server

## Notes

- The application runs entirely on your local machine
- No data is sent to external servers
- Response time depends on your hardware and model size
