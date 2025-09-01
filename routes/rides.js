import express from 'express';
import { supabase } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { calculateDistance, calculateFare } from '../utils/calculations.js';

const router = express.Router();

// Create ride request
router.post('/request', authenticateToken, async (req, res) => {
  try {
    const { pickupAddress, dropoffAddress, pickupCoordinates, dropoffCoordinates, rideType } = req.body;
    const userId = req.user.userId;

    if (req.user.userType !== 'rider') {
      return res.status(403).json({ error: 'Only riders can request rides' });
    }

    // Calculate distance and fare
    const distance = calculateDistance(pickupCoordinates, dropoffCoordinates);
    const estimatedFare = calculateFare(distance, rideType);

    // Create ride request
    const { data: ride, error } = await supabase
      .from('rides')
      .insert([{
        rider_id: userId,
        pickup_address: pickupAddress,
        dropoff_address: dropoffAddress,
        pickup_coordinates: pickupCoordinates,
        dropoff_coordinates: dropoffCoordinates,
        ride_type: rideType || 'standard',
        distance: distance,
        estimated_fare: estimatedFare,
        status: 'requested',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to create ride request' });
    }

    // Emit to available drivers via Socket.IO
    const io = req.app.get('io');
    io.to('drivers').emit('new-ride-request', {
      rideId: ride.id,
      riderId: userId,
      pickupAddress,
      dropoffAddress,
      pickupCoordinates,
      dropoffCoordinates,
      estimatedFare,
      distance,
      rideType: rideType || 'standard'
    });

    res.status(201).json({
      message: 'Ride requested successfully',
      ride: ride
    });
  } catch (error) {
    console.error('Ride request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept ride (driver only)
router.post('/:rideId/accept', authenticateToken, async (req, res) => {
  try {
    const { rideId } = req.params;
    const driverId = req.user.userId;

    if (req.user.userType !== 'driver') {
      return res.status(403).json({ error: 'Only drivers can accept rides' });
    }

    // Update ride status
    const { data: ride, error } = await supabase
      .from('rides')
      .update({
        driver_id: driverId,
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', rideId)
      .eq('status', 'requested')
      .select(`
        *,
        rider:users!rides_rider_id_fkey(first_name, last_name, phone),
        driver:users!rides_driver_id_fkey(first_name, last_name, phone)
      `)
      .single();

    if (error || !ride) {
      return res.status(400).json({ error: 'Ride not available or already accepted' });
    }

    // Emit real-time update to rider
    const io = req.app.get('io');
    io.to(`rider-${ride.rider_id}`).emit('ride-accepted', {
      rideId: ride.id,
      driver: ride.driver,
      status: 'accepted',
      message: 'Driver is on the way!'
    });

    // Emit to other drivers that ride is no longer available
    io.to('drivers').emit('ride-taken', { rideId: ride.id });

    res.json({
      message: 'Ride accepted successfully',
      ride: ride
    });
  } catch (error) {
    console.error('Accept ride error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Complete ride
router.patch('/:rideId/complete', authenticateToken, async (req, res) => {
  try {
    const { rideId } = req.params;
    const driverId = req.user.userId;

    const { data: ride, error } = await supabase
      .from('rides')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        final_fare: req.body.finalFare || null
      })
      .eq('id', rideId)
      .eq('driver_id', driverId)
      .select(`
        *,
        rider:users!rides_rider_id_fkey(first_name, last_name, phone),
        driver:users!rides_driver_id_fkey(first_name, last_name, phone)
      `)
      .single();

    if (error || !ride) {
      return res.status(400).json({ error: 'Failed to complete ride' });
    }

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`rider-${ride.rider_id}`).emit('ride-completed', {
      rideId: ride.id,
      finalFare: ride.final_fare,
      status: 'completed'
    });

    res.json({
      message: 'Ride completed successfully',
      ride: ride
    });
  } catch (error) {
    console.error('Complete ride error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ride history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userType = req.user.userType;

    let query = supabase
      .from('rides')
      .select(`
        *,
        rider:users!rides_rider_id_fkey(first_name, last_name, phone),
        driver:users!rides_driver_id_fkey(first_name, last_name, phone),
        rating:ratings(rating, comment)
      `);

    if (userType === 'rider') {
      query = query.eq('rider_id', userId);
    } else if (userType === 'driver') {
      query = query.eq('driver_id', userId);
    }

    const { data: rides, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to fetch rides' });
    }

    res.json({ rides });
  } catch (error) {
    console.error('Fetch rides error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current ride
router.get('/current', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userType = req.user.userType;

    let query = supabase
      .from('rides')
      .select(`
        *,
        rider:users!rides_rider_id_fkey(first_name, last_name, phone),
        driver:users!rides_driver_id_fkey(first_name, last_name, phone)
      `)
      .in('status', ['requested', 'accepted', 'started']);

    if (userType === 'rider') {
      query = query.eq('rider_id', userId);
    } else if (userType === 'driver') {
      query = query.eq('driver_id', userId);
    }

    const { data: rides, error } = await query.order('created_at', { ascending: false }).limit(1);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch current ride' });
    }

    res.json({ ride: rides[0] || null });
  } catch (error) {
    console.error('Fetch current ride error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;