const mongoose = require('mongoose');
const Seller = require('./models/Seller');

async function debugSellers() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pawn";
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Get all sellers
    const sellers = await Seller.find({}, 'email businessName createdAt');
    console.log(`\nFound ${sellers.length} sellers in database:`);
    
    sellers.forEach((seller, index) => {
      console.log(`${index + 1}. Email: "${seller.email}" | Business: "${seller.businessName}" | Created: ${seller.createdAt}`);
    });

    // Test email normalization
    const testEmail = 'test@example.com';
    const normalizedEmail = testEmail.toLowerCase().trim();
    console.log(`\nTesting email normalization:`);
    console.log(`Original: "${testEmail}"`);
    console.log(`Normalized: "${normalizedEmail}"`);
    
    const existingSeller = await Seller.findOne({ email: normalizedEmail });
    console.log(`Found seller with normalized email: ${existingSeller ? 'Yes' : 'No'}`);
    
    if (existingSeller) {
      console.log(`Found: ${existingSeller.businessName} (${existingSeller.email})`);
    }

  } catch (error) {
    console.error('Debug error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

debugSellers(); 