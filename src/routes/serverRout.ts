import express from "express";
import {
  Server__Image__Uploader,
  Cloudinary_Cloud_Image_Uploader,
  Upload_Image_In_Compressed_Format,
} from "../../middleware/MulterImageUploader";
import { database } from "../database";
import { body, validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import { ChannelType, MemberRole } from "@prisma/client";
import CheckAuthToken from "../../middleware/CheckAuthToken";
import multer from "multer";
import redis from "../Redis";
import {
  DeleteSpecificDataInRedis,
  StoreDataInRedis,
} from "../Helper/StorDataInRedis";
import RandomColorGenerator from "../Helper/RandomBgColorGenerator";
const routes = express.Router();
//
//? CREATE SERVER
//
routes.post(
  "/create-server",
  Server__Image__Uploader,
  CheckAuthToken,
  [body("ServerName", "ServerName is required").exists()],
  async (req: any, res: any) => {
    try {
      if (await redis.exists(`multiple_server_info_${req.user_id}`)) {
        await redis.del(`multiple_server_info_${req.user_id}`);
      }
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

      const Group_Admin = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
      });

      const ServerImageBs64 = Buffer.from(
        imageArr.serverImage[0].buffer
      ).toString("base64");

      const CloudServerImage: any = await Upload_Image_In_Compressed_Format(
        ServerImageBs64,
        96,
        96
      );

      if (!CloudServerImage) {
        return console.error("Image upload failed");
      }

      const server = await database.server.create({
        data: {
          name: ServerName,
          imageUrl: CloudServerImage?.secure_url as any,
          inviteCode: uuidv4(),
          usersId: Group_Admin?.id as any,
          ServerBannerColor: RandomColorGenerator(),
          ServerBannerImg: "",

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
//
//? Get All Servers
//
routes.get("/get-servers", CheckAuthToken, async (req: any, res: any) => {
  try {
    const cacheKey = `multiple_server_info_${req.user_id}`;
    const cacheServerInfo = await redis.get(cacheKey);

    if (cacheServerInfo) {
      // If cached data exists, parse it and return
      return res
        .status(200)
        .json({ server_info: JSON.parse(cacheServerInfo), success: true });
    }
    const server_info = await database.server.findMany({
      where: {
        members: {
          some: {
            userId: req.user_id,
          },
        },
      },
    });
    if (!server_info) {
      return res
        .status(400)
        .json({ message: "No server found", success: false });
    }
    // Cache the server information for future requests

    StoreDataInRedis(cacheKey, server_info);
    return res.status(200).json({ server_info, success: true });
  } catch (error) {
    // console.log(error);
  }
});
//
//? GET SERVER INFO WITH SERVER ID
//
routes.get(
  "/serverInfo/:serverId",
  CheckAuthToken,
  async (req: any, res: any) => {
    try {
      const { serverId } = req.params as { serverId: string };
      const cache_server_key = `single_server_${serverId}`;
      const cacheServerInfo = await redis.get(cache_server_key);
      if (cacheServerInfo) {
        // If cached data exists, parse it and return
        return res
          .status(200)
          .json({ Server__Info: JSON.parse(cacheServerInfo), success: true });
      }
      const Server__Info = await database.server.findUnique({
        where: {
          id: serverId,
        },
        include: {
          channels: true,
          members: {
            include: {
              user: true,
            },
            orderBy: {
              role: "asc",
            },
          },
        },
      });
      StoreDataInRedis(cache_server_key, Server__Info);
      return res.status(200).json({ Server__Info, success: true });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Internal server error while getting server info",
      });
    }
  }
);
//
//? REGENERATE SERVER INVITE CODE
//
routes.put(
  "/regenerateInviteCode",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { serverId } = req.body as { serverId: string };
      const multiple_server_info = `multiple_server_info_${req.user_id}`;
      DeleteSpecificDataInRedis(multiple_server_info);
      const cache_server_key = `single_server_${serverId}`;
      DeleteSpecificDataInRedis(cache_server_key);
      if (!serverId) {
        return res
          .status(400)
          .json({ message: "serverId is required", success: false });
      }
      const Server__Info = await database.server.update({
        where: {
          id: serverId,
        },
        data: {
          inviteCode: uuidv4(),
        },
      });
      StoreDataInRedis(multiple_server_info, Server__Info);
      const Invite_Code = Server__Info.inviteCode;
      return res.status(200).json({ Invite_Code, success: true });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Internal server error while updating the server invite code ",
      });
    }
  }
);
//
//? JOIN SERVER WITH INVITE CODE
//
routes.put(
  "/joinServerWithInviteCode",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { inviteCode } = req.body as { inviteCode: string };
      const multiple_server_info = `multiple_server_info_${req.user_id}`;
      const user = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
        include: {
          servers: true,
        },
      });
      DeleteSpecificDataInRedis(multiple_server_info);
      if (!inviteCode) {
        return res
          .status(400)
          .json({ message: "inviteCode is required", success: false });
      }
      const Find_Server = await database.server.findUnique({
        where: {
          inviteCode: inviteCode,
        },
        include: {
          channels: true,
          members: true,
        },
      });

      if (!Find_Server) {
        return res
          .status(400)
          .json({ message: "Server not found", success: false });
      }

      const server_cache = `single_server_${Find_Server.id}`;
      DeleteSpecificDataInRedis(server_cache);

      if (Find_Server.members.some((member) => member.userId === req.user_id)) {
        return res.status(200).json({
          message: "You are already a member",
          success: true,
          allReadyInServer: true,
          Server_Id: Find_Server.id,
        });
      }

      const Updated_Server = await database.server.update({
        where: {
          id: Find_Server.id,
        },
        data: {
          members: {
            create: [
              {
                userId: req.user_id,
                role: MemberRole.GUEST,
              },
            ],
          },
        },
      });

      StoreDataInRedis(server_cache, Updated_Server);

      return res.status(200).json({
        message: "Server joined successfully",
        success: true,
        allReadyInServer: false,
        Server_Id: Find_Server.id,
        UserInfo: {
          userId: req.user_id,
          FullName: user?.FullName,
          UserName: user?.UserName,
          Profile_Picture: user?.Profile_Picture,
          ProfileBgColor: user?.ProfileBgColor,
        },
      });
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while joining server with invite code",
      });
    }
  }
);
//
//? UPDATE SERVER INFO
//
routes.put(
  "/updateServerInfo",
  Server__Image__Uploader,
  CheckAuthToken,
  [body("ServerName", "ServerName is required").exists()],
  async (req: any, res: any) => {
    try {
      const imageArr = req.files;

      const { serverId, ServerName } = req.body as {
        serverId: string;
        ServerName: string;
      };

      const multiple_server_info = `multiple_server_info_${req.user_id}`;
      const cache_server_key = `single_server_${serverId}`;
      DeleteSpecificDataInRedis(multiple_server_info);
      DeleteSpecificDataInRedis(cache_server_key);

      const server_info = await database.server.findUnique({
        where: {
          id: serverId,
        },
      });
      if (!server_info) {
        return res.status(404).json({
          success: false,
          message: "Server not found",
        });
      }
      if (server_info?.usersId != req.user_id) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to update this server info",
        });
      }

      if (!imageArr.serverImage) {
        const server_info = await database.server.update({
          where: {
            id: serverId,
          },
          data: {
            name: ServerName,
          },
        });
        StoreDataInRedis(cache_server_key, server_info);
      } else {
        const ServerImageBs64 = Buffer.from(
          imageArr.serverImage[0].buffer
        ).toString("base64");

        const CloudServerImage: any = await Upload_Image_In_Compressed_Format(
          ServerImageBs64,
          96,
          96
        );

        if (!CloudServerImage) {
          return console.error("Image upload failed");
        }
        const server_info = await database.server.update({
          where: {
            id: serverId,
          },
          data: {
            name: ServerName,
            imageUrl: CloudServerImage?.secure_url as any,
          },
        });
        StoreDataInRedis(cache_server_key, server_info);
      }

      return res.status(200).json({
        success: true,
        message: "Server info updated successfully",
      });
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while updating server info",
      });
    }
  }
);
//
//? CHANGE MEMBER ROLE
//
routes.put(
  "/changeMemberRole/:serverId",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { serverId } = req.params;
      const multiple_server_info = `multiple_server_info_${req.user_id}`;
      const cache_server_key = `single_server_${serverId}`;
      DeleteSpecificDataInRedis(multiple_server_info);
      DeleteSpecificDataInRedis(cache_server_key);
      const { memberId, CurrentMemberRole, user_Id } = req.body as {
        memberId: string;
        CurrentMemberRole: MemberRole;
        user_Id: string;
      };

      const server_info = await database.server.findUnique({
        where: {
          id: serverId,
        },
        include: {
          members: {
            include: {
              user: true,
            },
            orderBy: {
              role: "asc",
            },
          },
        },
      });

      if (!server_info) {
        return res.status(404).json({
          success: false,
          message: "Server not found",
        });
      }
      if (server_info?.usersId != req.user_id) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to update this server info",
        });
      }
      if (CurrentMemberRole == "GUEST") {
        const updated_info = await database.member.update({
          where: {
            id: memberId,
            userId: user_Id,
          },
          data: {
            role: MemberRole.MODERATOR,
          },
        });
        StoreDataInRedis(cache_server_key, updated_info);
        return res.status(200).json({
          success: true,
          message: "Member role changed successfully from guest to moderator",
          server_id: updated_info.serverId,
        });
      } else {
        const updated_info = await database.member.update({
          where: {
            id: memberId,
            AND: [{ userId: user_Id }, { serverId: serverId }],
          },
          data: {
            role: MemberRole.GUEST,
          },
        });
        StoreDataInRedis(cache_server_key, updated_info);
        return res.status(200).json({
          success: true,
          message: "Member role changed successfully from moderator to guest",
          server_id: updated_info.serverId,
        });
      }
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while updating server info",
      });
    }
  }
);
//
//? KICK OUT MEMBER FROM SERVER
//
routes.put(
  "/kickOutMemberFromServer/:serverId",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { serverId } = req.params as { serverId: string };
      const { userId, memberId: memberId } = req.body as {
        userId: string;
        memberId: string;
      };
      const multiple_server_info = `multiple_server_info_${req.user_id}`;
      const cache_server_key = `single_server_${serverId}`;
      DeleteSpecificDataInRedis(multiple_server_info);
      DeleteSpecificDataInRedis(cache_server_key);
      const server_info = await database.server.findUnique({
        where: {
          id: serverId,
        },
      });

      if (!server_info) {
        return res.status(404).json({
          success: false,
          message: "Server not found",
        });
      }
      if (server_info?.usersId != req.user_id) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to kick out member from server",
        });
      }

      const server = await database.server.update({
        where: {
          id: serverId,
        },
        data: {
          members: {
            deleteMany: [{ userId: userId, id: memberId }],
          },
        },
      });

      StoreDataInRedis(cache_server_key, server);
      res.status(200).json({
        message: "Member kicked out successfully",
        success: true,
        serverId: serverId,
        memberId: memberId,
        userId: userId,
        serverName: server_info.name,
      });
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while kicking out member from server",
      });
    }
  }
);
//
//? CREATE NEW CHANNEL
//
routes.put(
  "/createNewChannel/:serverId",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    const { ChannelName, ChannelType } = req.body;
    const { serverId } = req.params;
    try {
      const multiple_server_info = `multiple_server_info_${req.user_id}`;
      const cache_server_key = `single_server_${serverId}`;
      DeleteSpecificDataInRedis(cache_server_key);
      DeleteSpecificDataInRedis(multiple_server_info);
      if (ChannelType == "TEXT") {
        const cache_channel_key = `text_channel_${serverId}`;
        DeleteSpecificDataInRedis(cache_channel_key);
      }
      if (ChannelType == "AUDIO") {
        const cache_channel_key = `audio_channel_${serverId}`;
        DeleteSpecificDataInRedis(cache_channel_key);
      }
      if (ChannelType == "VIDEO") {
        const cache_channel_key = `video_channel_${serverId}`;
        DeleteSpecificDataInRedis(cache_channel_key);
      }
      const server_info = await database.server.findUnique({
        where: {
          id: req.params.serverId,
        },
        include: {
          members: {
            include: {
              user: true,
            },
          },
          channels: true,
        },
      });
      if (
        server_info?.members.some(
          (member: any) => member.userId === req.user_id
        )
      ) {
        if (
          server_info?.members.some(
            (member: any) => member.role === MemberRole.ADMIN
          ) ||
          server_info?.members.some(
            (member: any) => member.role === MemberRole.MODERATOR
          )
        ) {
          const updated_info = await database.server.update({
            where: {
              id: req.params.serverId,
            },
            data: {
              channels: {
                create: [
                  {
                    type: ChannelType,
                    name: ChannelName,
                    userId: req.user_id,
                  },
                ],
              },
            },
            include: {
              members: true,
              channels: true,
            },
          });

          if (ChannelType == "TEXT") {
            const cache_channel_key = `text_channel_${serverId}`;
            StoreDataInRedis(cache_channel_key, updated_info.channels);
          }
          if (ChannelType == "AUDIO") {
            const cache_channel_key = `audio_channel_${serverId}`;
            StoreDataInRedis(cache_channel_key, updated_info.channels);
          }
          if (ChannelType == "VIDEO") {
            const cache_channel_key = `video_channel_${serverId}`;
            StoreDataInRedis(cache_channel_key, updated_info.channels);
          }
          StoreDataInRedis(cache_server_key, updated_info);
          return res.status(200).json({
            message: "Channel created successfully",
            success: true,
          });
        }
      }
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        message: "Internal server error while creating new channel",
        success: false,
      });
    }
  }
);
//
//? UPDATE CHANNEL
//
routes.put(
  "/updateChannel/:serverId",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { serverId } = req.params as { serverId: string };
      const { ChannelName, ChannelType, channelId } = req.body;
      const text_channel_key = `text_channel_${serverId}`;
      const audio_channel_key = `audio_channel_${serverId}`;
      const video_channel_key = `video_channel_${serverId}`;
      await DeleteSpecificDataInRedis(text_channel_key);
      await DeleteSpecificDataInRedis(audio_channel_key);
      await DeleteSpecificDataInRedis(video_channel_key);
      // Validate ChannelType
      const validChannelTypes = ["TEXT", "AUDIO", "VIDEO"];
      if (!validChannelTypes.includes(ChannelType)) {
        return res.status(400).json({
          success: false,
          message: "Invalid channel type",
        });
      }

      const server = await database.server.findUnique({
        where: {
          id: serverId,
        },
        include: {
          channels: true,
          members: true,
        },
      });

      if (!server) {
        return res.status(404).json({
          success: false,
          message: "Server not found",
        });
      }

      if (server.usersId != req.user_id) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to delete this server",
        });
      }
      await database.server.update({
        where: {
          id: serverId,
        },
        data: {
          channels: {
            update: {
              where: {
                id: channelId,
              },
              data: {
                name: ChannelName,
                type: ChannelType,
              },
            },
          },
        },
        include: {
          channels: true,
        },
      });

      return res.status(200).json({
        message: "Channel updated successfully",
        success: true,
      });
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while updating channel",
      });
    }
  }
);

