import { configDotenv } from "dotenv";
import multer from "multer";
const cloudinary = require("cloudinary").v2;

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

export const Cloudinary_Cloud_Image_Uploader = async (file: any) => {

  try {
    const response = await cloudinary.uploader.upload(file, {
      resource_type: "auto",
    });
    return response;
    
  } catch (error) {
    // console.log(error);
  }
};

module.exports = {
  Cloudinary_Cloud_Image_Uploader,
  Server__Image__Uploader,
};
