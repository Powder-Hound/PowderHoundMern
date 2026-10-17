/** Documented Duffel Stays v2 shapes, trimmed to the fields PowAlert reads. */

export const searchResponse = {
  data: {
    created_at: "2026-10-17T01:00:00Z",
    results: [
      {
        id: "srr_0000ASVBuJVLdmqtZDJ4ca",
        check_in_date: "2026-12-18",
        check_out_date: "2026-12-20",
        rooms: 1,
        cheapest_rate_total_amount: "240.00",
        cheapest_rate_currency: "USD",
        accommodation: {
          id: "acc_expensive",
          name: "Ridge Lodge",
        },
      },
      {
        id: "srr_cheapest",
        check_in_date: "2026-12-18",
        check_out_date: "2026-12-20",
        rooms: 1,
        cheapest_rate_total_amount: "189.50",
        cheapest_rate_currency: "USD",
        accommodation: {
          id: "acc_cheap",
          name: "Creek Hotel",
        },
      },
      {
        id: "srr_gbp",
        cheapest_rate_total_amount: "10.00",
        cheapest_rate_currency: "GBP",
        accommodation: { id: "acc_gbp", name: "Ignored Currency" },
      },
    ],
  },
};

export const fetchAllRatesResponse = {
  data: {
    id: "srr_cheapest",
    accommodation: {
      id: "acc_cheap",
      name: "Creek Hotel",
      rooms: [
        {
          name: "Deluxe",
          rates: [
            {
              id: "rat_high",
              total_amount: "210.00",
              total_currency: "USD",
              estimated_commission_amount: "20.00",
              estimated_commission_currency: "USD",
            },
            {
              id: "rat_low",
              total_amount: "189.50",
              total_currency: "USD",
              estimated_commission_amount: "18.95",
              estimated_commission_currency: "USD",
            },
          ],
        },
      ],
    },
  },
};

export const quoteResponse = {
  data: {
    id: "quo_0000AS0NZdKjjnnHZmSUbI",
    check_in_date: "2026-12-18",
    check_out_date: "2026-12-20",
    total_amount: "189.50",
    total_currency: "USD",
    estimated_commission_amount: "18.95",
    estimated_commission_currency: "USD",
    accommodation: {
      id: "acc_cheap",
      name: "Creek Hotel",
      rooms: [
        {
          rates: [
            {
              id: "rat_low",
              total_amount: "189.50",
              total_currency: "USD",
              estimated_commission_amount: "18.95",
              estimated_commission_currency: "USD",
            },
          ],
        },
      ],
    },
  },
};

export const linksSessionResponse = {
  data: {
    url: "https://links.duffel.com/sessions/ses_test_powalert",
  },
};

export function confirmedBooking(overrides = {}) {
  return {
    id: "bok_0000confirmed",
    status: "confirmed",
    quote_id: "quo_0000AS0NZdKjjnnHZmSUbI",
    reference: "AFE33SE2",
    check_in_date: "2026-12-18",
    check_out_date: "2026-12-20",
    rooms: 1,
    guests: [{ given_name: "Ada", family_name: "Lovelace" }],
    estimated_commission_amount: "18.95",
    estimated_commission_currency: "USD",
    metadata: { checkout_reference: "powalert_beaver-mountain_ref" },
    accommodation: {
      id: "acc_cheap",
      name: "Creek Hotel",
      rooms: [
        {
          rates: [
            {
              id: "rat_low",
              total_amount: "189.50",
              total_currency: "USD",
              estimated_commission_amount: "18.95",
              estimated_commission_currency: "USD",
            },
          ],
        },
      ],
    },
    ...overrides,
  };
}

export const bookingsPage = {
  meta: { limit: 50, after: null },
  data: [
    confirmedBooking(),
    confirmedBooking({
      id: "bok_requested",
      status: "requested",
      metadata: {},
    }),
  ],
};
