const { connectDB, mongoose } = require('../config/db');
const Country = require('../models/Country');

(async () => {
  await connectDB();
  const allowed = ['EC', 'CO', 'EG', 'IT', 'JO', 'PA', 'GE', 'NI'];
  await Country.updateMany({ code: { $nin: allowed } }, { isActive: false });
  await Country.updateMany({ code: { $in: allowed } }, { isActive: true });
  const active = await Country.find({ isActive: true });
  console.log('Active Countries in DB:', active.map(c => `${c.flag} ${c.name} (${c.code}) - $${c.price}`));
  await mongoose.connection.close();
})();
