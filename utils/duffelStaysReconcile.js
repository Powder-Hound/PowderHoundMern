/**
 * Manual reconciliation of Duffel Stays bookings into lodging_bookings.
 * Not scheduled. Exits without calling Duffel unless ENABLE_DUFFEL_STAYS=true.
 */

import { createDuffelClient, isDuffelStaysEnabled } from "./duffelStaysService.js";
import {
  lodgingRecordFromDuffelBooking,
  upsertLodgingFromDuffelBooking,
} from "./lodgingBookingStore.js";

const RECONCILE_STATUSES = new Set([
  "confirmed",
  "cancelled",
  "cancellation_confirmed",
  "cancellation_requested",
]);

export async function reconcileDuffelStays({
  env = process.env,
  client,
  upsert = upsertLodgingFromDuffelBooking,
  maxPages = 20,
  limit = 50,
} = {}) {
  if (!isDuffelStaysEnabled(env)) {
    return {
      skipped: true,
      reason: "ENABLE_DUFFEL_STAYS is not true",
      pages: 0,
      seen: 0,
      updated: 0,
    };
  }

  const api = client || createDuffelClient({ env });
  let after;
  let pages = 0;
  let seen = 0;
  let updated = 0;

  do {
    const page = await api.listBookings({ limit, after });
    const rows = Array.isArray(page) ? page : page?.data || [];
    const meta = Array.isArray(page) ? null : page?.meta;
    pages += 1;

    for (const booking of rows) {
      seen += 1;
      if (!RECONCILE_STATUSES.has(booking?.status)) continue;
      const record = lodgingRecordFromDuffelBooking(booking, {
        source: "reconciliation",
      });
      await upsert(record);
      updated += 1;
    }

    after = meta?.after || null;
  } while (after && pages < maxPages);

  return { skipped: false, pages, seen, updated };
}
