import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order.js';
import { authenticate } from '../middleware/auth.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_yiruTlM8HRrGKI',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'FNTg51CA5jVPFnThZjo4YqiQ'
});

// Create payment order
router.post('/create-order', authenticate, async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt } = req.body;
    
    if (!amount) {
      return res.status(400).json({ message: 'Amount is required' });
    }
    
    const options = {
      amount: Math.round(amount * 100), // Razorpay expects amount in paise
      currency,
      receipt,
      payment_capture: 1
    };
    
    console.log('Creating Razorpay order with options:', options);
    
    const response = await razorpay.orders.create(options);
    console.log('Razorpay order created:', response);
    
    res.json(response);
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    res.status(500).json({ message: 'Payment error', error: error.message });
  }
});

// Verify payment
router.post('/verify', authenticate, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'All payment details are required' });
    }
    
    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'your_test_secret_key')
      .update(body)
      .digest('hex');
    
    console.log('Verifying payment signature:');
    console.log('Expected:', expectedSignature);
    console.log('Received:', razorpay_signature);
    
    const isAuthentic = expectedSignature === razorpay_signature;
    
    if (!isAuthentic) {
      console.error('Payment verification failed: Signature mismatch');
      return res.status(400).json({ message: 'Payment verification failed' });
    }
    
    // Update order with payment info
    if (order_id) {
      const order = await Order.findById(order_id);
      
      if (order) {
        order.paymentInfo = {
          id: razorpay_payment_id,
          status: 'completed',
          method: 'Razorpay'
        };
        order.status = 'processing';
        
        await order.save();
        console.log('Order updated with payment info:', order._id);
      } else {
        console.error('Order not found:', order_id);
      }
    }
    
    res.json({
      success: true,
      message: 'Payment verified successfully',
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ message: 'Payment verification error', error: error.message });
  }
});

export default router;