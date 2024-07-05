import express from "express";
import {
  Server__Image__Uploader,
  Cloudinary_Cloud_Image_Uploader,
} from "../../middleware/MulterImageUploader";
import { database } from "../database";
import { body, validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import { MemberRole } from "@prisma/client";
import CheckAuthToken from "../../middleware/CheckAuthToken";

const routes = express.Router();

routes.post(
  "/create-server",
  Server__Image__Uploader,
  CheckAuthToken,
  [body("ServerName", "ServerName is required").exists()],
  async (req: any, res: any) => {
    try {
      const imageArr = req.files;
      if (!imageArr) {
        return res
          .status(400)
          .json({ message: "the server image is required", success: false });
      }
      const { ServerName } = req.body;
      const result = validationResult(req);
      if (!result.isEmpty()) {
        return res.status(400).json({ errors: result });
      }
      const check_server = await database.server.findUnique({
        where: {
          name: ServerName,
        },
      });
      if (check_server) {
        return res
          .status(400)
          .json({ message: "Server already exists", success: false });
      }
      const Group_Admin = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
      });

      const ServerImageBs64 = Buffer.from(
        imageArr.serverImage[0].buffer
      ).toString("base64");
      const ServerImageURL =
        "data:" +
        imageArr.serverImage[0].mimetype +
        ";base64," +
        ServerImageBs64;

      const CloudServerImage = await Cloudinary_Cloud_Image_Uploader(
        ServerImageURL
      );

      if (!CloudServerImage) {
        console.error("Image upload failed");
      }

      const server = await database.server.create({
        data: {
          name: ServerName,
          imageUrl: CloudServerImage?.secure_url as any,
          inviteCode: uuidv4(),
          usersId: Group_Admin?.id as any,
          channels: {
            create: [{ name: "general", userId: Group_Admin?.id as any }],
          },
          members: {
            create: [
              {
                userId: Group_Admin?.id as any,
                role: MemberRole.ADMIN,
              },
            ],
          },
        },
      });

      return res.status(200).json({
        message: "Server created successfully",
        server_id: server.id,
        success: true,
      });
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        message: "Internal server error while creating server",
        success: false,
      });
    }
  }
);

routes.get("/get-servers", CheckAuthToken, async (req: any, res: any) => {
  try {
    const server_info = await database.server.findMany({
      where: {
        usersId: req.user_id,
      },
    });
    if (!server_info) {
      return res
        .status(400)
        .json({ message: "No server found", success: false });
    }
    return res.status(200).json({ server_info, success: true });
  } catch (error) {
    console.log(error);
  }
});
routes.get(
  "/serverInfo/:serverId",
  CheckAuthToken,
  async (req: any, res: any) => {
    try {
      const { serverId } = req.params as { serverId: string };
      const Server__Info = await database.server.findUnique({
        where: {
          id: serverId,
        },
        include: {
          channels: true,
          members: true,
        },
      });
      return res.status(200).json({ Server__Info, success: true });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Internal server error while getting server info",
      });
    }
  }
);
export default routes;
