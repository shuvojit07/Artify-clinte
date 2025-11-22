// index.js
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";

// Server Port
const PORT = 4000;

// Your MongoDB connection string 
const MONGO_URI =
  "mongodb+srv://Artify-server:W2ny2Zw42LPwUSFX@cluster0.s0he4h7.mongodb.net/mydb?retryWrites=true&w=majority";

// Express app
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// MongoDB setup
let mongoClient = null;
let itemsCollection = null;

function docToItem(doc) {
  if (!doc) return null;
  return { ...doc, _id: String(doc._id) };
}

async function connectMongo() {
  try {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db("mydb");
    itemsCollection = db.collection("items");
    app.locals.db = db;
    globalThis.mongoClient = mongoClient;

    console.log(
      "Connected to MongoDB — itemsCollection initialized and app.locals.db set"
    );
  } catch (err) {
    console.error("MongoDB connection error:", err);
    throw err;
  }
}

// Root route
app.get("/", (req, res) => {
  res.json({ ok: true, message: "Artify Backend Running" });
});

//    GET ALL ARTWORK ITEMS
app.get("/items", async (req, res) => {
  if (!itemsCollection) {
    console.error("GET /items: itemsCollection not initialized");
    return res.status(500).json({ success: false, message: "Server error" });
  }

  try {
    const q = {};

    // optional filters
    if (req.query.userEmail) q.userEmail = req.query.userEmail;
    if (req.query.visibility) q.visibility = req.query.visibility;
    if (req.query.category) q.category = req.query.category;

    let cursor = itemsCollection.find(q);

    if (req.query.sort) {
      const [field, dir] = req.query.sort.split("_");
      cursor = cursor.sort({ [field]: dir === "desc" ? -1 : 1 });
    }

    if (req.query.limit) {
      cursor = cursor.limit(Number(req.query.limit));
    }

    const docs = await cursor.toArray();
    return res.json({ success: true, data: docs.map(docToItem) });
  } catch (err) {
    console.error("GET /items error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// FAVORITES ROUTES  
app.get("/favorites", async (req, res) => {
  try {
    const db =
      app.locals.db ||
      (globalThis.mongoClient &&
        globalThis.mongoClient.db &&
        globalThis.mongoClient.db("mydb"));
    if (!db) {
      console.error("GET /favorites: db not available");
      return res.status(500).json({ success: false, message: "Server error" });
    }
    const col = db.collection("favorites");
    const q = {};
    if (req.query.userEmail) q.userEmail = req.query.userEmail;
    const docs = await col.find(q).toArray();
    return res.json({
      success: true,
      data: docs.map((d) => ({ ...d, _id: String(d._id) })),
    });
  } catch (err) {
    console.error("GET /favorites error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/favorites", async (req, res) => {
  try {
    let { itemId, userEmail, imageUrl, title, createdAt } = req.body || {};
    if (!itemId || !userEmail) {
      return res
        .status(400)
        .json({ success: false, message: "itemId and userEmail required" });
    }

    itemId = String(itemId).trim();

    const db =
      app.locals.db ||
      (globalThis.mongoClient &&
        globalThis.mongoClient.db &&
        globalThis.mongoClient.db("mydb"));
    if (!db) {
      console.error("POST /favorites: db not available");
      return res.status(500).json({ success: false, message: "Server error" });
    }
    const col = db.collection("favorites");
    const exists = await col.findOne({ itemId: itemId, userEmail: userEmail });
    if (exists) {
      return res
        .status(409)
        .json({
          success: false,
          message: "Already saved",
          data: { ...exists, _id: String(exists._id) },
        });
    }

    const doc = {
      itemId,
      userEmail,
      imageUrl: imageUrl || "",
      title: title || "",
      createdAt: createdAt ? new Date(createdAt) : new Date(),
    };

    const r = await col.insertOne(doc);
    doc._id = String(r.insertedId);
    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    console.error("POST /favorites error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

app.delete("/favorites/:id", async (req, res) => {
  try {
    const raw = String(req.params.id || "").trim();
    if (!raw)
      return res.status(400).json({ success: false, message: "Invalid id" });

    const db =
      app.locals.db ||
      (globalThis.mongoClient &&
        globalThis.mongoClient.db &&
        globalThis.mongoClient.db("mydb"));
    if (!db) {
      console.error("DELETE /favorites/:id: db not available");
      return res.status(500).json({ success: false, message: "Server error" });
    }
    const col = db.collection("favorites");

    // Strategy 1: if raw looks like ObjectId, try that first
    if (ObjectId.isValid(raw)) {
      try {
        const r = await col.findOneAndDelete({ _id: new ObjectId(raw) });
        if (r && r.value) {
          return res.json({
            success: true,
            message: "Favorite removed",
            data: { _id: String(r.value._id) },
          });
        }
      } catch (err) {
        console.warn("delete favorites by ObjectId error", err);
        // continue to other strategies
      }
    }

    // Strategy 2: try _id stored as plain string
    try {
      const r2 = await col.findOneAndDelete({ _id: raw });
      if (r2 && r2.value) {
        return res.json({
          success: true,
          message: "Favorite removed",
          data: { _id: String(r2.value._id) },
        });
      }
    } catch (err) {
      console.warn("delete favorites by string _id error", err);
    }

    // Strategy 3: try delete by itemId (client may have passed itemId)
    try {
      const r3 = await col.findOneAndDelete({ itemId: raw });
      if (r3 && r3.value) {
        return res.json({
          success: true,
          message: "Favorite removed (by itemId)",
          data: { _id: String(r3.value._id) },
        });
      }
    } catch (err) {
      console.warn("delete favorites by itemId error", err);
    }

    // nothing matched
    return res.status(404).json({ success: false, message: "Not found" });
  } catch (err) {
    console.error("DELETE /favorites/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==========================================================
// ================   GET SINGLE ARTWORK   ===================
// ==========================================================
app.get("/items/:id", async (req, res) => {
  const id = req.params.id;

  if (!itemsCollection) {
    console.error("GET /items/:id: itemsCollection not initialized");
    return res.status(500).json({ success: false, message: "Server error" });
  }

  // if id looks like ObjectId, use that, otherwise try string-based _id
  try {
    if (ObjectId.isValid(id)) {
      const doc = await itemsCollection.findOne({ _id: new ObjectId(id) });
      if (doc) return res.json({ success: true, data: docToItem(doc) });
      // fallthrough to try string _id
    }

    const doc2 = await itemsCollection.findOne({ _id: id });
    if (doc2) return res.json({ success: true, data: docToItem(doc2) });

    return res.status(404).json({ success: false, message: "Not Found" });
  } catch (err) {
    console.error("GET /items/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==========================================================
// ====================   ADD ARTWORK   =====================
// ==========================================================
app.post("/items", async (req, res) => {
  if (!itemsCollection) {
    console.error("POST /items: itemsCollection not initialized");
    return res.status(500).json({ success: false, message: "Server error" });
  }

  const {
    imageUrl,
    title,
    category,
    medium,
    description,
    dimensions,
    price,
    visibility,
    artistName,
    userEmail,
    createdAt,
  } = req.body;

  if (!imageUrl || !title) {
    return res.status(400).json({
      success: false,
      message: "imageUrl and title are required",
    });
  }

  try {
    const artwork = {
      imageUrl,
      title,
      category: category || "",
      medium: medium || "",
      description: description || "",
      dimensions: dimensions || "",
      price: price || "",
      visibility: visibility || "public",
      artistName: artistName || "",
      userEmail: userEmail || "",
      likes: 0,
      createdAt: createdAt ? new Date(createdAt) : new Date(),
    };

    const result = await itemsCollection.insertOne(artwork);

    // return created doc with string _id
    const createdDoc = { ...artwork, _id: result.insertedId };
    res.status(201).json({
      success: true,
      data: docToItem(createdDoc),
    });
  } catch (err) {
    console.error("POST /items insert error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==========================================================
// =================   UPDATE ARTWORK   ======================
// ==========================================================
app.put("/items/:id", async (req, res) => {
  const id = req.params.id;

  if (!itemsCollection) {
    console.error("PUT /items/:id: itemsCollection not initialized");
    return res.status(500).json({ success: false, message: "Server error" });
  }

  try {
    // try ObjectId update first (if possible)
    if (ObjectId.isValid(id)) {
      const update = { $set: req.body };
      const r = await itemsCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        update,
        { returnDocument: "after" }
      );
      if (r.value) {
        return res.json({ success: true, data: docToItem(r.value) });
      }
      // else fallthrough to try string _id
    } else {
      console.log("PUT: id not valid ObjectId, will try string _id:", id);
    }

    // fallback: try update by string _id
    const update2 = { $set: req.body };
    const r2 = await itemsCollection.findOneAndUpdate({ _id: id }, update2, {
      returnDocument: "after",
    });
    if (r2.value) {
      return res.json({ success: true, data: docToItem(r2.value) });
    }

    return res.status(404).json({ success: false, message: "Not Found" });
  } catch (err) {
    console.error("PUT /items/:id error:", err, err.stack);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==========================================================
// =================   DELETE ARTWORK   ======================
// Robust delete: try ObjectId, then string _id; log full errors
// ==========================================================
app.delete("/items/:id", async (req, res) => {
  const id = req.params.id;
  console.log("DELETE /items/:id called with id:", id);

  if (!itemsCollection) {
    console.error("DELETE: itemsCollection is not initialized");
    return res.status(500).json({ success: false, message: "Server error" });
  }

  try {
    // try ObjectId deletion if valid
    if (ObjectId.isValid(id)) {
      try {
        const r = await itemsCollection.findOneAndDelete({
          _id: new ObjectId(id),
        });
        if (r.value) {
          console.log("DELETE: removed by ObjectId:", id);
          return res.json({ success: true, message: "Artwork Deleted" });
        }
        // not found by ObjectId -> fallthrough
      } catch (innerErr) {
        console.error("DELETE: error deleting by ObjectId:", innerErr);
        // fallthrough to try string _id
      }
    } else {
      console.log("DELETE: provided id is not a valid ObjectId:", id);
    }

    // fallback: try delete by string _id
    try {
      const r2 = await itemsCollection.findOneAndDelete({ _id: id });
      if (r2.value) {
        console.log("DELETE: removed by string _id:", id);
        return res.json({ success: true, message: "Artwork Deleted" });
      }
    } catch (innerErr2) {
      console.error("DELETE: error deleting by string _id:", innerErr2);
    }

    console.warn("DELETE: not found for id:", id);
    return res.status(404).json({ success: false, message: "Not Found" });
  } catch (err) {
    console.error("DELETE /items/:id unexpected error:", err, err.stack);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// START SERVER
const start = async () => {
  try {
    await connectMongo();
    app.listen(PORT, () =>
      console.log(`SERVER RUNNING → http://localhost:${PORT}`)
    );
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

start();
