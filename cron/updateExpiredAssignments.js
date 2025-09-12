const cron = require('node-cron');
const Assignment = require('../models/Assignment'); // Update path as per your structure
const mongoose = require('mongoose');

/**
 * This job runs daily at 12:00 AM and updates assignments
 * whose deadline has passed, setting their status to "Closed"
 */
const updateExpiredAssignments = () => {
  // Run every day at 12:00 AM
  cron.schedule('0 0 * * *', async () => {
    console.log(`[CRON] Running assignment deadline check at ${new Date().toISOString()}`);

    try {
      const result = await Assignment.updateMany(
        {
          deadline: { $lt: new Date() },
          status: { $ne: 'Closed' }
        },
        { $set: { status: 'Closed' } }
      );

      console.log(`[CRON] ${result.modifiedCount} assignments updated to 'Closed'`);
    } catch (error) {
      console.error('[CRON] Error updating expired assignments:', error);
    }
  });
};

module.exports = updateExpiredAssignments;
