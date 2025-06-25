const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('../models/User');
const TempUser = require('../models/TempUser');

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log('MONGODB_URI:', process.env.MONGO_URI); // Debug log

if (!process.env.MONGO_URI) {
  console.error('Error: MONGODB_URI is not defined in .env');
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(async () => {
    console.log('MongoDB connected');
    try {
      const userCount = await User.countDocuments();
      const tempUserCount = await TempUser.countDocuments();
      console.log(`Found ${userCount} users and ${tempUserCount} temp users`);
      await User.deleteMany({});
      console.log('Deleted all users');
      await TempUser.deleteMany({});
      console.log('Deleted all temp users');
    } catch (error) {
      console.error('Error deleting data:', error);
    } finally {
      await mongoose.disconnect();
      console.log('MongoDB disconnected');
    }
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });