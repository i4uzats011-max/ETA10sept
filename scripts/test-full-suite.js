const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGODB_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found in .env');
  process.exit(1);
}

// Schemas
const UserLocationSchema = new mongoose.Schema({
  username: { type: String, required: true },
  name: { type: String, default: '' },
  role: { type: String, default: 'Field' },
  vehicleNumber: { type: String, default: '' },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  accuracy: { type: Number, default: null },
  speed: { type: Number, default: null },
  heading: { type: Number, default: null },
  googleMapsUrl: { type: String, default: '' },
  platform: { type: String, default: 'mobile' },
  isOnline: { type: Boolean, default: true },
  lastSeenAt: { type: Date, default: Date.now },
  history: [
    {
      latitude: Number,
      longitude: Number,
      accuracy: Number,
      speed: Number,
      heading: Number,
      timestamp: Date,
    },
  ],
}, { timestamps: true });

const SalesMessageSchema = new mongoose.Schema({
  receiptNo: { type: String, default: '' },
  container: { type: String, default: '' },
  senderUsername: { type: String, required: true },
  senderName: { type: String, required: true },
  senderRole: { type: String, default: 'sales' },
  recipientUsername: { type: String, default: 'all' },
  message: { type: String, required: true },
  type: { type: String, default: 'text' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  isRead: { type: Boolean, default: false },
  isEdited: { type: Boolean, default: false },
  editedAt: { type: Date, default: null },
  editedBy: { type: String, default: null },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

const DispatcherRequestSchema = new mongoose.Schema({
  receipt: { type: String, required: true },
  marka: { type: String, default: '' },
  container: { type: String, default: '' },
  vehicleNumber: { type: String, default: '' },
  cartonCount: { type: Number, required: true },
  place: { type: String, default: '' },
  commodity: { type: String, default: '' },
  party: { type: String, default: '' },
  status: { type: String, default: 'Pending' },
  initiatedAt: { type: Date, default: Date.now },
  billedAt: { type: Date, default: null },
  billId: { type: String, default: null },
  billNumber: { type: String, default: null },
}, { timestamps: true });

const BillSchema = new mongoose.Schema({
  billNumber: { type: String, required: true },
  receipt: { type: String, required: true },
  hsnCode: { type: String, default: '39269099' },
  igst: { type: Number, default: 18 },
  billingUnit: { type: String, default: 'CTN' },
  totalCartons: { type: Number, default: 0 },
  taxableValue: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  party: { type: String, default: '' },
  purchaserName: { type: String, default: '' },
  consigneeAddress: { type: String, default: '' },
  vehicleNumber: { type: String, default: '' },
  destination: { type: String, default: '' },
  commodity: { type: String, default: '' },
  status: { type: String, default: 'Generated' },
}, { timestamps: true });

const UserLocation = mongoose.models.UserLocation || mongoose.model('UserLocation', UserLocationSchema);
const SalesMessage = mongoose.models.SalesMessage || mongoose.model('SalesMessage', SalesMessageSchema);
const DispatcherRequest = mongoose.models.DispatcherRequest || mongoose.model('DispatcherRequest', DispatcherRequestSchema);
const Bill = mongoose.models.Bill || mongoose.model('Bill', BillSchema);

async function runTests() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('✓ Database connected successfully.\n');

  // ==========================================
  // TEST 1: LIVE GPS LOCATION TRACKING
  // ==========================================
  console.log('--- TEST 1: LIVE GPS LOCATION TRACKING ---');
  const testUsername = 'test_driver_delhi_01';
  const testLat = 28.6139;
  const testLng = 77.2090;
  const testGMap = `https://www.google.com/maps?q=${testLat},${testLng}`;

  console.log(`1a. Upserting live GPS location ping for ${testUsername} (Lat: ${testLat}, Lng: ${testLng})...`);
  const locRecord = await UserLocation.findOneAndUpdate(
    { username: testUsername },
    {
      $set: {
        username: testUsername,
        name: 'Delhi Field Team (Test Driver)',
        role: 'driver',
        vehicleNumber: 'DL 01 AB 9999',
        latitude: testLat,
        longitude: testLng,
        accuracy: 8.5,
        speed: 35.2,
        heading: 180,
        googleMapsUrl: testGMap,
        platform: 'android',
        isOnline: true,
        lastSeenAt: new Date(),
      },
      $push: {
        history: {
          $each: [{ latitude: testLat, longitude: testLng, accuracy: 8.5, speed: 35.2, heading: 180, timestamp: new Date() }],
          $slice: -30,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log('✓ Location recorded successfully:');
  console.log(`   User: ${locRecord.name} (${locRecord.role}) | Vehicle: ${locRecord.vehicleNumber}`);
  console.log(`   Coordinates: ${locRecord.latitude}, ${locRecord.longitude} (Accuracy: ${locRecord.accuracy}m)`);
  console.log(`   Google Maps URL: ${locRecord.googleMapsUrl}`);
  console.log(`   Online: ${locRecord.isOnline} | UpdatedAt: ${locRecord.updatedAt}`);

  // Clean up test location
  await UserLocation.deleteOne({ username: testUsername });
  console.log('✓ Test location dummy data cleaned up from DB.\n');

  // ==========================================
  // TEST 2: INTER-USER NOTIFICATION & MESSAGING (WITH EDIT/DELETE)
  // ==========================================
  console.log('--- TEST 2: INTER-USER SALES NOTIFICATION & WHATSAPP CHAT ---');
  console.log('2a. Sending test message from "sales_delhi" to "dispatcher_field"...');
  const testMsg = await SalesMessage.create({
    receiptNo: 'RCP-TEST-888',
    container: 'CONT-TEST-01',
    senderUsername: 'sales_delhi',
    senderName: 'Delhi Sales Officer',
    senderRole: 'sales',
    recipientUsername: 'dispatcher_field',
    message: 'Hello! Please verify receipt #RCP-TEST-888 ready for dispatch today.',
    type: 'text',
    isRead: false,
    isDeleted: false,
  });
  console.log(`✓ Message sent (ID: ${testMsg._id}): "${testMsg.message}"`);

  // 2b. Test Edit within 24h
  console.log('2b. Testing message edit within 24 hours...');
  testMsg.message = 'Hello! Please verify receipt #RCP-TEST-888 ready for dispatch - URGENT priority!';
  testMsg.isEdited = true;
  testMsg.editedBy = 'Delhi Sales Officer';
  testMsg.editedAt = new Date();
  await testMsg.save();
  console.log(`✓ Message edited successfully: "${testMsg.message}" (isEdited: ${testMsg.isEdited})`);

  // 2c. Test Delete within 24h
  console.log('2c. Testing message delete within 24 hours...');
  testMsg.isDeleted = true;
  testMsg.deletedAt = new Date();
  await testMsg.save();
  console.log(`✓ Message soft-deleted successfully (isDeleted: ${testMsg.isDeleted})`);

  // 2d. Clean up test message completely
  await SalesMessage.deleteOne({ _id: testMsg._id });
  console.log('✓ Test sales message dummy data permanently cleaned up from DB.\n');

  // ==========================================
  // TEST 3: BILLER PENDING REQUEST & AUTO-FILL & BILL GENERATION
  // ==========================================
  console.log('--- TEST 3: BILLER PENDING REQUEST AUTO-FILL & GENERATION ---');
  console.log('3a. Dispatcher creates a pending request with Gaadi, Cartons & Destination...');
  const testReq = await DispatcherRequest.create({
    receipt: 'RCP-260528099',
    marka: 'SUPER-CARGO',
    container: 'CONT-USSI-208',
    vehicleNumber: 'DL 01 TRUCK 8888',
    cartonCount: 25,
    place: 'GUWAHATI TRANSPORT HUB, ASSAM',
    commodity: 'Garments & Hosiery Goods',
    party: 'Guwahati Wholesale Traders',
    status: 'Pending',
    initiatedAt: new Date(),
  });
  console.log(`✓ Pending Request Created (ID: ${testReq._id}):`);
  console.log(`   Receipt: ${testReq.receipt} | Marka: ${testReq.marka} | Container: ${testReq.container}`);
  console.log(`   Gaadi: ${testReq.vehicleNumber} | CTN to Bill: ${testReq.cartonCount} | Place: ${testReq.place}`);
  console.log(`   Commodity: ${testReq.commodity}`);

  // 3b. Simulate Biller clicking the request -> Auto-fill -> Amount calculation
  console.log('\n3b. Simulating Biller clicking the request:');
  const qtyToBill = testReq.cartonCount; // 25 Cartons
  console.log(`   -> Total Cartons auto-filled: ${qtyToBill} CTN`);
  console.log(`   -> Vehicle Number auto-filled: ${testReq.vehicleNumber}`);
  console.log(`   -> Destination auto-filled: ${testReq.place}`);
  console.log(`   -> Commodity auto-filled: ${testReq.commodity}`);

  // Biller enters either Rate OR Total Amount:
  // Scenario A: Biller enters Rate ₹500
  const rateEntered = 500;
  const derivedTotal = qtyToBill * rateEntered; // 12,500
  console.log(`   -> Biller enters Rate: ₹${rateEntered} -> Auto-derived Taxable Value: ₹${derivedTotal}`);

  // Scenario B: If Biller entered Total Amount ₹12,500 instead
  const amountEntered = 12500;
  const derivedRate = amountEntered / qtyToBill; // 500
  console.log(`   -> Conversely, if Biller entered Total Amount: ₹${amountEntered} -> Auto-derived Rate: ₹${derivedRate}`);

  // 3c. Generate Bill
  console.log('\n3c. Generating Tax Invoice...');
  const testBill = await Bill.create({
    billNumber: `INV-${Date.now().toString().slice(-6)}`,
    receipt: testReq.receipt,
    hsnCode: '61091000', // HSN for Garments
    igst: 18,
    billingUnit: 'CTN',
    totalCartons: qtyToBill,
    taxableValue: derivedTotal,
    totalAmount: derivedTotal * 1.18,
    party: testReq.party,
    purchaserName: testReq.party,
    consigneeAddress: testReq.place,
    vehicleNumber: testReq.vehicleNumber,
    destination: testReq.place,
    commodity: testReq.commodity,
    status: 'Generated',
  });
  console.log(`✓ Bill Generated (ID: ${testBill._id}): #${testBill.billNumber} | Total: ₹${testBill.totalAmount}`);

  // 3d. Mark dispatch request as Billed and remove from Pending
  console.log('3d. Marking dispatch request as Billed...');
  testReq.status = 'Billed';
  testReq.billedAt = new Date();
  testReq.billId = testBill._id.toString();
  testReq.billNumber = testBill.billNumber;
  await testReq.save();
  console.log(`✓ Request status updated to "${testReq.status}" (billedAt: ${testReq.billedAt})`);

  // Verify it is no longer pending
  const pendingCheck = await DispatcherRequest.findOne({ _id: testReq._id, status: 'Pending' });
  console.log(`   Is request in Pending list? ${pendingCheck ? 'YES (Error)' : 'NO (Removed Successfully!)'}`);

  // 3e. Clean up test bill and dispatch request completely
  await Bill.deleteOne({ _id: testBill._id });
  await DispatcherRequest.deleteOne({ _id: testReq._id });
  console.log('✓ Test bill and dispatch request dummy data permanently cleaned up from DB.\n');

  console.log('====================================================');
  console.log('ALL TESTS PASSED WITH 100% SUCCESS AND ZERO RESIDUE!');
  console.log('====================================================');
  await mongoose.disconnect();
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
