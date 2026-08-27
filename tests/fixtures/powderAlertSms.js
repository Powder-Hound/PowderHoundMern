/**
 * Fixture: three preferred hills in one storm window (Sat).
 * Sorted inches desc: Vail 18, Aspen 14, Park City 12.
 */
export const VAIL_ASPEN_PARK_CITY_ALERTS = [
  {
    resortId: "resort-aspen",
    resortName: "Aspen",
    snowfall: 14,
    alertDate: new Date("2026-02-14T00:00:00.000Z"),
    expediaLink: "https://www.expedia.com/Aspen-Hotels",
    message: "🏨 Book Now! --> https://www.expedia.com/Aspen-Hotels\n❄️ PowAlert: 14in @ Aspen on Feb 14.",
  },
  {
    resortId: "resort-vail",
    resortName: "Vail",
    snowfall: 18,
    alertDate: new Date("2026-02-14T00:00:00.000Z"),
    expediaLink: "https://www.expedia.com/Vail-Hotels",
    message: "🏨 Book Now! --> https://www.expedia.com/Vail-Hotels\n❄️ PowAlert: 18in @ Vail on Feb 14.",
  },
  {
    resortId: "resort-park-city",
    resortName: "Park City",
    snowfall: 12,
    alertDate: new Date("2026-02-14T00:00:00.000Z"),
    expediaLink: null,
    message: "🏨 No lodging links available.\n❄️ PowAlert: 12in @ Park City on Feb 14.",
  },
];

export const EXPECTED_THREE_HILL_SMS =
  'PowAlert: Vail 18", Aspen 14", Park City 12" Sat. Open -> https://powalert.com/dashboard';
