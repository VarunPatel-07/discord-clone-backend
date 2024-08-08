import express from "express";
import { database } from "../database";
import multer from "multer";
import CheckAuthToken from "../../middleware/CheckAuthToken";
const routes = express.Router();

// * (1) creating a route for creating one to one chat
routes.post(
  "/CreateOneToOneChat",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { receiver_id } = req.body;
      if (receiver_id === req.user_id) return;
      const sender_id = req.user_id;

      const FindChat = await database.oneToOneConversation.findFirst({
        where: {
          AND: [{ SenderId: sender_id }, { ReceiverId: receiver_id }],
        },
        include: {
          DirectMessages: true,
          Recever: true,
          Sender: true,
        },
      });

      if (FindChat) {
        return res.status(200).json({
          success: true,
          message: "Chat exists",
          data: FindChat,
        });
      }

      const CreateChat = await database.oneToOneConversation.create({
        data: {
          SenderId: sender_id,
          ReceiverId: receiver_id,
        },
        include: {
          DirectMessages: true,
          Recever: true,
          Sender: true,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Chat created successfully",
        data: CreateChat,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while creating one to one chat",
      });
    }
  }
);
// * (2) creating a route for Sending Message In The Selected Channel in The Server
routes.post(
  "/sendMessageInTheSelectedChannel",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { server_id, channel_id, content } = req.body;
      console.log(req.body);
      const FindServer = await database.server.findUnique({
        where: {
          id: server_id,
        },
        include: {
          members: true,
        },
      });

      if (!FindServer) {
        return res.status(404).json({
          success: false,
          message: "Server not found",
        });
      }
      const FindChannel = await database.channel.findUnique({
        where: {
          id: channel_id,
          serverId: server_id,
        },
      });
      if (!FindChannel) {
        res.status(404).json({
          success: false,
          message: "Channel not found",
        });
      }
      const Member = FindServer.members.find(
        (member: any) => member.userId === req.user_id
      );
      if (!Member) {
        return res.status(404).json({
          success: false,
          message: "Member not found",
        });
      }
      const CreateChat = await database.groupMessage.create({
        data: {
          content,
          FileURL: "",
          memberId: Member.id, // provide a value for the member property
          channelId: FindChannel?.id as any,
        },
        include: {
          member: {
            include: {
              user: true,
            },
          },
          channel: true,
        },
      });
      console.log(CreateChat);
      return res.status(200).json({
        success: true,
        message: "Message sent successfully",
        data: CreateChat,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while creating group chat",
      });
    }
  }
);
routes.get(
  "/FetchingMessagesOfChannel",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      console.log(req.query);
      if (!req.query.server_id || !req.query.channel_id) return;
      const { server_id, channel_id } = req.query;

      const FindServer = await database.server.findUnique({
        where: {
          id: server_id,
        },
        include: {
          members: true,
        },
      });
      if (!FindServer) {
        return res.status(404).json({
          success: false,
          message: "Server not found",
        });
      }
      const FindChannel = await database.channel.findUnique({
        where: {
          id: channel_id,
          serverId: server_id,
        },
      });
      if (!FindChannel) {
        res.status(404).json({
          success: false,
          message: "Channel not found",
        });
      }

      const Messages = await database.groupMessage.findMany({
        where: {
          channelId: FindChannel?.id,
        },
        include: {
          member: {
            include: {
              user: true,
            },
          },
          channel: true,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Messages fetched successfully",
        Data: Messages,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while creating group chat",
      });
    }
  }
);

export default routes;
