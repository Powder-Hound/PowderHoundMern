import mongoose from "mongoose";
import { ResortGame } from "../models/resortGame.model.js";
import { ResortGameDay } from "../models/resortGameDay.model.js";

export function memoryStore() {
  const games = new Map();
  const days = [];
  let sequence = 1;
  return {
    async create(state) {
      state.gameId = `g${sequence}`;
      sequence += 1;
      games.set(state.gameId, structuredClone(state));
      return structuredClone(state);
    },
    async findById(id) {
      const found = games.get(id);
      return found ? structuredClone(found) : null;
    },
    async save(state) {
      games.set(state.gameId, structuredClone(state));
    },
    async addDay(day) {
      days.push(structuredClone(day));
    },
    async listDays(gameId) {
      return days.filter((day) => day.gameId === gameId).map((day) => structuredClone(day));
    },
  };
}

export const mongoStore = {
  async create(state) {
    const _id = new mongoose.Types.ObjectId();
    state.gameId = String(_id);
    await ResortGame.create({
      _id,
      userId: state.userId,
      powalertResortId: state.profile.powalertResortId,
      state,
    });
    return state;
  },
  async findById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await ResortGame.findById(id).lean();
    return doc?.state ?? null;
  },
  async save(state) {
    await ResortGame.updateOne({ _id: state.gameId }, { $set: { state } });
  },
  async addDay(day) {
    await ResortGameDay.create(day);
  },
  async listDays(gameId) {
    return ResortGameDay.find({ gameId }).sort({ dayIndex: 1 }).lean();
  },
};
