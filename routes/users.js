import express from 'express';
import { supabase } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, phone, user_type, created_at')
      .eq('id', req.user.userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        userType: user.user_type,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add rating for completed ride
router.post('/rate', authenticateToken, async (req, res) => {
  try {
    const { rideId, driverId, rating, comment } = req.body;

    if (req.user.userType !== 'rider') {
      return res.status(403).json({ error: 'Only riders can rate drivers' });
    }

    // Verify the ride belongs to the user and is completed
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select('id, status')
      .eq('id', rideId)
      .eq('rider_id', req.user.userId)
      .eq('status', 'completed')
      .single();

    if (rideError || !ride) {
      return res.status(404).json({ error: 'Ride not found or not completed' });
    }

    // Check if already rated
    const { data: existingRating } = await supabase
      .from('ratings')
      .select('id')
      .eq('ride_id', rideId)
      .single();

    if (existingRating) {
      return res.status(400).json({ error: 'Ride already rated' });
    }

    // Add rating
    const { data: newRating, error } = await supabase
      .from('ratings')
      .insert([{
        ride_id: rideId,
        rider_id: req.user.userId,
        driver_id: driverId,
        rating: rating,
        comment: comment || null,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to add rating' });
    }

    res.json({ 
      message: 'Rating added successfully',
      rating: newRating
    });
  } catch (error) {
    console.error('Add rating error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;