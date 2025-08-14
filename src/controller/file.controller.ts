import { Request, Response } from "express";
import { uploadSingleFile } from "../utils/uploadHelpers";

export async function uploadFileController(req: Request, res: Response) {
  try {
    const file = req.file;
    const category = req.body.category;

    if (!file || !category) {
      return res.status(400).json({
        error: "Missing file or category in request",
      });
    }

    const uploadResult = await uploadSingleFile(file, category);

    if (!uploadResult.url) {
      return res.status(500).json({
        error: uploadResult.error || "File upload failed",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        category,
        url: uploadResult.url,
        fileName: file.originalname,
        size: file.size,
      },
    });
  } catch (error: any) {
    console.error("Error uploading file:", error);
    return res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
}
