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
// * (3) creating a route for Fetching Messages Of The Channel
routes.get(
  "/FetchingMessagesOfChannel",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
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
        return res.status(404).json({
          success: false,
          message: "Channel not found",
        });
      }

      const Page = parseInt(req.query.page as string) || 1;
      const Limit = parseInt(req.query.limit as string) || 10;

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
        orderBy: {
          createdAt: "asc",
        },
        skip: (Page - 1) * Limit,
        take: Limit,
      });

      const TotalMessages = await database.groupMessage.count({
        where: {
          channelId: FindChannel?.id,
        },
      });

      const TotalPages = Math.ceil(TotalMessages / Limit);
      const hasMoreData = Page < TotalPages;

      return res.status(200).json({
        success: true,
        message: "Messages fetched successfully",
        Data: {
          messages: Messages,
          totalPages: TotalPages,
          hasMoreData: hasMoreData,
        },
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while fetching messages",
      });
    }
  }
);
// * (4) creating a route for Editing Message
routes.put(
  "/EditMessage",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { message_id } = req.query;
      console.log(message_id);
      const { message } = req.body;
      if (!message_id || !message) return;
      const FindMessage = await database.groupMessage.findUnique({
        where: {
          id: message_id,
        },
      });
      if (!FindMessage) {
        return res.status(404).json({
          success: false,
          message: "Message not found",
        });
      }
      const UpdateMessage = await database.groupMessage.update({
        where: {
          id: message_id,
        },
        data: {
          content: message,
          IsEdited: true,
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
        message: "Message updated successfully",
        data: UpdateMessage,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while editing message",
      });
    }
  }
);
// * (5) creating a route for Deleting Message
routes.put(
  "/DeleteMessage",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { message_id } = req.query;
      const { content } = req.body;
      if (!message_id) return;
      const FindMessage = await database.groupMessage.findUnique({
        where: {
          id: message_id,
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
      if (!FindMessage) {
        return res.status(404).json({
          success: false,
          message: "Message not found",
        });
      }
      if (FindMessage?.member?.user?.id === req.user_id) {
        const DeleteMessage = await database.groupMessage.update({
          where: {
            id: message_id,
          },
          data: {
            IsDeleted: true,
            DeletedBy: req.user_id,
            content: "this message has been deleted",
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
          message: "Message deleted successfully",
          data: DeleteMessage,
        });
      } else {
        if (FindMessage?.channel?.userId === req.user_id) {
          const DeleteMessage = await database.groupMessage.update({
            where: {
              id: message_id,
            },
            data: {
              IsDeleted: true,
              DeletedBy: req.user_id,
              content: "this message has been deleted by admin",
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
            message: "Message deleted successfully",
            data: DeleteMessage,
          });
        }
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while deleting message",
      });
    }
  }
);

export default routes;
