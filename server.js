import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

console.log('Starting server setup...');

// Get the directory name for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log('Current directory:', __dirname);

const app = express();
const PORT = 3001;

console.log('Configuring server...');

// Enable CORS for our React app
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept']
}));
console.log('CORS configured');

// Parse JSON request body
app.use(express.json());
console.log('JSON parser configured');

// Products endpoint
app.get('/api/products', async (req, res) => {
  console.log('Received request to /api/products');
  try {
    console.log('Search query:', req.query);

    // Correct BuildCores API endpoint
    const apiUrl = 'https://www.api.buildcores.com/api/official/database/parts';

    // Prepare request body parameters
    const requestBody = {
      // Default values
      part_category: req.query.category === 'PCCase' ? 'PC_case' : req.query.category || '',
      sort: { name: 1 }, // Sort by name ascending by default
      limit: 50, // Limit results
      skip: 0 // Start from the first result
    };

    // Add search term if provided
    if (req.query.search) {
      requestBody.search = req.query.search;
    }

    // Add price filters if provided
    if (req.query.minPrice || req.query.maxPrice) {
      requestBody.price = {};
      if (req.query.minPrice) {
        requestBody.price.$gte = parseFloat(req.query.minPrice);
      }
      if (req.query.maxPrice) {
        requestBody.price.$lte = parseFloat(req.query.maxPrice);
      }
    }

    console.log('Sending request to BuildCores API:', {
      url: apiUrl,
      body: requestBody
    });

    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'BuildCores-Search/1.0'
      },
      timeout: 15000
    });

    console.log(`Received ${response.data?.data?.length || 0} products from API`);

    res.json({
      products: response.data?.data || [],
      total: response.data?.totalParts || 0,
      minPrice: response.data?.minPrice || 0,
      maxPrice: response.data?.maxPrice || 0
    });
  } catch (error) {
    console.error('API request error:', error.response?.data || error.message);
    
    if (error.response?.data?.errors) {
      console.log('Validation errors:', error.response.data.errors);
    }
    
    // Handle different types of errors
    if (error.code === 'ECONNREFUSED') {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        details: 'Could not connect to BuildCores API'
      });
    } else if (error.code === 'ETIMEDOUT') {
      res.status(504).json({
        error: 'Request timeout',
        details: 'BuildCores API took too long to respond'
      });
    } else {
      res.status(error.response?.status || 500).json({
        error: 'Failed to fetch products',
        details: error.response?.data?.error || error.message,
        validation_errors: error.response?.data?.errors
      });
    }
  }
});

// Check if data.json exists
try {
  const dataPath = path.join(__dirname, 'data.json');
  fs.accessSync(dataPath, fs.constants.R_OK);
  console.log('data.json is accessible at:', dataPath);
} catch (err) {
  console.error('data.json is not accessible:', err.message);
}

// Fallback to use local data
app.get('/api/local-products', (req, res) => {
  console.log('Received request to /api/local-products');
  try {
    // Read data from data.json in the root directory
    const dataPath = path.join(__dirname, 'data.json');
    console.log('Reading local data from:', dataPath);
    
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    console.log(`Loaded ${data.data?.length || 0} products from local data`);
    
    // Filter by category if provided
    let products = data.data;
    if (req.query.category) {
      const category = req.query.category === 'PCCase' ? 'PCCase' : req.query.category;
      products = products.filter(p => p.part_category === category);
      console.log(`Filtered to ${products.length} products with category ${category}`);
    }
    
    // Filter by search term if provided
    if (req.query.search) {
      const searchTerm = req.query.search.toLowerCase();
      products = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm)
      );
      console.log(`Filtered to ${products.length} products matching '${searchTerm}'`);
    }
    
    res.json({
      products,
      total: products.length,
      minPrice: data.minPrice,
      maxPrice: data.maxPrice
    });
  } catch (error) {
    console.error('Error reading local data:', error);
    res.status(500).json({
      error: 'Failed to fetch local products',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('Health check requested');
  res.json({ status: 'ok' });
});

// Root endpoint for basic connectivity test
app.get('/', (req, res) => {
  res.send('BuildCores API Proxy Server is running');
});

// Try to start the server
try {
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Add error handler for the server
  server.on('error', (err) => {
    console.error('Server error:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Try a different port.`);
    }
  });
} catch (err) {
  console.error('Failed to start server:', err);
} 