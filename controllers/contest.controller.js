import { User } from "../models/users.model.js";
import {
  ADMIN_CSV_COLUMNS,
  adminEntriesToCsv,
  contestCohortFilter,
  contestWindowMeta,
  isDrawEligible,
  pickWeightedWinner,
  toAdminRow,
} from "../utils/contest.js";

const requireAdmin = (req, res) => {
  if (req.permissions !== "admin") {
    res.status(401).send({ success: false, message: "Unauthorized" });
    return false;
  }
  return true;
};

const ADMIN_SELECT =
  "phoneNumber createdAt refCode entries referredCompleteCount referredBy ipHash fraudFlag fraudReasons name resortPreference alertThreshold phoneVerifySID";

export const listContestEntries = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const users = await User.find(contestCohortFilter())
      .select(ADMIN_SELECT)
      .sort({ createdAt: 1 })
      .lean();
    const rows = users.map(toAdminRow);
    res.status(200).send({
      success: true,
      window: contestWindowMeta(),
      count: rows.length,
      columns: ADMIN_CSV_COLUMNS,
      rows,
      review: rows.filter((row) => row.fraudFlag),
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Error listing contest entries",
      error: error?.message || error,
    });
  }
};

export const listContestEntriesCsv = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const users = await User.find(contestCohortFilter())
      .select(ADMIN_SELECT)
      .sort({ createdAt: 1 })
      .lean();
    const csv = adminEntriesToCsv(users.map(toAdminRow));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="one-extra-storm-entries.csv"'
    );
    res.status(200).send(csv);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Error exporting contest CSV",
      error: error?.message || error,
    });
  }
};

/**
 * Weighted on-camera draw.
 *
 *   curl -X POST \
 *     -H "Authorization: Bearer $ADMIN_TOKEN" \
 *     https://powderhoundmern.onrender.com/api/users/contest/draw
 *
 * Picks 1 finished /go row with P(user) = user.entries / sum(entries).
 * Eligible = finished /go (name + pass + ≥1 hill + both sticks + OTP) and entries ≥ 1.
 */
export const drawContestWinner = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const users = await User.find({ entries: { $gte: 1 } })
      .select(ADMIN_SELECT)
      .lean();
    const { winner, eligibleCount, totalEntries } = pickWeightedWinner(users);
    res.status(200).send({
      success: true,
      window: contestWindowMeta(),
      eligibleCount,
      totalEntries,
      winner: winner
        ? {
            ...toAdminRow(winner),
            finishedGo: isDrawEligible(winner),
          }
        : null,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Error running weighted draw",
      error: error?.message || error,
    });
  }
};
