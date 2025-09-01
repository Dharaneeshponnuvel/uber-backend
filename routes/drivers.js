import express from 'express';
import { supabase } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get available ride requests for drivers
router.get('/available-rides', authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== 'driver') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: rides, error } = await supabase
      .from('rides')
      .select(`
        *,
        rider:users!rides_rider_id_fkey(first_name, last_name, phone)
      `)
      .eq('status', 'requested')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to fetch available rides' });
    }

    res.json({ rides });
  } catch (error) {
    console.error('Fetch available rides error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get driver statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const driverId = req.user.userId;

    if (req.user.userType !== 'driver') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get completed rides count
    const { count: completedRides } = await supabase
      .from('rides')
      .select('id', { count: 'exact' })
      .eq('driver_id', driverId)
      .eq('status', 'completed');

    // Get total earnings
    const { data: earnings } = await supabase
      .from('rides')
      .select('final_fare')
      .eq('driver_id', driverId)
      .eq('status', 'completed');

    const totalEarnings = earnings?.reduce((sum, ride) => sum + (ride.final_fare || 0), 0) || 0;

    // Get average rating
    const { data: ratings } = await supabase
      .from('ratings')
      .select('rating')
      .eq('driver_id', driverId);

    const averageRating = ratings?.length > 0 
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length 
      : 0;

    res.json({
      completedRides: completedRides || 0,
      totalEarnings: totalEarnings,
      averageRating: averageRating,
      totalRatings: ratings?.length || 0
    });
  } catch (error) {
    console.error('Fetch driver stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;