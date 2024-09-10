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

export const Cloudinary_Cloud_Image_Uploader = async (file: any) => {
  try {
    const response = await cloudinary.uploader.upload(file, {
      resource_type: "auto",
    });
    return response;
  } catch (error) {
    // // // console.log(error);
  }
};

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

export const Upload_Image_InTheMessage = async (base64Image: string) => {
  try {
    const buffer = Buffer.from(base64Image, "base64");
    const res = await Cloudinary_Cloud_Image_Uploader(buffer);
    console.log(res);
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  Cloudinary_Cloud_Image_Uploader,
  Server__Image__Uploader,
  Upload_Image_In_Compressed_Format,
  Profile_Picture_Uploader,
  CloudImageUploader,
};
