import express from "express";
import { database } from "../database";
import multer from "multer";
import CheckAuthToken from "../../middleware/CheckAuthToken";
import { body, validationResult } from "express-validator";
import CryptoJS from "crypto-js";
import redis from "../Redis";
import { StoreDataInRedis } from "../Helper/StorDataInRedis";
import { CloudImageUploader, UploadMultiImageToTheCloudFunction } from "../../middleware/MulterImageUploader";
import { MessageType } from "../enum/enum";

interface ImageFilesProps {
  fieldname: String;
  originalname: String;
  encoding: String;
  mimetype: String;
  buffer: Buffer;
  size: Number;
}

const SECRET_KEY = process.env.ENCRYPTION_KEY as string;

const routes = express.Router();

// * (1) creating a route for Sending Message In The Selected Channel in The Server
routes.post(
  "/sendMessageInTheSelectedChannel",
  CheckAuthToken,
  multer().none(),
  [
    body("content").exists().withMessage("content is required"),
    body("server_id").exists().withMessage("server_id is required"),
    body("channel_id").exists().withMessage("channel_id is required"),
  ],
  async (req: any, res: any) => {
    try {
      const result = validationResult(req);
      if (!result.isEmpty()) {
        return res.status(400).json({ errors: result });
      }
      const { server_id, channel_id, content } = req.body;

      const MatchTheCacheKey = `ChannelMessages:${server_id}:${channel_id}:page-*`;
      const CacheInfo = await redis.keys(MatchTheCacheKey);
      for (const key of CacheInfo) {
        await redis.del(key);
      }

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

      const Member = FindServer.members.find((member: any) => member.userId === req.user_id);

      if (!Member) {
        return res.status(404).json({
          success: false,
          message: "Member not found",
        });
      }

      // Encrypt the content before saving
      const encryptedContent = CryptoJS.AES.encrypt(content, SECRET_KEY).toString();

      const CreateChat = await database.groupMessage.create({
        data: {
          content: encryptedContent, // Store encrypted content
          FileURL: "", // Assuming no file is attached
          memberId: Member.id, // Member ID should be valid
          channelId: FindChannel?.id || "", // Ensure channel ID is a valid string
          ImageUrl: "",
        },
        include: {
          member: {
            include: {
              user: true,
            },
          },
          channel: {
            include: {
              server: {
                include: {
                  members: true,
                },
              },
            },
          },
          replyingToUser: {
            include: {
              user: true,
            },
          },
        },
      });

      // Decrypt the content for the response

      return res.status(200).json({
        success: true,
        message: "Message sent successfully",
        data: CreateChat,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Internal server error while creating group chat",
      });
    }
  }
);
// * (2) creating a route for Fetching Messages Of The Channel
routes.get("/FetchingMessagesOfChannel", CheckAuthToken, multer().none(), async (req: any, res: any) => {
  try {
    if (!req.query.server_id || !req.query.channel_id) {
      return res.status(400).json({
        success: false,
        message: "server_id and channel_id are required",
      });
    }
    const Page = parseInt(req.query.page as string) || 1;
    const Limit = parseInt(req.query.limit as string) || 10;
    const { server_id, channel_id } = req.query;

    const Cache_Key = `ChannelMessages:${server_id}:${channel_id}:page-${Page}`;
    const getCacheData = await redis.get(Cache_Key);
    if (getCacheData) {
      return res.status(200).json({
        success: true,
        message: "Messages fetched successfully from cache",
        Data: JSON.parse(getCacheData),
      });
    }

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
        replyingToUser: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: (Page - 1) * Limit,
      take: Limit,
    });

    const TotalMessages = await database.groupMessage.count({
      where: {
        channelId: FindChannel?.id,
      },
    });
    if (Messages.length < 1)
      return res.status(200).json({
        success: false,
        message: "no message",
      });
    const TotalPages = Math.ceil(TotalMessages / Limit);
    const hasMoreData = Page < TotalPages;
    const CacheData = {
      messages: Messages,
      totalPages: TotalPages,
      hasMoreData: hasMoreData,
    };
    StoreDataInRedis(Cache_Key, CacheData);
    return res.status(200).json({
      success: true,
      message: "Messages fetched successfully",
      Data: CacheData,
    });
  } catch (error) {
    // // console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching messages",
    });
  }
});
// * (3) creating a route for Editing Message
routes.put("/EditMessage", CheckAuthToken, multer().none(), async (req: any, res: any) => {
  try {
    const { message_id } = req.query;
    // // console.log(message_id);
    const { message } = req.body;
    if (!message_id || !message) return;
    const FindMessage = await database.groupMessage.findUnique({
      where: {
        id: message_id,
      },
      include: {
        channel: {
          include: {
            server: true,
          },
        },
      },
    });

    if (!FindMessage) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    const encryptedContent = CryptoJS.AES.encrypt(message, SECRET_KEY).toString();

    const MatchTheCacheKey = `ChannelMessages:${FindMessage?.channel?.server?.id}:${FindMessage?.channel?.id}:page-*`;
    const CacheInfo = await redis.keys(MatchTheCacheKey);
    for (const key of CacheInfo) {
      await redis.del(key);
    }

    const UpdateMessage = await database.groupMessage.update({
      where: {
        id: message_id,
      },
      data: {
        content: encryptedContent,
        IsEdited: true,
      },
      include: {
        member: {
          include: {
            user: true,
          },
        },
        channel: true,
        replyingToUser: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Message updated successfully",
      data: UpdateMessage,
    });
  } catch (error) {
    // // console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while editing message",
    });
  }
});
// * (4) creating a route for Deleting Message
routes.delete("/DeleteMessage", CheckAuthToken, multer().none(), async (req: any, res: any) => {
  try {
    const { message_id } = req.query;
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
        channel: {
          include: {
            server: true,
          },
        },
      },
    });
    if (!FindMessage) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }
    const MatchTheCacheKey = `ChannelMessages:${FindMessage?.channel?.server?.id}:${FindMessage?.channel?.id}:page-*`;
    const CacheInfo = await redis.keys(MatchTheCacheKey);
    for (const key of CacheInfo) {
      await redis.del(key);
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
          ImageUrl: "",
          FileURL: "",
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
            ImageUrl: "",
            FileURL: "",
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
    // // console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while deleting message",
    });
  }
});
// * (5) creating a route for Replying Message
routes.put(
  "/ReplayMessage",
  CheckAuthToken,
  multer().none(),
  [
    body("server_id").exists().withMessage("server_id is required"),
    body("channel_id").exists().withMessage("channel_id is required"),
    body("content").exists().withMessage("content is required"),
    body("replying_to_message").exists().withMessage("replying_to_message is required"),
    body("replying_to_user_member_id").exists().withMessage(" Replying_to_user_member_id is required"),
    body("replying_message_message_id").exists().withMessage("replying_message_message_id is required"),
  ],
  async (req: any, res: any) => {
    try {
      const {
        server_id,
        channel_id,
        content,
        replying_to_message,
        replying_to_user_member_id,
        replying_message_message_id,
        replyingImage,
      } = req.body;

      const result = validationResult(req);
      if (!result.isEmpty()) {
        return res.status(400).json({ errors: result });
      }
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

      const MatchTheCacheKey = `ChannelMessages:${server_id}:${channel_id}:page-*`;
      const CacheInfo = await redis.keys(MatchTheCacheKey);
      for (const key of CacheInfo) {
        await redis.del(key);
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
      const Member = FindServer.members.find((member: any) => member.userId === req.user_id);
      if (!Member) {
        return res.status(404).json({
          success: false,
          message: "Member not found",
        });
      }
      const user = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
      });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      const encryptedMessage_replay = CryptoJS.AES.encrypt(content, SECRET_KEY).toString();
      const CreateChat = await database.groupMessage.create({
        data: {
          content: encryptedMessage_replay,
          channelId: channel_id,
          memberId: Member?.id,
          Is_Reply: true,
          replyingMessage: replying_to_message,
          replyingMessageMessageId: replying_message_message_id,
          replyingToUser_MemberId: replying_to_user_member_id,
          replyingImage: replyingImage,
          ImageUrl: "",
          FileURL: "",
        },
        include: {
          channel: true,
          member: {
            include: {
              user: true,
            },
          },
          replyingToUser: {
            include: {
              user: true,
            },
          },
        },
      });

      return res.status(200).json({
        success: true,
        message: "Message replied successfully",
        data: CreateChat,
      });
    } catch (error) {
      // // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while creating group chat",
      });
    }
  }
);
routes.post(
  "/messageWithImages",
  CheckAuthToken,
  multer().none(),
  [
    body("server_id").exists().withMessage("server_id is required"),
    body("channel_id").exists().withMessage("channel_id is require"),
    body("imageUrl").exists().withMessage("stringyFyImagesArray is required"),
  ],
  async (req: any, res: any) => {
    try {
      const result = validationResult(req);
      if (!result.isEmpty()) {
        return res.status(400).json({ errors: result });
      }
      const { server_id, channel_id, content, imageUrl, imageMessageId } = req.body;
      console.log(imageMessageId);
      const MatchTheCacheKey = `ChannelMessages:${server_id}:${channel_id}:page-*`;
      const CacheInfo = await redis.keys(MatchTheCacheKey);
      for (const key of CacheInfo) {
        await redis.del(key);
      }
      const find_Server = await database.server.findUnique({
        where: {
          id: server_id,
        },
        include: {
          channels: true,
          members: true,
        },
      });
      if (!find_Server) {
        return res.status(404).json({
          success: false,
          message: "no such server found",
        });
      }
      if (!find_Server.channels.some((channel) => channel.id === channel_id))
        return res.status(404).json({
          success: false,
          message: "no such channel found in the server",
        });

      const Member = find_Server.members.find((member) => member.userId === req.user_id);
      if (!Member)
        return res.status(404).json({
          success: false,
          message: "no such members found in the server",
        });
      const encryptedMessage_replay = CryptoJS.AES.encrypt(content, SECRET_KEY).toString();
      const stringyFyImagesArray = JSON.stringify([imageUrl]);
      if (imageMessageId == "") {
        const CreateChat = await database.groupMessage.create({
          data: {
            channelId: channel_id,
            memberId: Member.id,
            ImageUrl: stringyFyImagesArray,
            content: content === "" ? "" : encryptedMessage_replay,
            FileURL: "",
            MessageType: MessageType.IMAGE || "IMAGE",
          },
          include: {
            member: {
              include: {
                user: true,
              },
            },
            channel: {
              include: {
                server: {
                  include: {
                    members: true,
                  },
                },
              },
            },
            replyingToUser: {
              include: {
                user: true,
              },
            },
          },
        });

        return res.status(200).json({
          success: true,
          message: "Message sent successfully",
          data: CreateChat,
        });
      } else {
        const message = await database.groupMessage.findUnique({
          where: {
            id: imageMessageId,
          },
        });
        if (message) {
          let previousImages;

          if (typeof message.ImageUrl === "string") {
            // If ImageUrl is a string, parse it
            previousImages = JSON.parse(message.ImageUrl);
          } else {
            // If ImageUrl is already an array, use it directly
            previousImages = message.ImageUrl;
          }

          // Add the new image URL to the array
          previousImages.push(imageUrl);

          // Convert the array back to a JSON string before updating
          const updatedMessage = await database.groupMessage.update({
            where: {
              id: imageMessageId,
            },
            data: {
              ImageUrl: JSON.stringify(previousImages), // Convert array back to JSON string
            },
            include: {
              member: {
                include: {
                  user: true,
                },
              },
              channel: {
                include: {
                  server: {
                    include: {
                      members: true,
                    },
                  },
                },
              },
              replyingToUser: {
                include: {
                  user: true,
                },
              },
            },
          });

          return res.status(200).json({
            success: true,
            message: "Message sent successfully",
            data: updatedMessage,
          });
        }
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while creating message with images chat",
      });
    }
  }
);
routes.post(
  "/sendFilesInTheChat",
  CheckAuthToken,
  multer().none(),
  [
    body("server_id").exists().withMessage("server_id is required"),
    body("channel_id").exists().withMessage("channel_id is require"),
    body("stringyFyFilesArray").exists().withMessage("stringyFyImagesArray is required"),
  ],
  async (req: any, res: any) => {
    try {
      const result = validationResult(req);
      if (!result.isEmpty()) {
        return res.status(400).json({ errors: result });
      }
      const { server_id, channel_id, content, stringyFyFilesArray } = req.body;
      console.log(stringyFyFilesArray);
      const MatchTheCacheKey = `ChannelMessages:${server_id}:${channel_id}:page-*`;
      const CacheInfo = await redis.keys(MatchTheCacheKey);
      for (const key of CacheInfo) {
        await redis.del(key);
      }
      const find_Server = await database.server.findUnique({
        where: {
          id: server_id,
        },
        include: {
          channels: true,
          members: true,
        },
      });
      if (!find_Server) {
        return res.status(404).json({
          success: false,
          message: "no such server found",
        });
      }
      if (!find_Server.channels.some((channel) => channel.id === channel_id))
        return res.status(404).json({
          success: false,
          message: "no such channel found in the server",
        });

      const Member = find_Server.members.find((member) => member.userId === req.user_id);
      if (!Member)
        return res.status(404).json({
          success: false,
          message: "no such members found in the server",
        });
      const encryptedMessage_replay = CryptoJS.AES.encrypt(content, SECRET_KEY).toString();
      const CreateChat = await database.groupMessage.create({
        data: {
          channelId: channel_id,
          memberId: Member.id,
          ImageUrl: "",
          content: content === "" ? "" : encryptedMessage_replay,
          FileURL: stringyFyFilesArray,
        },
        include: {
          member: {
            include: {
              user: true,
            },
          },
          channel: {
            include: {
              server: {
                include: {
                  members: true,
                },
              },
            },
          },
          replyingToUser: {
            include: {
              user: true,
            },
          },
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
        message: "Internal server error while creating message with images chat",
      });
    }
  }
);
export default routes;
