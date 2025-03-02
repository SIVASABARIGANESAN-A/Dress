import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import userRoutes from './routes/users.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, '..', 'public');

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(publicPath));

// Debug middleware to log requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Connect to MongoDB
const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
};

// Connect to database before starting the server
connectDB().then(() => {
  // Routes
  app.use('/auth', authRoutes);
  app.use('/products', productRoutes);
  app.use('/orders', orderRoutes);
  app.use('/payments', paymentRoutes);
  app.use('/users', userRoutes);

  // Basic route for testing
  app.get('/', (req, res) => {
    res.send('🚀 API is running...');
  });

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred' 
    });
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`🔥 Server running on port ${PORT}`);
  });
});