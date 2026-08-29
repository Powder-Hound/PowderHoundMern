import { User } from "../models/users.model.js";
import {
  ADMIN_CSV_COLUMNS,
  adminEntriesToCsv,
  contestCohortFilter,
  contestWindowMeta,
  formatLockedDraw,
  resolveDraw,
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
  "phoneNumber createdAt refCode entries referredCompleteCount referredBy ipHash fraudFlag fraudReasons followClaims name resortPreference alertThreshold phoneVerifySID contestEnteredAt contestDrawLocked contestDrawnAt contestEntriesAtDraw";

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
 * Picks 1 in-window finished /go row with P(user) = user.entries / sum(entries).
 * Eligible = refCode (window mint) + finished /go + entries ≥ 1 + not fraudFlag.
 * First successful POST locks the winner; later POSTs return that lock (no re-roll).
 */
export const drawContestWinner = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const lockedWinner = await User.findOne({ contestDrawLocked: true })
      .select(ADMIN_SELECT)
      .sort({ contestDrawnAt: 1 })
      .lean();

    if (lockedWinner) {
      const locked = formatLockedDraw(lockedWinner);
      console.log("[contest-draw] already locked", {
        winnerUserId: locked.winnerUserId,
        drawnAt: locked.drawnAt,
        entriesAtDraw: locked.entriesAtDraw,
      });
      return res.status(200).send({
        success: true,
        alreadyLocked: true,
        window: contestWindowMeta(),
        eligibleCount: null,
        totalEntries: null,
        ...locked,
      });
    }

    const users = await User.find({
      entries: { $gte: 1 },
      refCode: { $exists: true, $nin: [null, ""] },
      fraudFlag: { $ne: true },
    })
      .select(ADMIN_SELECT)
      .lean();

    const resolved = resolveDraw({ rows: users });
    if (!resolved.winner) {
      return res.status(200).send({
        success: true,
        alreadyLocked: false,
        window: contestWindowMeta(),
        eligibleCount: resolved.eligibleCount,
        totalEntries: resolved.totalEntries,
        winner: null,
        winnerUserId: null,
        drawnAt: null,
        entriesAtDraw: null,
      });
    }

    const drawnAt = new Date();
    const entriesAtDraw = Number(resolved.winner.entries) || 0;
    await User.findOneAndUpdate(
      { _id: resolved.winner._id, contestDrawLocked: { $ne: true } },
      {
        $set: {
          contestDrawLocked: true,
          contestDrawnAt: drawnAt,
          contestEntriesAtDraw: entriesAtDraw,
        },
      }
    );

    const official = await User.findOne({ contestDrawLocked: true })
      .select(ADMIN_SELECT)
      .sort({ contestDrawnAt: 1 })
      .lean();
    const locked = formatLockedDraw(official);
    console.log("[contest-draw] locked", {
      winnerUserId: locked.winnerUserId,
      drawnAt: locked.drawnAt,
      entriesAtDraw: locked.entriesAtDraw,
      eligibleCount: resolved.eligibleCount,
      totalEntries: resolved.totalEntries,
    });

    return res.status(200).send({
      success: true,
      alreadyLocked: false,
      window: contestWindowMeta(),
      eligibleCount: resolved.eligibleCount,
      totalEntries: resolved.totalEntries,
      ...locked,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Error running weighted draw",
      error: error?.message || error,
    });
  }
};
