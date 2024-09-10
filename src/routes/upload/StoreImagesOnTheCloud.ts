import express from "express";
import CheckAuthToken from "../../../middleware/CheckAuthToken";
import { CloudImageUploader } from "../../../middleware/MulterImageUploader";
const routes = express.Router();

routes.post("/UploadImageToCloud", CloudImageUploader, CheckAuthToken, async (req: any, res: any) => {
  try {
    console.log("Uploading An Image", req.files);
  } catch (error) {
    console.log(error);
  }
});

export default routes;
