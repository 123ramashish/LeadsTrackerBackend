import { initializeImageKit } from "../config/imagekit";

export async function uploadToImageKit(
  file: Buffer,
  folder: string,
  fileName: string
): Promise<string> {
  const imagekit = initializeImageKit();
  try {
    const response = await imagekit.upload({
      file,
      fileName,
      folder: `/${folder}`,
    });
    return response.url;
  } catch (err: any) {
    console.error(`Error uploading ${fileName}:`, err.message || err);
    throw new Error(`Failed to upload ${fileName}`);
  }
}

export async function uploadSingleFile(
  file: Express.Multer.File,
  folder: string
): Promise<{ url?: string; message?: string; error?: string }> {
  try {
    if (!file || file.size === 0) {
      return {
        error: `File ${file?.originalname || "unknown"} is empty or missing.`,
      };
    }

    const fileExtension = file.originalname.split(".").pop();
    const fileName = `${folder}-${Date.now()}.${fileExtension}`;

    const url = await uploadToImageKit(file.buffer, folder, fileName);
    return { url, message: `${file.originalname} uploaded successfully` };
  } catch (error: any) {
    return { error: `Error uploading ${file.originalname}: ${error.message}` };
  }
}
