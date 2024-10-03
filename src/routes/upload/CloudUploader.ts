import express from "express";
import CheckAuthToken from "../../../middleware/CheckAuthToken";
import {
  CloudFilesUploader,
  CloudImageUploader,
  UploadFilesToTheCloudFunction,
  UploadMultiImageToTheCloudFunction,
} from "../../../middleware/MulterImageUploader";
const routes = express.Router();

routes.post("/UploadImageToCloud", CloudImageUploader, CheckAuthToken, async (req: any, res: any) => {
  try {
    const imageFiles = req.files;
    if (!imageFiles) return;
    if (imageFiles?.Image[0]?.size > 10485760 * 3) {
      return res.status(400).json({
        message: "the image is to big to upload",
      });
    }
    const imageBs64Form = Buffer.from(imageFiles?.Image[0]?.buffer).toString("base64");

    const imageUrl = await UploadMultiImageToTheCloudFunction(imageBs64Form);

    if (imageUrl.secure_url) {
      return res.status(200).json({
        success: true,
        message: "the image is upload successfully",
        data: imageUrl,
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "the error while uploading the images to cloud",
      error: error,
    });
  }
});

routes.post("/uploadFilesToTheCloud", CheckAuthToken, CloudFilesUploader, async (req: any, res: any) => {
  try {
    const filesArray = req.files;
    const fileType = filesArray?.File[0]?.mimetype;
    if (!filesArray) return;
    if (filesArray?.File[0]?.size > 10485760 * 5) {
      return res.json({ message: "file is To big To upload" });
    }
    const fileBuffer = Buffer.from(filesArray.File[0].buffer).toString("base64");
    const fileInfo = await UploadFilesToTheCloudFunction(
      fileBuffer,
      filesArray?.File[0]?.originalname || filesArray?.File[0]?.name
    );

    const Data = {
      fileInfo,
      fileType,
    };
    if (fileInfo?.secure_url) {
      return res.status(200).json({
        message: "the file uploaded successfully",
        success: true,
        data: Data,
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "the error while uploading the files to cloud",
      error: error,
    });
  }
});

export default routes;