//
//? DELETE CHANNEL
//
routes.delete(
  "/deleteChannel/:serverId",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { serverId } = req.params as { serverId: string };
      const { channelId } = req.body;
      const text_channel_key = `text_channel_${serverId}`;
      const audio_channel_key = `audio_channel_${serverId}`;
      const video_channel_key = `video_channel_${serverId}`;
      await DeleteSpecificDataInRedis(text_channel_key);
      await DeleteSpecificDataInRedis(audio_channel_key);
      await DeleteSpecificDataInRedis(video_channel_key);
      const server = await database.server.findUnique({
        where: {
          id: serverId,
        },
        include: {
          channels: true,
        },
      });
      if (!server) {
        return res.status(404).json({
          success: false,
          message: "Server not found",
        });
      }
      if (server.usersId != req.user_id) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to delete this server",
        });
      }
      const channelExists = server.channels.some(
        (channel) => channel.id === channelId
      );
      if (!channelExists) {
        return res.status(404).json({
          success: false,
          message: "Channel not found or does not belong to this server",
        });
      }
      await database.server.update({
        where: {
          id: serverId,
        },
        data: {
          channels: {
            delete: {
              id: channelId,
            },
          },
        },
        include: {
          channels: true,
        },
      });

      return res.status(200).json({
        message: "Channel deleted successfully",
        success: true,
      });
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while deleting channel",
      });
    }
  }
);
//
//? LEAVE SERVER
//
routes.put(
  "/LeaveServer/:serverId",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { serverId } = req.params as { serverId: string };
      const multiple_server_info = `multiple_server_info_${req.user_id}`;
      const cache_server_key = `single_server_${serverId}`;
      DeleteSpecificDataInRedis(cache_server_key);
      DeleteSpecificDataInRedis(multiple_server_info);
      const { userId, memberId: memberId } = req.body as {
        userId: string;
        memberId: string;
      };
      const updated_info = await database.server.update({
        where: {
          id: serverId,
        },
        data: {
          members: {
            deleteMany: [{ userId: userId, id: memberId }],
          },
        },
      });
      StoreDataInRedis(cache_server_key, updated_info);
      res
        .status(200)
        .json({ message: "Member Left successfully", success: true });
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while Leaving The server",
      });
    }
  }
);
//
//? DELETE SERVER
//
routes.delete(
  "/deleteServer/:serverId",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { serverId } = req.params as { serverId: string };
      const multiple_server_info = `multiple_server_info_${req.user_id}`;
      const cache_server_key = `single_server_${serverId}`;
      DeleteSpecificDataInRedis(cache_server_key);
      DeleteSpecificDataInRedis(multiple_server_info);
      const server = await database.server.findUnique({
        where: {
          id: serverId,
        },
      });
      if (!server) {
        return res.status(404).json({
          success: false,
          message: "Server not found",
        });
      }
      if (server.usersId != req.user_id) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to delete this server",
        });
      }
      const updated_info = await database.server.delete({
        where: {
          id: serverId,
        },
      });
      StoreDataInRedis(cache_server_key, updated_info);
      return res.status(200).json({
        message: "Server deleted successfully",
        success: true,
        serverId: serverId,
        serverName: server.name,
        adminId: server.usersId,
      });
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while Deleting The server",
      });
    }
  }
);
//
//? Fetch Text Channel From Server With Server Id
//
routes.get(
  "/FetchTextChannel/:serverId",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { serverId } = req.params as { serverId: string };

      const cache_channel_key = `text_channel_${serverId}`;
      const CacheTextChannel: any = await redis.get(cache_channel_key);

      if (CacheTextChannel) {
        // If cached data exists, parse it and return
        return res.status(200).json({
          text_channels: JSON.parse(CacheTextChannel),
          success: true,
          message: "info from cache",
        });
      }
      const text_channels = await database.server.findUnique({
        where: {
          id: serverId,
        },
        include: {
          channels: {
            where: {
              type: ChannelType.TEXT,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });
      if (!text_channels) {
        return res.status(200).json({
          success: false,
          message: "unable to find text channels",
        });
      }
      StoreDataInRedis(cache_channel_key, text_channels.channels);
      return res.status(200).json({
        success: true,
        text_channels: text_channels.channels,
      });
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while Deleting The server",
      });
    }
  }
);
//
//? Fetch Audio Channel From Server With Server Id
//
routes.get(
  "/FetchAudioChannel/:serverId",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { serverId } = req.params as { serverId: string };
      const cache_audio_channel_key = `audio_channel_${serverId}`;
      const CacheAudioChannel = await redis.get(cache_audio_channel_key);
      // // console.log("CacheAudioChannel", CacheAudioChannel);
      if (CacheAudioChannel) {
        // If cached data exists, parse it and return
        return res.status(200).json({
          audio_channels: JSON.parse(CacheAudioChannel),
          success: true,
          message: "info from cache",
        });
      }
      const audio_channels = await database.server.findUnique({
        where: {
          id: serverId,
        },
        include: {
          channels: {
            where: {
              type: ChannelType.AUDIO,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });
      if (!audio_channels) {
        return res.status(200).json({
          success: false,
          message: "unable to find audio channels",
        });
      }
      StoreDataInRedis(cache_audio_channel_key, audio_channels.channels);
      return res.status(200).json({
        success: true,
        audio_channels: audio_channels.channels,
      });
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while Deleting The server",
      });
    }
  }
);
//
//? Fetch Video Channel From Server With Server Id
//
routes.get(
  "/FetchVideoChannel/:serverId",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { serverId } = req.params as { serverId: string };
      const cache_video_channel_key = `video_channel_${serverId}`;
      const CacheVideoChannel: any = await redis.get(cache_video_channel_key);

      if (CacheVideoChannel) {
        // If cached data exists, parse it and return
        return res.status(200).json({
          video_channels: JSON.parse(CacheVideoChannel),
          success: true,
          message: "info from cache",
        });
      }
      const video_channels = await database.server.findUnique({
        where: {
          id: serverId,
        },
        include: {
          channels: {
            where: {
              type: ChannelType.VIDEO,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });
      // // console.log("video_channels", video_channels);
      if (!video_channels) {
        return res.status(200).json({
          success: false,
          message: "unable to find video channels",
        });
      }
      StoreDataInRedis(cache_video_channel_key, video_channels.channels);
      return res.status(200).json({
        success: true,
        video_channels: video_channels.channels,
      });
    } catch (error) {
      // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while Deleting The server",
      });
    }
  }
);
export default routes;
