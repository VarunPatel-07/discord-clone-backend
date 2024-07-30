import express from "express";
import CheckAuthToken from "../../middleware/CheckAuthToken";
import multer from "multer";
import { database } from "../database";

const routes = express.Router();

routes.post(
  "/SentFollowRequest",
  CheckAuthToken,
  //   multer().none(),
  async (req: any, res: any) => {
    try {
      const { UserIdYouWantToFollow } = req.body;
      const user = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
        include: {
          followers: true,
          following: true,
          requestReceived: true,
          requestsSend: true,
        },
      });
      console.log(user);
      if (!user) return;

      if (user.following.some((user) => user.id === UserIdYouWantToFollow)) {
        return res.status(400).json({
          success: false,
          message: " You Already following this user",
        });
      }
      if (user.requestsSend.some((user) => user.id === UserIdYouWantToFollow)) {
        return res.status(400).json({
          success: false,
          message: " You Already sent follow request to this user",
        });
      }
      const user1 = await database.user.update({
        where: {
          id: req.user_id,
        },
        data: {
          requestsSend: {
            connect: [
              {
                id: UserIdYouWantToFollow,
              },
            ],
          },
        },
        include: {
          followers: true,
          following: true,
          requestReceived: true,
          requestsSend: true,
        },
      });
      const user2 = await database.user.update({
        where: {
          id: UserIdYouWantToFollow,
        },
        data: {
          requestReceived: {
            connect: [
              {
                id: req.user_id,
              },
            ],
          },
        },
        include: {
          followers: true,
          following: true,
          requestReceived: true,
          requestsSend: true,
        },
      });

      console.log("user1", user1);
      console.log("user2", user2);
      return res.status(200).json({
        success: true,
        message: "Follow request sent successfully",
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while sending follow request",
      });
    }
  }
);
routes.get(
  "/FetchAllTheTypeOfUserFollowers/:userType",
  CheckAuthToken,
  async (req: any, res: any) => {
    try {
      const { userType } = req.params;

      if (!userType)
        return res.status(400).json({
          success: false,
          message: "userType is required",
        });
      if (userType === "online") {
        const user = await database.user.findMany({
          where: {
            Is_Online: true,
            NOT: {
              id: req.user_id,
            },
          },
        });
        if (!user)
          return res
            .status(400)
            .json({ success: false, message: "User not found" });
        return res.status(200).json({
          success: true,
          It_Is_Pending: false,
          user,
        });
      }
      if (userType === "all") {
        const user = await database.user.findMany({
          where: {
            NOT: {
              id: req.user_id,
            },
          },
        });
        if (!user)
          return res
            .status(400)
            .json({ success: false, message: "User not found" });
        return res.status(200).json({
          success: true,
          It_Is_Pending: false,
          user,
        });
      }
      if (userType === "blocked") {
        const user = await database.user.findUnique({
          where: {
            id: req.user_id,
          },
          include: {
            followers: true,
            following: true,
            requestReceived: true,
            requestsSend: true,
            blockedUsers: true,
          },
        });
        if (!user)
          return res
            .status(400)
            .json({ success: false, message: "User not found" });
        return res.status(200).json({
          success: true,
          It_Is_Pending: false,
          user: user?.blockedUsers,
        });
      }
      if (userType === "pending") {
        const user = await database.user.findUnique({
          where: {
            id: req.user_id,
          },
          include: {
            followers: true,
            following: true,
            requestReceived: true,
            requestsSend: true,
            blockedUsers: true,
          },
        });
        if (!user)
          return res
            .status(400)
            .json({ success: false, message: "User not found" });
        return res.status(200).json({
          success: true,
          It_Is_Pending: true,
          RequestSent: user?.requestsSend,
          RequestReceived: user?.requestReceived,
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message:
          "Internal server error while fetching the type of user followers",
      });
    }
  }
);
export default routes;
