// server/routes/items.js
import express from "express";
import { ObjectId } from "mongodb";
import { MongoClient, ObjectId } from "mongodb";

const router = express.Router();
// after connecting:
const db = mongoClient.db("mydb");
app.locals.db = db;
globalThis.mongoClient = mongoClient; 

function docToItem(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: String(_id), ...rest };
}

function itemsCollection(req) {
  const db = req.app.locals.db;
  return db ? db.collection("items") : null;
}

function ensureInMemory(req) {
  if (!req.app.locals._inMemoryItems) {
    req.app.locals._inMemoryItems = [
      // optional sample items
      { _id: "1", title: "Sample One", description: "desc", likes: 0 },
    ];
  }
  return req.app.locals._inMemoryItems;
}

/**
 * CREATE: POST /items
 * body: { title, description, likes?, imageUrl?, category?, medium?, artistName? }
 */
router.post("/", async (req, res) => {
  const payload = req.body || {};
  if (!payload.title)
    return res
      .status(400)
      .json({ success: false, message: "title is required" });

  try {
    const col = itemsCollection(req);
    if (col) {
      const doc = {
        ...payload,
        likes: typeof payload.likes === "number" ? payload.likes : 0,
        createdAt: new Date(),
      };
      const r = await col.insertOne(doc);
      doc._id = r.insertedId;
      return res.status(201).json({ success: true, data: docToItem(doc) });
    }

    // in-memory fallback
    const items = ensureInMemory(req);
    const newId = String(Date.now());
    const newItem = { _id: newId, ...payload, likes: payload.likes || 0 };
    items.push(newItem);
    return res.status(201).json({ success: true, data: newItem });
  } catch (err) {
    console.error("POST /items error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /items
 */
router.get("/", async (req, res) => {
  try {
    const col = itemsCollection(req);
    if (col) {
      const docs = await col.find({}).toArray();
      return res.json({ success: true, data: docs.map(docToItem) });
    }
    const items = ensureInMemory(req);
    return res.json({ success: true, data: items });
  } catch (err) {
    console.error("GET /items error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /items/:id
 */
router.get("/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const col = itemsCollection(req);
    if (col) {
      if (ObjectId.isValid(id)) {
        const doc = await col.findOne({ _id: new ObjectId(id) });
        if (doc) return res.json({ success: true, data: docToItem(doc) });
      }
      const doc2 = await col.findOne({ _id: id });
      if (doc2) return res.json({ success: true, data: docToItem(doc2) });
      return res.status(404).json({ success: false, message: "Not found" });
    }
    const items = ensureInMemory(req);
    const it = items.find((i) => i._id === id);
    if (!it)
      return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: it });
  } catch (err) {
    console.error("GET /items/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * PATCH /items/:id  -- partial update
 */
router.patch("/:id", async (req, res) => {
  const id = req.params.id;
  const updates = req.body || {};
  try {
    const col = itemsCollection(req);
    if (col) {
      if (
        updates.likes != null &&
        (typeof updates.likes !== "number" || updates.likes < 0)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message: "likes must be a non-negative number",
          });
      }
      if (ObjectId.isValid(id)) {
        const r = await col.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: updates },
          { returnDocument: "after" }
        );
        if (r.value)
          return res.json({ success: true, data: docToItem(r.value) });
      }
      const r2 = await col.findOneAndUpdate(
        { _id: id },
        { $set: updates },
        { returnDocument: "after" }
      );
      if (r2.value)
        return res.json({ success: true, data: docToItem(r2.value) });
      return res.status(404).json({ success: false, message: "Not found" });
    }
    const items = ensureInMemory(req);
    const idx = items.findIndex((i) => i._id === id);
    if (idx === -1)
      return res.status(404).json({ success: false, message: "Not found" });
    Object.assign(items[idx], updates);
    return res.json({ success: true, data: items[idx] });
  } catch (err) {
    console.error("PATCH /items/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * PUT /items/:id  -- partial/replace (keeps fields not provided)
 */
router.put("/:id", async (req, res) => {
  const id = req.params.id;
  const payload = req.body || {};
  try {
    const col = itemsCollection(req);
    if (col) {
      const update = {};
      for (const k of [
        "title",
        "description",
        "likes",
        "imageUrl",
        "image",
        "category",
        "medium",
        "artistName",
      ]) {
        if (payload[k] !== undefined) update[k] = payload[k];
      }
      if (ObjectId.isValid(id)) {
        const r = await col.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: update },
          { returnDocument: "after" }
        );
        if (r.value)
          return res.json({ success: true, data: docToItem(r.value) });
      }
      const r2 = await col.findOneAndUpdate(
        { _id: id },
        { $set: update },
        { returnDocument: "after" }
      );
      if (r2.value)
        return res.json({ success: true, data: docToItem(r2.value) });
      return res.status(404).json({ success: false, message: "Not found" });
    }
    const items = ensureInMemory(req);
    const it = items.find((i) => i._id === id);
    if (!it)
      return res.status(404).json({ success: false, message: "Not found" });
    for (const key in payload) it[key] = payload[key];
    return res.json({ success: true, data: it });
  } catch (err) {
    console.error("PUT /items/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * DELETE /items/:id
 */
router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const col = itemsCollection(req);
    if (col) {
      if (ObjectId.isValid(id)) {
        const r = await col.findOneAndDelete({ _id: new ObjectId(id) });
        if (!r.value)
          return res.status(404).json({ success: false, message: "Not found" });
        return res.json({ success: true, message: "Deleted" });
      }
      const r2 = await col.findOneAndDelete({ _id: id });
      if (!r2.value)
        return res.status(404).json({ success: false, message: "Not found" });
      return res.json({ success: true, message: "Deleted" });
    }
    // in-memory
    const items = ensureInMemory(req);
    const idx = items.findIndex((i) => i._id === id);
    if (idx === -1)
      return res.status(404).json({ success: false, message: "Not found" });
    items.splice(idx, 1);
    return res.json({ success: true, message: "Deleted" });
  } catch (err) {
    console.error("DELETE /items/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * POST /items/:id/like  (robust: try ObjectId then string)
 */
router.post("/:id/like", async (req, res) => {
  const id = req.params.id;
  try {
    const col = itemsCollection(req);
    if (!col)
      return res
        .status(500)
        .json({ success: false, message: "DB not connected" });

    if (ObjectId.isValid(id)) {
      const r = await col.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $inc: { likes: 1 } },
        { returnDocument: "after" }
      );
      if (r.value)
        return res.json({
          success: true,
          message: "Liked",
          data: docToItem(r.value),
        });
    }

    const r2 = await col.findOneAndUpdate(
      { _id: id },
      { $inc: { likes: 1 } },
      { returnDocument: "after" }
    );
    if (r2.value)
      return res.json({
        success: true,
        message: "Liked",
        data: docToItem(r2.value),
      });

    return res.status(404).json({ success: false, message: "Not found" });
  } catch (err) {
    console.error("POST /items/:id/like error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
