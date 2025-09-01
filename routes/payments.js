import express from 'express';
import Stripe from 'stripe';
import { supabase } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create payment intent
router.post('/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { rideId, amount } = req.body;

    // Verify ride belongs to user and is completed
    const { data: ride, error } = await supabase
      .from('rides')
      .select('*')
      .eq('id', rideId)
      .eq('rider_id', req.user.userId)
      .eq('status', 'completed')
      .single();

    if (error || !ride) {
      return res.status(404).json({ error: 'Ride not found or not completed' });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        rideId: rideId,
        userId: req.user.userId
      }
    });

    // Update ride with payment intent ID
    await supabase
      .from('rides')
      .update({ payment_intent_id: paymentIntent.id })
      .eq('id', rideId);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Confirm payment
router.post('/confirm-payment', authenticateToken, async (req, res) => {
  try {
    const { paymentIntentId, rideId, paymentMethod, amount } = req.body;

    let paymentSuccessful = false;
    let finalAmount = amount;

    if (paymentMethod === 'cash' || paymentMethod === 'qr') {
      // For cash and QR payments, mark as successful without Stripe
      paymentSuccessful = true;
      finalAmount = amount;
    } else if (paymentIntentId) {
      // For card payments, verify with Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      paymentSuccessful = paymentIntent.status === 'succeeded';
      finalAmount = paymentIntent.amount / 100;
    }

    if (paymentSuccessful) {
      // Update ride with payment information
      const { data: ride, error } = await supabase
        .from('rides')
        .update({
          payment_status: 'completed',
          final_fare: finalAmount,
          payment_intent_id: paymentIntentId || null,
          payment_method: paymentMethod || 'card'
        })
        .eq('id', rideId)
        .select(`
          *,
          rider:users!rides_rider_id_fkey(first_name, last_name),
          driver:users!rides_driver_id_fkey(first_name, last_name)
        `)
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to update ride payment' });
      }

      // Emit real-time update
      const io = req.app.get('io');
      io.to(`rider-${ride.rider_id}`).emit('payment-completed', {
        rideId: ride.id,
        finalFare: ride.final_fare
      });

      res.json({ 
        message: 'Payment confirmed successfully',
        status: 'succeeded',
        ride: ride
      });
    } else {
      res.status(400).json({ 
        error: 'Payment not successful',
        status: paymentIntentId ? 'failed' : 'invalid_method'
      });
    }
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

// Get payment history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { data: rides, error } = await supabase
      .from('rides')
      .select(`
        id,
        created_at,
        completed_at,
        pickup_address,
        dropoff_address,
        final_fare,
        payment_status,
        distance,
        ride_type,
        driver:users!rides_driver_id_fkey(first_name, last_name)
      `)
      .eq('rider_id', req.user.userId)
      .eq('payment_status', 'completed')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch payment history' });
    }

    res.json({ payments: rides });
  } catch (error) {
    console.error('Fetch payment history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;