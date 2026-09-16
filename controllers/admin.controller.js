import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AdminAudit } from "../models/adminAudit.model.js";
import { User } from "../models/users.model.js";
import {
  CRM_CSV_COLUMNS,
  CRM_PUBLIC_QUERY_KEYS,
  buildCrmFilter,
  crmRowsToCsv,
  parseCrmPaging,
  toCrmRow,
} from "../utils/adminCrm.js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const CRM_SELECT = [
  "name",
  "phoneNumber",
  "email",
  "emailMarketingConsent",
  "emailMarketingConsentAt",
  "emailSource",
  "resortPreference",
  "alertThreshold",
  "createdAt",
  "phoneVerifySID",
  "refCode",
  "entries",
  "contestEnteredAt",
  "contestDrawLocked",
  "baseEntryGranted",
  "fraudFlag",
  "followClaims",
  "instagramHandle",
  "igHandle",
  "instagram",
].join(" ");

const clientIp = (req) => {
  const forwarded = req?.headers?.["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return String(req?.ip || req?.socket?.remoteAddress || "").trim();
};

const publicFilters = (query = {}) => {
  const out = {};
  for (const key of CRM_PUBLIC_QUERY_KEYS) {
    if (query[key] !== undefined && query[key] !== "") {
      out[key] = query[key];
    }
  }
  return out;
};

const writeAudit = async ({ req, action, filters, resultCount }) => {
  try {
    await AdminAudit.create({
      actorUserId: String(req.adminUser?._id || req.userID || ""),
      actorPhone: req.adminUser?.phoneNumber || "",
      action,
      filters,
      resultCount,
      ip: clientIp(req),
    });
  } catch (error) {
    console.error("[admin-audit]", error?.message || error);
  }
};

export const serveAdminHtml = (_req, res) => {
  res.sendFile(join(publicDir, "admin.html"));
};

export const getAdminSession = async (req, res) => {
  return res.status(200).send({
    success: true,
    readOnly: true,
    admin: {
      id: String(req.adminUser._id),
      name: req.adminUser.name || "",
      phoneNumber: req.adminUser.phoneNumber,
    },
  });
};

export const listCrmUsers = async (req, res) => {
  const parsed = buildCrmFilter(req.query);
  if (!parsed.ok) {
    return res.status(parsed.status).send({
      success: false,
      message: parsed.message,
    });
  }

  const paging = parseCrmPaging(req.query);
  try {
    const [total, users] = await Promise.all([
      User.countDocuments(parsed.filter),
      User.find(parsed.filter)
        .select(CRM_SELECT)
        .sort({ createdAt: -1 })
        .skip(paging.skip)
        .limit(paging.limit)
        .lean(),
    ]);

    const rows = users.map(toCrmRow);
    await writeAudit({
      req,
      action: "crm.list",
      filters: publicFilters(req.query),
      resultCount: rows.length,
    });

    return res.status(200).send({
      success: true,
      readOnly: true,
      page: paging.page,
      limit: paging.limit,
      total,
      count: rows.length,
      columns: CRM_CSV_COLUMNS,
      rows,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error listing users",
      error: error?.message || error,
    });
  }
};

export const exportCrmUsersCsv = async (req, res) => {
  const parsed = buildCrmFilter(req.query);
  if (!parsed.ok) {
    return res.status(parsed.status).send({
      success: false,
      message: parsed.message,
    });
  }

  const paging = parseCrmPaging(req.query, { exportAll: true });
  try {
    const users = await User.find(parsed.filter)
      .select(CRM_SELECT)
      .sort({ createdAt: -1 })
      .limit(paging.limit)
      .lean();

    const rows = users.map(toCrmRow);
    await writeAudit({
      req,
      action: "crm.export.csv",
      filters: publicFilters(req.query),
      resultCount: rows.length,
    });

    const csv = crmRowsToCsv(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="powalert-crm-users.csv"'
    );
    return res.status(200).send(csv);
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error exporting users",
      error: error?.message || error,
    });
  }
};
