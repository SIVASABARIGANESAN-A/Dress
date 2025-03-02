import express from 'express';
import Product from '../models/Product.js';
import { authenticate, isAdmin } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Set up file storage
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');

// Create uploads directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueFilename = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueFilename);
  }
});

// File filter to accept only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, JPG, PNG, and WEBP are allowed.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Get all products
router.get('/', async (req, res) => {
  try {
    const { category, featured, search } = req.query;
    
    let query = {};
    
    if (category) {
      query.category = category;
    }
    
    if (featured === 'true') {
      query.featured = true;
    }
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    const products = await Product.find(query);
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create product (admin only) with image upload
router.post('/', authenticate, isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category, stock, sizes, colors, featured } = req.body;
    
    let imageUrl = '';
    
    // If image was uploaded, use the file path
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    } else if (req.body.imageUrl) {
      // If no file was uploaded but a URL was provided, use that
      imageUrl = req.body.imageUrl;
    } else {
      return res.status(400).json({ message: 'Either an image file or image URL is required' });
    }
    
    // Parse sizes and colors from JSON strings if they are strings
    const parsedSizes = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
    const parsedColors = typeof colors === 'string' ? JSON.parse(colors) : colors;
    
    const product = new Product({
      name,
      description,
      price: Number(price),
      category,
      imageUrl,
      stock: Number(stock),
      sizes: parsedSizes,
      colors: parsedColors,
      featured: featured === 'true'
    });
    
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update product (admin only) with image upload
router.put('/:id', authenticate, isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category, stock, sizes, colors, featured } = req.body;
    
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    // Handle image update
    let imageUrl = product.imageUrl;
    
    if (req.file) {
      // If a new image was uploaded, update the image URL
      imageUrl = `/uploads/${req.file.filename}`;
      
      // Delete the old image if it was an uploaded file (not an external URL)
      if (product.imageUrl && product.imageUrl.startsWith('/uploads/')) {
        const oldImagePath = path.join(uploadsDir, product.imageUrl.replace('/uploads/', ''));
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
    } else if (req.body.imageUrl && req.body.imageUrl !== product.imageUrl) {
      // If no file was uploaded but a new URL was provided, use that
      imageUrl = req.body.imageUrl;
    }
    
    // Parse sizes and colors from JSON strings if they are strings
    const parsedSizes = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
    const parsedColors = typeof colors === 'string' ? JSON.parse(colors) : colors;
    
    product.name = name || product.name;
    product.description = description || product.description;
    product.price = price !== undefined ? Number(price) : product.price;
    product.category = category || product.category;
    product.imageUrl = imageUrl;
    product.stock = stock !== undefined ? Number(stock) : product.stock;
    product.sizes = parsedSizes || product.sizes;
    product.colors = parsedColors || product.colors;
    product.featured = featured !== undefined ? (featured === 'true') : product.featured;
    
    await product.save();
    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete product (admin only)
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    // Delete the product image if it was an uploaded file
    if (product.imageUrl && product.imageUrl.startsWith('/uploads/')) {
      const imagePath = path.join(uploadsDir, product.imageUrl.replace('/uploads/', ''));
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    await product.deleteOne();
    res.json({ message: 'Product removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;