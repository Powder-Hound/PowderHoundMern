import mongoose from "mongoose";

const adminAuditSchema = new mongoose.Schema(
  {
    actorUserId: { type: String, default: "" },
    actorPhone: { type: String, default: "" },
    action: { type: String, required: true },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    resultCount: { type: Number, default: 0 },
    ip: { type: String, default: "" },
  },
  { timestamps: true }
);

export const AdminAudit = mongoose.model(
  "AdminAudit",
  adminAuditSchema,
  "admin_audit"
);
