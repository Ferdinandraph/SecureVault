const mongoose = require('mongoose');
const File = require('./models/File');
require('dotenv').config({ path: './.env' });

const fixMongoIndex = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/securevault', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Get the files collection
    const collection = mongoose.connection.collection('files');

    // Check existing indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    // Drop the shareLink_1 index if it exists
    try {
      await collection.dropIndex('shareLink_1');
      console.log('Dropped shareLink_1 index');
    } catch (err) {
      if (err.codeName === 'IndexNotFound') {
        console.log('shareLink_1 index not found, no need to drop');
      } else {
        throw err;
      }
    }

    // Clean documents with shareLink: null or ""
    const nullCount = await File.countDocuments({ shareLink: null });
    const emptyCount = await File.countDocuments({ shareLink: '' });
    console.log(`Found ${nullCount} documents with shareLink: null`);
    console.log(`Found ${emptyCount} documents with shareLink: ""`);

    // Update shareLink: "" to undefined
    if (emptyCount > 0) {
      await File.updateMany({ shareLink: '' }, { $unset: { shareLink: 1 } });
      console.log(`Updated ${emptyCount} documents from shareLink: "" to undefined`);
    }

    // Update shareLink: null to undefined, keeping only the most recent if duplicates
    if (nullCount > 0) {
      const filesWithNull = await File.find({ shareLink: null }).sort({ createdAt: 1 });
      for (let i = 0; i < filesWithNull.length - 1; i++) {
        await File.updateOne({ _id: filesWithNull[i]._id }, { $unset: { shareLink: 1, shareToken: 1 } });
      }
      console.log(`Updated ${nullCount - 1} duplicate documents with shareLink: null to undefined`);
    }

    // Check for duplicate shareLink values (excluding undefined)
    const duplicateCheck = await File.aggregate([
      { $match: { shareLink: { $exists: true, $ne: null } } },
      { $group: { _id: '$shareLink', count: { $sum: 1 }, docs: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
    ]);
    console.log('Duplicate shareLink values:', JSON.stringify(duplicateCheck, null, 2));

    if (duplicateCheck.length > 0) {
      for (const dup of duplicateCheck) {
        const files = await File.find({ shareLink: dup._id }).sort({ createdAt: 1 });
        for (let i = 0; i < files.length - 1; i++) {
          await File.updateOne({ _id: files[i]._id }, { $unset: { shareLink: 1, shareToken: 1 } });
        }
      }
      console.log('Cleared duplicate shareLink values');
    }

    // Create sparse unique index
    await collection.createIndex({ shareLink: 1 }, { unique: true, sparse: true });
    console.log('Created shareLink_1 index with sparse: true');

    // Verify no duplicates
    const remainingNull = await File.countDocuments({ shareLink: null });
    const remainingEmpty = await File.countDocuments({ shareLink: '' });
    console.log(`Remaining documents with shareLink: null: ${remainingNull}`);
    console.log(`Remaining documents with shareLink: "": ${remainingEmpty}`);

    // Sync Mongoose schema indexes
    await File.syncIndexes();
    console.log('Synced Mongoose schema indexes');

    console.log('Index fix and cleanup completed successfully');
  } catch (error) {
    console.error('Error fixing MongoDB index:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
};

// Run the script
fixMongoIndex();