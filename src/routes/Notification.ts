import express from "express";
import CheckAuthToken from "../../middleware/CheckAuthToken";
import { body, validationResult } from "express-validator";
import { database } from "../database";
import multer from "multer";
import { DeleteSpecificDataInRedis } from "../Helper/StorDataInRedis";
const routes = express.Router();

routes.post(
  "/FollowNotification",
  CheckAuthToken,
  multer().none(),
  [
    body("sender_id").exists().withMessage("Profile_Picture is required"),
    body("receiver_id").exists().withMessage("FullName is required"),
    body("type").exists().withMessage("UserName is required"),
    body("message").exists().withMessage("Message is required"),
  ],
  async (req: any, res: any) => {
    try {
      const result = validationResult(req);

      if (!result.isEmpty()) {
        return res.status(400).json({ errors: result });
      }
      const Cache_Key = `Notification_${req.user_id}`;
      DeleteSpecificDataInRedis(Cache_Key);
      const { sender_id, receiver_id, type, message } = req.body;
      const FollowNotification = await database.notification.create({
        data: {
          senderId: sender_id,
          receiverId: receiver_id,
          User_Id: receiver_id,
          type,
          message,
        },
        include: {
          sender: true,
          receiver: true,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Notification created successfully",
        data: FollowNotification,
      });
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while storing notification",
      });
    }
  }
);
routes.post(
  "/StoreMessageNotification",
  CheckAuthToken,
  multer().none(),
  [
    body("sender_id").exists().withMessage("sender_id is required"),
    body("message").exists().withMessage("message is required"),
    body("type").exists().withMessage("type is required"),
    body("server_id").exists().withMessage("server_id is required"),
    body("channel_id").exists().withMessage("channel_id is required"),
  ],
  async (req: any, res: any) => {
    try {
      const result = validationResult(req);
      if (!result.isEmpty()) {
        return res.status(400).json({ errors: result });
      }
      const { sender_id, message, type, server_id, channel_id } = req.body;
      const StoreMessageNotification = await database.notification.create({
        data: {
          senderId: sender_id,
          User_Id: "",
          type,
          message,
          ServerId: server_id,
          ChannelId: channel_id,
        },
        include: {
          sender: true,
          receiver: true,
          channel_info: true,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Notification created successfully",
        data: StoreMessageNotification,
      });
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while storing notification",
      });
    }
  }
);

routes.get(
  "/FetchAllTheNotification/:server_id",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      console.log(req.params);
      const { server_id } = req.params;
      if (!server_id) return;
      const Server_IDs = Array.isArray(server_id)
        ? server_id
        : server_id.split(",");
      const notification = await database.notification.findMany({
        where: {
          OR: [{ User_Id: req.user_id }, { ServerId: { in: Server_IDs } }],
          NOT: [{ senderId: req.user_id }],
        },
        include: {
          sender: true,
          receiver: true,
          channel_info: true,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Notification fetched successfully",
        data: notification,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

export default routes;
