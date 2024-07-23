import express from "express";
import {
  Server__Image__Uploader,
  Cloudinary_Cloud_Image_Uploader,
} from "../../middleware/MulterImageUploader";
import { database } from "../database";
import { body, validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import { ChannelType, MemberRole } from "@prisma/client";
import CheckAuthToken from "../../middleware/CheckAuthToken";
import multer from "multer";
import redis from "../Redis";
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
      if (await redis.exists(`server_info_${req.user_id}`)) {
        await redis.del(`server_info_${req.user_id}`);
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
        return console.error("Image upload failed");
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
//
//? Get All Servers
//
routes.get("/get-servers", CheckAuthToken, async (req: any, res: any) => {
  try {
    const cacheKey = `server_info_${req.user_id}`;
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
    await redis.set(cacheKey, JSON.stringify(server_info), "EX", 360);
    return res.status(200).json({ server_info, success: true });
  } catch (error) {
    console.log(error);
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
      if (await redis.exists(`server_info_${req.user_id}`)) {
        await redis.del(`server_info_${req.user_id}`);
      }
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

      if (Find_Server.members.some((member) => member.userId === req.user_id)) {
        return res.status(200).json({
          message: "You are already a member",
          success: true,
          allReadyInServer: true,
          Server_Id: Find_Server.id,
        });
      }

      await database.server.update({
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

      return res.status(200).json({
        message: "Server joined successfully",
        success: true,
        allReadyInServer: true,
        Server_Id: Find_Server.id,
      });
    } catch (error) {
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
        await database.server.update({
          where: {
            id: serverId,
          },
          data: {
            name: ServerName,
          },
        });
      } else {
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
          return console.error("Image upload failed");
        }
        await database.server.update({
          where: {
            id: serverId,
          },
          data: {
            name: ServerName,
            imageUrl: CloudServerImage?.secure_url as any,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: "Server info updated successfully",
      });
    } catch (error) {
      console.log(error);
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
        await database.member.update({
          where: {
            id: memberId,
            userId: user_Id,
          },
          data: {
            role: MemberRole.MODERATOR,
          },
        });

        return res.status(200).json({
          success: true,
          message: "Member role changed successfully from guest to moderator",
        });
      } else {
        await database.member.update({
          where: {
            id: memberId,
            AND: [{ userId: user_Id }, { serverId: serverId }],
          },
          data: {
            role: MemberRole.GUEST,
          },
        });
        return res.status(200).json({
          success: true,
          message: "Member role changed successfully from moderator to guest",
        });
      }
    } catch (error) {
      console.log(error);
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
      const { userId, memberId: memberId } = req.body as {
        userId: string;
        memberId: string;
      };
      await database.server.update({
        where: {
          id: serverId,
        },
        data: {
          members: {
            deleteMany: [{ userId: userId, id: memberId }],
          },
        },
      });
      res.status(200).json({
        message: "Member kicked out successfully",
        success: true,
        serverId: serverId,
        memberId: memberId,
        userId: userId,
        serverName: server_info.name,
      });
    } catch (error) {
      console.log(error);
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
    try {
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
          await database.server.update({
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
          });
          return res.status(200).json({
            message: "Channel created successfully",
            success: true,
          });
        }
      }
    } catch (error) {
      console.log(error);
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
      });

      return res.status(200).json({
        message: "Channel updated successfully",
        success: true,
      });
    } catch (error) {
      console.log(error);
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
      });
      return res.status(200).json({
        message: "Channel deleted successfully",
        success: true,
      });
    } catch (error) {
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
      const { userId, memberId: memberId } = req.body as {
        userId: string;
        memberId: string;
      };
      await database.server.update({
        where: {
          id: serverId,
        },
        data: {
          members: {
            deleteMany: [{ userId: userId, id: memberId }],
          },
        },
      });
      res
        .status(200)
        .json({ message: "Member Left successfully", success: true });
    } catch (error) {
      console.log(error);
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
      await database.server.delete({
        where: {
          id: serverId,
        },
      });
      return res.status(200).json({
        message: "Server deleted successfully",
        success: true,
        serverId: serverId,
        serverName: server.name,
        adminId: server.usersId,
      });
    } catch (error) {
      console.log(error);
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
      return res.status(200).json({
        success: true,
        text_channels: text_channels.channels,
      });
    } catch (error) {
      console.log(error);
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
      return res.status(200).json({
        success: true,
        audio_channels: audio_channels.channels,
      });
    } catch (error) {
      console.log(error);
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
      if (!video_channels) {
        return res.status(200).json({
          success: false,
          message: "unable to find video channels",
        });
      }
      return res.status(200).json({
        success: true,
        video_channels: video_channels.channels,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while Deleting The server",
      });
    }
  }
);
export default routes;
