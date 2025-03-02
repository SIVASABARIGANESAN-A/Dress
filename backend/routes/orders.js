import express from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { authenticate, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all orders (admin only)
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email')
      .populate('items.product', 'name imageUrl');
    
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user orders
router.get('/my-orders', authenticate, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate('items.product', 'name imageUrl');
    
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single order
router.get('/:id', authenticate, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('items.product', 'name imageUrl');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Check if user is admin or the order belongs to the user
    if (req.user.role !== 'admin' && order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create order
router.post('/', authenticate, async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No order items' });
    }
    
    // Verify products and calculate total
    let totalAmount = 0;
    const orderItems = [];
    
    for (const item of items) {
      const product = await Product.findById(item.product);
      
      if (!product) {
        return res.status(404).json({ message: `Product not found: ${item.product}` });
      }
      
      if (product.stock < item.quantity) {
        return res.status(400).json({ message: `Not enough stock for ${product.name}` });
      }
      
      const itemPrice = product.price * item.quantity;
      totalAmount += itemPrice;
      
      orderItems.push({
        product: item.product,
        quantity: item.quantity,
        price: product.price,
        size: item.size,
        color: item.color
      });
      
      // Update product stock
      product.stock -= item.quantity;
      await product.save();
    }
    
    // Add COD fee if applicable
    if (paymentMethod.toLowerCase() === 'cod') {
      totalAmount += 50; // Add COD fee
    }
    
    const order = new Order({
      user: req.user._id,
      items: orderItems,
      totalAmount,
      shippingAddress,
      paymentInfo: {
        method: paymentMethod || 'Razorpay'
      }
    });
    
    await order.save();
    
    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update order status (admin only)
router.put('/:id/status', authenticate, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    order.status = status;
    await order.save();
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Cancel order
router.put('/:id/cancel', authenticate, async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ message: 'Cancellation reason is required' });
    }
    
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Check if user is admin or the order belongs to the user
    if (req.user.role !== 'admin' && order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    // Check if order can be cancelled
    if (['delivered', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ 
        message: `Order cannot be cancelled because it is already ${order.status}` 
      });
    }
    
    // Restore product stock
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (product) {
        product.stock += item.quantity;
        await product.save();
      }
    }
    
    order.status = 'cancelled';
    order.cancellationReason = reason;
    await order.save();
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;