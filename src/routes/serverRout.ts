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
import multer from "multer";
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

routes.get("/get-servers", CheckAuthToken, async (req: any, res: any) => {
  try {
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

routes.put(
  "/joinServerWithInviteCode",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      console.log(req.body);
      const { inviteCode } = req.body as { inviteCode: string };
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
      
      if (
        Find_Server.members.some((member: any) => member.userId === req.user_id)
      ) {
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
      const response = await database.server.update({
        where: {
          id: serverId,
        },
        data: {
          members: {
            delete: [{ userId: userId, id: memberId }],
          },
        },
      });
      res
        .status(200)
        .json({ message: "Member kicked out successfully", success: true });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while kicking out member from server",
      });
    }
  }
);
export default routes;
