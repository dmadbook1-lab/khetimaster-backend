import mongoose from 'mongoose';

/*
 * One soil test booked through the Ekosight partner API.
 *
 *   booked    -> booking made, sample ID issued, waiting for lab / device
 *   completed -> report fetched and stored in `report`
 *
 * The report is cached here once the partner marks it final, so the app
 * never depends on the partner being reachable to show an old report.
 */
const soilTestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Sample ID issued by the partner (empty only if the booking response had none)
    sampleId: { type: String, default: '', trim: true, index: true },

    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    mobileNo: { type: String, required: true, trim: true },
    emailId: { type: String, default: '', trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: Number, required: true },

    farmField: { type: mongoose.Schema.Types.ObjectId, ref: 'FarmField', default: null },
    farmSize: { type: Number, required: true },
    farmSizeUnit: { type: String, enum: ['Acres', 'Hectares'], required: true },
    previousCrop: { type: String, required: true, trim: true },
    nextCrop: { type: String, required: true, trim: true },
    comment: { type: String, default: '', trim: true },

    status: { type: String, enum: ['booked', 'completed'], default: 'booked', index: true },

    // Raw booking response from the partner (kept for support / debugging)
    bookingResponse: { type: mongoose.Schema.Types.Mixed, default: null },

    report: { type: mongoose.Schema.Types.Mixed, default: null },
    reportFetchedAt: { type: Date, default: null },
    lastCheckedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model('SoilTest', soilTestSchema);
