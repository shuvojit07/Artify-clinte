// server/routes/admin.js
import express from "express";
import { ObjectId } from "mongodb";
const router = express.Router();

// Example: GET /admin/artworks
router.get("/artworks", async (req, res) => {
  try {
    const col = req.app.locals.db.collection("items");
    const docs = await col.find().toArray();
    res.json({ success: true, data: docs });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete artwork (admin)
router.delete("/artworks/:id", async (req, res) => {
  try {
    const col = req.app.locals.db.collection("items");
    const r = await col.findOneAndDelete({ _id: new ObjectId(req.params.id) });
    if (!r.value) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
