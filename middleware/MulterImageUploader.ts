import { configDotenv } from "dotenv";
import multer from "multer";
import sharp from "sharp";
const cloudinary = require("cloudinary").v2;
import streamifier from "streamifier";
configDotenv();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
  api_key: process.env.CLOUDINARY_CLOUD_IMAGE_UPLOADING_API_KEY as string,
  api_secret: process.env.CLOUDINARY_CLOUD_IMAGE_UPLOADING_API_SECRETE as string,
});

const Allowed_Formate = (req: any, file: any, cb: any) => {
  const allowedFormats = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp", // Added WebP format
    "application/pdf",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];

  if (allowedFormats.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file format."));
  }
};

const Allowed_Document_Formate = (req: any, file: any, cb: any) => {
  const allowedDocumentFormats = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", // Excel (.xls)
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "application/rtf",
    "text/plain",
    "application/zip",
    "text/markdown",
    "text/html",
    "text/css",
    "application/octet-stream",
  ];
  console.log(file);
  if (allowedDocumentFormats.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid File Format."));
  }
};

export const Server__Image__Uploader = multer({
  fileFilter: Allowed_Formate,
}).fields([
  {
    name: "serverImage",
    maxCount: 1,
  },
]);
export const Profile_Picture_Uploader = multer({
  fileFilter: Allowed_Formate,
}).fields([
  {
    name: "profilePicture",
    maxCount: 1,
  },
  {
    name: "ProfileBannerImage",
    maxCount: 1,
  },
]);
export const CloudImageUploader = multer({
  fileFilter: Allowed_Formate,
}).fields([
  {
    name: "Image",
    maxCount: 1,
  },
]);

export const CloudFilesUploader = multer({
  storage: multer.memoryStorage(), // Use memory storage to access file buffers
  fileFilter: Allowed_Document_Formate,
}).fields([
  {
    name: "File",
    maxCount: 1,
  },
]);

export const Upload_Image_In_Compressed_Format = async (base64Image: string, height: number, width: number) => {
  try {
    const buffer = Buffer.from(base64Image, "base64");

    // Detect image format
    const imageMetadata = await sharp(buffer).metadata();

    const format = imageMetadata.format;

    // Check if image is in GIF format
    let processedImage;
    if (format === "gif") {
      processedImage = buffer; // Keep the original GIF format
    } else {
      // Resize and convert to WebP
      processedImage = await sharp(buffer).resize({ width, height }).webp().toBuffer();
    }

    // Function to upload image from buffer
    const uploadFromBuffer = (buffer: Buffer) => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream({ resource_type: "auto" }, (error: any, result: any) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        });
        streamifier.createReadStream(buffer).pipe(uploadStream);
      });
    };

    // Upload processed image
    const response = await uploadFromBuffer(processedImage);
    return response;
  } catch (error) {
    // // console.log("Error while processing image", error);
  }
};

export const UploadMultiImageToTheCloudFunction = async (base64Image: string) => {
  try {
    const dataURI = `data:image/jpeg;base64,${base64Image}`;
    const response = await cloudinary.uploader.upload(dataURI, { resource_type: "auto" });
    return response;
  } catch (error) {
    console.log("error form the UploadMultiImageToTheCloudFunction", error);
  }
};

const sanitizeFileName = (fileName: string) => {
  return fileName.replace(/\s+/g, "_").replace(/[^\w.-]+/g, "");
};

export const UploadFilesToTheCloudFunction = async (base64File: string, originalFileName: string) => {
  try {
    const dataURI = `data:application/pdf;base64,${base64File}`;
    const response = await cloudinary.uploader.upload(dataURI, {
      resource_type: "raw",
      folder: "discord-file-storage",
      use_filename: true, // This will use the original file name
      unique_filename: false, // Ensures that the file name does not get changed
      public_id: sanitizeFileName(originalFileName.split(".")[0]),
    });
    return response;
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  Server__Image__Uploader,
  Upload_Image_In_Compressed_Format,
  Profile_Picture_Uploader,
  CloudImageUploader,
  CloudFilesUploader,
  UploadMultiImageToTheCloudFunction,
  UploadFilesToTheCloudFunction,
};
