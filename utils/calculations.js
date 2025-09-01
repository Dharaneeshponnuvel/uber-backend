// Calculate distance between two coordinates (in miles)
export const calculateDistance = (coord1, coord2) => {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLon = toRad(coord2.lng - coord1.lng);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 100) / 100; // Round to 2 decimal places
};

// Calculate fare based on distance and ride type
export const calculateFare = (distance, rideType = 'standard') => {
  const baseFare = 2.50;
  const perMileRates = {
    economy: 1.20,
    standard: 1.50,
    premium: 2.00,
    xl: 2.50
  };
  
  const perMileRate = perMileRates[rideType] || perMileRates.standard;
  const fare = baseFare + (distance * perMileRate);
  
  return Math.round(fare * 100) / 100; // Round to 2 decimal places
};

const toRad = (value) => {
  return value * Math.PI / 180;
};