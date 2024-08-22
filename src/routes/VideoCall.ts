import express from "express";
import jwt from "jsonwebtoken";
import CheckAuthToken from "../../middleware/CheckAuthToken";
const routes = express.Router();
routes.get(
  "/generateTokenForCall",
  CheckAuthToken,
  async (req: any, res: any) => {
    try {
      const API_KEY = process.env
        .VIDEO_SDK_API_KEY_FOR_VIDEO_AUDIO_CALL as string;
      const SECRET = process.env
        .VIDEO_SDK_API_SECRET_KEY_FOR_VIDEO_AUDIO_CALL as string;

      const Payload = {
        apikey: API_KEY, //MANDATORY
        permissions: [`allow_join`, `allow_mod`], //`ask_join` || `allow_mod` //MANDATORY
      };
      const options = {
        expiresIn: "120m",
        algorithm: "HS256",
      };
      const token = jwt.sign(Payload as any, SECRET as any, options as any);

      return res.status(200).json({ success: true, token: token });
    } catch (error) {
      return res.status(400).json({ success: false, message: "error" });
    }
  }
);
export default routes;
