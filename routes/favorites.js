// server/routes/favorites.js
import express from "express";
import { ObjectId } from "mongodb";

const router = express.Router();

/**
 * Helper to obtain the favorites collection.
 * Tries these sources (in order):
 *  1) req.app.locals.db (preferred if index.js set it)
 *  2) globalThis.mongoClient (some examples store client globally)
 *
 * Caller should handle the case when collection is not available.
 */
function getFavoritesCollection(req) {
  try {
    if (req && req.app && req.app.locals && req.app.locals.db) {
      return req.app.locals.db.collection("favorites");
    }
  } catch (e) {
    // ignore
  }

  // try global mongo client (if your index.js exposes it)
  try {
    if (
      globalThis.mongoClient &&
      typeof globalThis.mongoClient.db === "function"
    ) {
      return globalThis.mongoClient.db("mydb").collection("favorites");
    }
  } catch (e) {
    // ignore
  }

  return null;
}

// GET /favorites?userEmail=...
router.get("/", async (req, res) => {
  const { userEmail } = req.query;
  try {
    const col = getFavoritesCollection(req);
    if (!col) {
      console.error("GET /favorites: favorites collection not available");
      return res.status(500).json({ success: false, message: "Server error" });
    }

    const q = {};
    if (userEmail) q.userEmail = userEmail;

    const docs = await col.find(q).toArray();
    const out = docs.map((d) => ({ ...d, _id: String(d._id) }));
    return res.json({ success: true, data: out });
  } catch (err) {
    console.error("GET /favorites error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /favorites  { itemId, userEmail, imageUrl?, title? }
router.post("/", async (req, res) => {
  const { itemId, userEmail, imageUrl, title, createdAt } = req.body || {};
  if (!itemId || !userEmail) {
    return res
      .status(400)
      .json({ success: false, message: "itemId and userEmail required" });
  }

  try {
    const col = getFavoritesCollection(req);
    if (!col) {
      console.error("POST /favorites: favorites collection not available");
      return res.status(500).json({ success: false, message: "Server error" });
    }

    // normalize itemId to string for storage/compare
    const normItemId = String(itemId);

    // duplicate check: same user + same itemId
    const exists = await col.findOne({ itemId: normItemId, userEmail });
    if (exists) {
      return res
        .status(409)
        .json({
          success: false,
          message: "Already favorited",
          data: { ...exists, _id: String(exists._id) },
        });
    }

    const doc = {
      itemId: normItemId,
      userEmail,
      imageUrl: imageUrl || "",
      title: title || "",
      createdAt: createdAt ? new Date(createdAt) : new Date(),
    };

    const r = await col.insertOne(doc);
    // return _id as string for client convenience
    doc._id = String(r.insertedId);
    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    console.error("POST /favorites error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE /favorites/:id
// Strategy:
//  1) if id looks like ObjectId -> try delete by ObjectId
//  2) try delete by _id stored as string
//  3) try delete by itemId
router.delete("/:id", async (req, res) => {
  const rawId = String(req.params.id || "").trim();

  if (!rawId) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }

  try {
    const col = getFavoritesCollection(req);
    if (!col) {
      console.error(
        "DELETE /favorites/:id: favorites collection not available"
      );
      return res.status(500).json({ success: false, message: "Server error" });
    }

    // 1) try ObjectId (if valid)
    if (ObjectId.isValid(rawId)) {
      try {
        const r = await col.findOneAndDelete({ _id: new ObjectId(rawId) });
        if (r.value) {
          return res.json({
            success: true,
            message: "Favorite removed",
            data: { _id: String(r.value._id) },
          });
        }
        // not found by ObjectId -> continue
      } catch (e) {
        console.warn("DELETE favorites by ObjectId error:", e);
        // continue to other strategies
      }
    }

    // 2) try deletion where _id stored as plain string
    try {
      const r2 = await col.findOneAndDelete({ _id: rawId });
      if (r2.value) {
        return res.json({
          success: true,
          message: "Favorite removed",
          data: { _id: String(r2.value._id) },
        });
      }
    } catch (e) {
      console.warn("DELETE favorites by string _id error:", e);
    }

    // 3) try deletion by itemId (some clients send itemId instead)
    try {
      const r3 = await col.findOneAndDelete({ itemId: rawId });
      if (r3.value) {
        return res.json({
          success: true,
          message: "Favorite removed (by itemId)",
          data: { _id: String(r3.value._id) },
        });
      }
    } catch (e) {
      console.warn("DELETE favorites by itemId error:", e);
    }

    // nothing matched
    return res.status(404).json({ success: false, message: "Not found" });
  } catch (err) {
    console.error("DELETE /favorites/:id unexpected error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
