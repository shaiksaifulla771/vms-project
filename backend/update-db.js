const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/vms').then(async () => {
  const Material = require('./models/Material');
  const res = await Material.updateMany(
    { name: { $in: ['Jack Fruit', 'Ice Cream Strawbery', 'Strawbeery Power', 'Ice Falvor'] } },
    { $set: { unit: 'kg' } }
  );
  console.log('Updated:', res);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
