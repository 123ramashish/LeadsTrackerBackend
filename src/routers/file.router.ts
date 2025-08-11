import { Router } from "express";
import multer from "multer";
import { uploadFileController } from "../controller/file.controller";

// Multer memory storage
const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

router.post("/fileupload", upload.single("file"), uploadFileController);

export default router;
