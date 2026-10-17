import mongoose from "mongoose";

/**
 * Commission ledger for Duffel Stays. PowAlert stores Duffel's
 * estimated_commission_amount; it does not charge cards or compute a second fee.
 */
const lodgingBookingSchema = new mongoose.Schema(
  {
    search_id: { type: String, default: null },
    quote_id: { type: String, default: null },
    booking_id: { type: String, default: null },
    links_reference: { type: String, default: null },
    resort: { type: String, default: null, index: true },
    check_in: { type: String, default: null },
    check_out: { type: String, default: null },
    guests: { type: Number, default: null },
    rooms: { type: Number, default: null },
    total: { type: String, default: null },
    currency: { type: String, default: null },
    estimated_commission_amount: { type: String, default: null },
    estimated_commission_currency: { type: String, default: null },
    status: { type: String, required: true },
    source: { type: String, required: true },
    accommodation_id: { type: String, default: null },
    accommodation_name: { type: String, default: null },
    live_mode: { type: Boolean, default: null },
    webhook_event_ids: { type: [String], default: [] },
    reconciled_at: { type: Date, default: null },
  },
  { timestamps: true }
);

lodgingBookingSchema.index({ booking_id: 1 }, { unique: true, sparse: true });
lodgingBookingSchema.index({ links_reference: 1 }, { sparse: true });
lodgingBookingSchema.index({ quote_id: 1 }, { sparse: true });

export const LodgingBooking = mongoose.model(
  "LodgingBooking",
  lodgingBookingSchema,
  "lodging_bookings"
);
