import mongoose from "mongoose";
import { LodgingBooking } from "../models/lodgingBooking.model.js";
import { bookingTotal, extractCommission } from "./duffelStaysService.js";

export function lodgingRecordFromQuote({ query, summary, quote, rate }) {
  const commission = extractCommission(quote);
  const commissionFallback = commission.estimated_commission_amount
    ? commission
    : extractCommission(rate);
  return {
    search_id: summary?.search_result_id || null,
    quote_id: quote?.id || null,
    booking_id: null,
    links_reference: null,
    resort: query.resort,
    check_in: quote?.check_in_date || query.check_in,
    check_out: quote?.check_out_date || query.check_out,
    guests: query.guests,
    rooms: query.rooms,
    total: quote?.total_amount || rate?.total_amount || null,
    currency: quote?.total_currency || rate?.total_currency || null,
    estimated_commission_amount: commissionFallback.estimated_commission_amount,
    estimated_commission_currency: commissionFallback.estimated_commission_currency,
    status: "quoted",
    source: "quote",
    accommodation_id: quote?.accommodation?.id || null,
    accommodation_name: quote?.accommodation?.name || null,
  };
}

export function lodgingRecordFromHandoff({ query, reference }) {
  return {
    search_id: null,
    quote_id: null,
    booking_id: null,
    links_reference: reference,
    resort: query.resort,
    check_in: query.check_in,
    check_out: query.check_out,
    guests: query.guests,
    rooms: query.rooms,
    total: null,
    currency: null,
    estimated_commission_amount: null,
    estimated_commission_currency: null,
    status: "handoff_created",
    source: "duffel_links",
  };
}

export function lodgingRecordFromDuffelBooking(booking, { source, eventId, liveMode } = {}) {
  const money = bookingTotal(booking);
  const commission = extractCommission(booking);
  return {
    search_id: booking?.search_id || null,
    quote_id: booking?.quote_id || null,
    booking_id: booking?.id || null,
    links_reference: booking?.metadata?.checkout_reference || null,
    resort: booking?.metadata?.powalert_resort || null,
    check_in: booking?.check_in_date || null,
    check_out: booking?.check_out_date || null,
    guests: Array.isArray(booking?.guests) ? booking.guests.length : null,
    rooms: booking?.rooms ?? null,
    total: money.total,
    currency: money.currency,
    estimated_commission_amount: commission.estimated_commission_amount,
    estimated_commission_currency: commission.estimated_commission_currency,
    status: booking?.status || "unknown",
    source: source || "reconciliation",
    accommodation_id: booking?.accommodation?.id || null,
    accommodation_name: booking?.accommodation?.name || null,
    live_mode: liveMode ?? null,
    webhook_event_id: eventId || null,
    reconciled_at: source === "reconciliation" ? new Date() : null,
  };
}

function modelOrNull(model) {
  if (model) return model;
  if (mongoose.connection.readyState === 1) return LodgingBooking;
  return null;
}

export async function saveLodgingBooking(record, { model } = {}) {
  const Model = modelOrNull(model);
  if (!Model) {
    console.warn("lodging_bookings skipped: Mongo is not connected");
    return null;
  }
  return Model.create(record);
}

export async function upsertLodgingFromDuffelBooking(record, { model } = {}) {
  const Model = modelOrNull(model);
  if (!Model) {
    console.warn("lodging_bookings skipped: Mongo is not connected");
    return null;
  }

  const eventId = record.webhook_event_id || null;
  let existing = null;
  if (record.booking_id) {
    existing = await Model.findOne({ booking_id: record.booking_id });
  }
  if (!existing && record.links_reference) {
    existing = await Model.findOne({ links_reference: record.links_reference });
  }

  if (!existing) {
    const created = {
      ...record,
      webhook_event_ids: eventId ? [eventId] : [],
    };
    delete created.webhook_event_id;
    return Model.create(created);
  }

  if (eventId && existing.webhook_event_ids?.includes(eventId)) {
    return existing;
  }

  existing.booking_id = record.booking_id || existing.booking_id;
  existing.quote_id = record.quote_id || existing.quote_id;
  existing.search_id = record.search_id || existing.search_id;
  existing.links_reference = record.links_reference || existing.links_reference;
  existing.resort = existing.resort || record.resort;
  existing.check_in = record.check_in || existing.check_in;
  existing.check_out = record.check_out || existing.check_out;
  if (record.guests != null) existing.guests = record.guests;
  if (record.rooms != null) existing.rooms = record.rooms;
  existing.total = record.total || existing.total;
  existing.currency = record.currency || existing.currency;
  existing.estimated_commission_amount =
    record.estimated_commission_amount || existing.estimated_commission_amount;
  existing.estimated_commission_currency =
    record.estimated_commission_currency || existing.estimated_commission_currency;
  existing.status = record.status || existing.status;
  existing.source = record.source || existing.source;
  existing.accommodation_id = record.accommodation_id || existing.accommodation_id;
  existing.accommodation_name = record.accommodation_name || existing.accommodation_name;
  if (record.live_mode != null) existing.live_mode = record.live_mode;
  if (record.reconciled_at) existing.reconciled_at = record.reconciled_at;
  if (eventId) {
    existing.webhook_event_ids = [...(existing.webhook_event_ids || []), eventId];
  }
  await existing.save();
  return existing;
}
