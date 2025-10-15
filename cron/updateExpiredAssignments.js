// updateExpiredAssignments.js
const cron = require('node-cron');
const Assignment = require('../models/Assignment');

const updateExpiredAssignments = () => {
  cron.schedule('0 * * * *', async () => { // every minute for testing
    console.log(`[CRON] Running check at ${new Date().toISOString()}`);
    try {
      const result = await Assignment.updateMany(
        { deadline: { $lt: new Date() }, status: { $ne: 'Closed' } },
        { $set: { status: 'Closed' } }
      );
      console.log(`[CRON] ${result.modifiedCount} assignments updated to 'Closed'`);
    } catch (error) {
      console.error('[CRON] Error updating expired assignments:', error);
    }
  }, {
    timezone: "Asia/Kolkata"
  });
};

module.exports = updateExpiredAssignments;
