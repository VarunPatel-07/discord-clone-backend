import express from "express";
import CheckAuthToken from "../../middleware/CheckAuthToken";
import multer from "multer";
import { database } from "../database";
import redis from "../Redis";
import {
  DeleteSpecificDataInRedis,
  StoreDataInRedis,
} from "../Helper/StorDataInRedis";

const routes = express.Router();
//
// * (1) creating a route to send follow request
//
routes.post(
  "/SendFollowRequest",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { UserIdYouWantToFollow } = req.body;
      if (!UserIdYouWantToFollow)
        return res.status(400).json({
          success: false,
          message: "UserIdYouWantToFollow is required",
        });
      const request_sender_key_string = `requestsSendStoredInCache_${req.user_id}`;
      const request_receiver_key_string = `requestsReceivedStoredInCache_${UserIdYouWantToFollow}`;
      await DeleteSpecificDataInRedis(request_sender_key_string);
      await DeleteSpecificDataInRedis(request_receiver_key_string);
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
      const request_sender = await database.user.update({
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
      const request_receiver = await database.user.update({
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

      return res.status(200).json({
        success: true,
        message: "Follow request sent successfully",
        request_sender_info: {
          id: request_sender.id,
          name: request_sender.FullName,
          UserName: request_sender.UserName,
          Profile_Picture: request_sender.Profile_Picture,
        },
        request_receiver_info: {
          id: request_receiver.id,
          name: request_receiver.FullName,
          UserName: request_receiver.UserName,
          Profile_Picture: request_receiver.Profile_Picture,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Internal server error while sending follow request",
      });
    }
  }
);
//
// * (2) Fetching The User Based On The Type Like [online , all , blocked]
//
routes.get(
  "/FetchAllTheTypeOfUserFollowers/:userType",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { userType } = req.params;
      if (!["online", "all", "blocked"].includes(userType)) {
        return res.status(400).json({
          success: false,
          message: "Not a valid userType",
        });
      }
      if (!userType)
        return res.status(400).json({
          success: false,
          message: "userType is required",
        });
      if (userType === "online") {
        const user = await database.user.findMany({
          where: {
            Is_Online: true,
            id: {
              not: req.user_id,
            },
            blockedBy: {
              none: {
                id: req.user_id,
              },
            },
            blockedUsers: {
              none: {
                id: req.user_id,
              },
            },

            followers: {
              none: {
                id: req.user_id,
              },
            },
          },
        });
        if (!user)
          return res
            .status(400)
            .json({ success: false, message: "User not found" });
        return res.status(200).json({
          success: true,
          user,
        });
      }
      if (userType === "all") {
        const user = await database.user.findMany({
          where: {
            id: {
              not: req.user_id,
            },
            blockedBy: {
              none: {
                id: req.user_id,
              },
            },
            blockedUsers: {
              none: {
                id: req.user_id,
              },
            },

            followers: {
              none: {
                id: req.user_id,
              },
            },
          },
        });
        if (!user)
          return res
            .status(400)
            .json({ success: false, message: "User not found" });
        return res.status(200).json({
          success: true,
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
          user: user?.blockedUsers,
        });
      }
    } catch (error) {
      // // // console.log(error);
      return res.status(500).json({
        success: false,
        message:
          "Internal server error while fetching the type of user followers",
      });
    }
  }
);
//
// * (3) Fetching All The Sent Requests OF The User
//
routes.get(
  "/FetchAllTheSentRequestsOfUser",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const key_string = `requestsSendStoredInCache_${req.user_id}`;
      const sentRequestsInCache = await redis.get(key_string);

      if (sentRequestsInCache) {
        return res.status(200).json({
          success: true,
          message: " he,lllllll find all the sent requests in cache",
          sent_requests: JSON.parse(sentRequestsInCache as string),
        });
      }
      const user = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
        include: {
          requestsSend: true,
        },
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: "User not found",
        });
      }

      await StoreDataInRedis(key_string, user.requestsSend);
      return res.status(200).json({
        success: true,
        message: "find all the sent requests",
        sent_requests: user?.requestsSend,
      });
    } catch (error) {
      // // // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while fetching sent requests",
      });
    }
  }
);
//
// * (4) Fetching All The Received Requests OF The User
//
routes.get(
  "/FetchAllTheReceivedRequestsOfUser",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const key_string = `requestsReceivedStoredInCache_${req.user_id}`;
      const receivedRequestsInCache = await redis.get(key_string);
      if (receivedRequestsInCache) {
        return res.status(200).json({
          success: true,
          message: "find all the received requests in cache",
          received_requests: JSON.parse(receivedRequestsInCache),
        });
      }
      const user = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
        include: {
          requestReceived: true,
        },
      });
      if (!user) {
        return res.status(400).json({
          success: false,
          message: "User not found",
        });
      }
      await StoreDataInRedis(key_string, user.requestReceived);
      return res.status(200).json({
        success: true,
        message: "find all the received requests",
        received_requests: user?.requestReceived,
      });
    } catch (error) {
      // // // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while fetching received requests",
      });
    }
  }
);
//
// * (5) Fetching All The Follower Of The User
//
routes.get(
  "/FetchAllTheFollowersOfUser",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const key_string = `followersStoredInCache_${req.user_id}`;
      const followersInCache = await redis.get(key_string);
      if (followersInCache) {
        return res.status(200).json({
          success: true,
          message: "find all the followers in cache",
          followers: JSON.parse(followersInCache),
        });
      }
      const user = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
        include: {
          followers: {
            where: {
              blockedBy: {
                none: {
                  id: req.user_id,
                },
              },
              blockedUsers: {
                none: {
                  id: req.user_id,
                },
              },
            },
          },
        },
      });
      // // // console.log(user);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: "User not found",
        });
      }

      await StoreDataInRedis(key_string, user.followers);
      return res.status(200).json({
        success: true,
        message: "find all the followers",
        followers: user?.followers,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Internal server error while fetching followers",
      });
    }
  }
);
//
// * (6) Fetching All The Following Of The User
//
routes.get(
  "/FetchAllTheFollowingOfUser",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const key_string = `followingStoredInCache_${req.user_id}`;
      const followingInCache = await redis.get(key_string);
      if (followingInCache) {
        return res.status(200).json({
          success: true,
          message: "find all the following in cache",
          following: JSON.parse(followingInCache),
        });
      }
      const user = await database.user.findUnique({
        where: {
          id: req.user_id,
        },

        include: {
          following: {
            where: {
              blockedUsers: {
                none: {
                  id: req.user_id,
                },
              },
              blockedBy: {
                none: {
                  id: req.user_id,
                },
              },
            },
          },
        },
      });
      // // // console.log(user);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: "User not found",
        });
      }

      await StoreDataInRedis(key_string, user.following);
      return res.status(200).json({
        success: true,
        message: "find all the following",
        following: user?.following,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Internal server error while fetching following",
      });
    }
  }
);
//
// * (7) This  Route Is Used To Accept The Follow Request Of The User
//
routes.put(
  "/AcceptTheFollowRequestOfTheUser",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { receiverId } = req.body;
      const sender_key_sent_req = `requestsSendStoredInCache_${req.user_id}`;
      const sender_key_received_req = `requestsReceivedStoredInCache_${req.user_id}`;
      const sender_key_followers = `followersStoredInCache_${req.user_id}`;
      const sender_key_following = `followingStoredInCache_${req.user_id}`;
      const receiver_key_sent_req = `requestsSendStoredInCache_${receiverId}`;
      const receiver_key_received_req = `requestsReceivedStoredInCache_${receiverId}`;
      const receiver_key_followers = `followersStoredInCache_${receiverId}`;
      const receiver_key_following = `followingStoredInCache_${receiverId}`;
      //   for sender
      await DeleteSpecificDataInRedis(sender_key_sent_req);
      await DeleteSpecificDataInRedis(sender_key_received_req);
      // for receiver
      await DeleteSpecificDataInRedis(receiver_key_sent_req);
      await DeleteSpecificDataInRedis(receiver_key_received_req);
      await DeleteSpecificDataInRedis(sender_key_followers);
      await DeleteSpecificDataInRedis(sender_key_following);
      await DeleteSpecificDataInRedis(receiver_key_followers);
      await DeleteSpecificDataInRedis(receiver_key_following);
      if (!receiverId) {
        return res.status(400).json({
          success: false,
          message: "receiverId is required",
        });
      }
      const request_accepter = await database.user.update({
        where: {
          id: req.user_id,
        },
        data: {
          requestReceived: {
            disconnect: [
              {
                id: receiverId,
              },
            ],
          },
          followers: {
            connect: [
              {
                id: receiverId,
              },
            ],
          },
        },
      });
      const request_sender = await database.user.update({
        where: {
          id: receiverId,
        },
        data: {
          requestsSend: {
            disconnect: [
              {
                id: req.user_id,
              },
            ],
          },
          following: {
            connect: [
              {
                id: req.user_id,
              },
            ],
          },
        },
      });

      const notification = await database.notification.findFirst({
        where: {
          senderId: request_sender?.id,
          receiverId: request_accepter?.id,
        },
      });
      if (notification) {
        await database.notification.delete({
          where: {
            id: notification?.id,
          },
        });
      }
      return res.status(200).json({
        success: true,
        message: "Follow request accepted successfully",
        request_accepter_info: {
          id: request_accepter.id,
          name: request_accepter.FullName,
          UserName: request_accepter.UserName,
          Profile_Picture: request_accepter.Profile_Picture,
        },
        request_sender_info: {
          id: request_sender.id,
          name: request_sender.FullName,
          UserName: request_sender.UserName,
          Profile_Picture: request_sender.Profile_Picture,
        },
      });
    } catch (error) {
      // // // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while accepting the follow request",
      });
    }
  }
);
//
// * (8) This  Route Is Used To Withdraw The Follow Request Of The User
//
routes.put(
  "/WithdrawTheFollowRequest",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { receiverId } = req.body;

      if (!receiverId)
        return res.status(400).json({
          success: false,
          message: "receiverId is required",
        });

      //
      // ? Now We will check that the user have any data in the cache or not and if have then we will delete that data from the cache
      //
      const sender_key_sent_req = `requestsSendStoredInCache_${req.user_id}`;
      const sender_key_received_req = `requestsReceivedStoredInCache_${req.user_id}`;
      const receiver_key_sent_req = `requestsSendStoredInCache_${receiverId}`;
      const receiver_key_received_req = `requestsReceivedStoredInCache_${receiverId}`;
      //   for sender
      await DeleteSpecificDataInRedis(sender_key_sent_req);
      await DeleteSpecificDataInRedis(sender_key_received_req);
      // for receiver
      await DeleteSpecificDataInRedis(receiver_key_sent_req);
      await DeleteSpecificDataInRedis(receiver_key_received_req);
      //
      // ? Now The Main Logic code of this API
      //
      const request_sender = await database.user.update({
        where: {
          id: req.user_id,
        },
        data: {
          requestsSend: {
            disconnect: [
              {
                id: receiverId,
              },
            ],
          },
        },
      });

      const request_receiver = await database.user.update({
        where: {
          id: receiverId,
        },
        data: {
          requestReceived: {
            disconnect: [
              {
                id: req.user_id,
              },
            ],
          },
        },
      });
      const notification = await database.notification.findFirst({
        where: {
          AND: [{ senderId: req.user_id }, { receiverId: receiverId }],
        },
      });
      if (notification) {
        await database.notification.delete({
          where: {
            id: notification.id,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: "Request withdrawn successfully",
        request_sender_info: {
          id: request_sender.id,
          name: request_sender.FullName,
          UserName: request_sender.UserName,
          Profile_Picture: request_sender.Profile_Picture,
        },
        request_receiver_info: {
          id: request_receiver.id,
          name: request_receiver.FullName,
          UserName: request_receiver.UserName,
          Profile_Picture: request_receiver.Profile_Picture,
        },
      });
    } catch (error) {
      // // // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while withdrawing the follow request",
      });
    }
  }
);
//
// * (9) This  Route Is Used To Ignore The Follow Request From The User
//
routes.put(
  "/IgnoreTheFollowRequestFromTheUser",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { senderId } = req.body;

      if (!senderId || senderId === "undefined")
        return res.status(400).json({
          success: false,
          message: "receiverId is required",
        });
      const sender_key_sent_req = `requestsSendStoredInCache_${senderId}`;
      const sender_key_received_req = `requestsReceivedStoredInCache_${senderId}`;
      const receiver_key_sent_req = `requestsSendStoredInCache_${req.user_id}`;
      const receiver_key_received_req = `requestsReceivedStoredInCache_${req.user_id}`;
      //   for sender
      await DeleteSpecificDataInRedis(sender_key_sent_req);
      await DeleteSpecificDataInRedis(sender_key_received_req);
      // for receiver
      await DeleteSpecificDataInRedis(receiver_key_sent_req);
      await DeleteSpecificDataInRedis(receiver_key_received_req);
      const request_sender = await database.user.update({
        where: {
          id: senderId,
        },
        data: {
          requestsSend: {
            disconnect: [
              {
                id: req.user_id,
              },
            ],
          },
        },
      });
      const request_receiver = await database.user.update({
        where: {
          id: req.user_id,
        },
        data: {
          requestReceived: {
            disconnect: [
              {
                id: senderId,
              },
            ],
          },
        },
      });

      const notification = await database.notification.findFirst({
        where: {
          AND: [{ senderId: senderId }, { receiverId: req.user_id }],
        },
      });
      if (notification) {
        await database.notification.delete({
          where: {
            id: notification.id,
          },
        });
      }
      return res.status(200).json({
        success: true,
        message: "Request ignored successfully",
      });
    } catch (error) {
      // // // console.log(error);
      res.status(500).json({
        success: false,
        message: "Internal server error while ignoring the follow request",
      });
    }
  }
);
//
// * (10) This Route Is Used To Unfollow The Specific User
//
routes.put(
  "/UnfollowTheSpecificUser",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { followerId } = req.body;
      if (!followerId || followerId === "undefined")
        return res.status(400).json({
          success: false,
          message: "followerId is required",
        });
      const sender_key_followers = `followersStoredInCache_${followerId}`;
      const sender_key_following = `followingStoredInCache_${followerId}`;
      const receiver_key_followers = `followersStoredInCache_${req.user_id}`;
      const receiver_key_following = `followingStoredInCache_${req.user_id}`;
      await DeleteSpecificDataInRedis(sender_key_followers);
      await DeleteSpecificDataInRedis(sender_key_following);
      await DeleteSpecificDataInRedis(receiver_key_followers);
      await DeleteSpecificDataInRedis(receiver_key_following);

      const unfollowing_initiator = await database.user.update({
        where: {
          id: req.user_id,
        },
        data: {
          following: {
            disconnect: [
              {
                id: followerId,
              },
            ],
          },
        },
      });
      if (!unfollowing_initiator)
        return res.status(400).json({
          success: false,
          message: "Something went wrong while unfollowing the user",
        });
      const unfollowing_receiver = await database.user.update({
        where: {
          id: followerId,
        },
        data: {
          followers: {
            disconnect: [
              {
                id: req.user_id,
              },
            ],
          },
        },
      });

      if (!unfollowing_receiver)
        return res.status(400).json({
          success: false,
          message: "Something went wrong while unfollowing the user",
        });
      return res.status(200).json({
        success: true,
        message: "Unfollowed successfully",
      });
    } catch (error) {
      // // // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while unfollowing the user",
      });
    }
  }
);
//
// * (11) This Route  Is Used To  Remove A Specific Follower From Your Following List
//
routes.put(
  "/RemoveFollowerFromYourFollowerList",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { followerId } = req.body;
      if (!followerId || followerId === "undefined")
        return res.status(400).json({
          success: false,
          message: "followerId is required",
        });
      const sender_key_followers = `followersStoredInCache_${followerId}`;
      const sender_key_following = `followingStoredInCache_${followerId}`;
      const receiver_key_followers = `followersStoredInCache_${req.user_id}`;
      const receiver_key_following = `followingStoredInCache_${req.user_id}`;
      await DeleteSpecificDataInRedis(sender_key_followers);
      await DeleteSpecificDataInRedis(sender_key_following);
      await DeleteSpecificDataInRedis(receiver_key_followers);
      await DeleteSpecificDataInRedis(receiver_key_following);
      const following_remover = await database.user.update({
        where: {
          id: req.user_id,
        },
        data: {
          followers: {
            disconnect: [
              {
                id: followerId,
              },
            ],
          },
        },
      });
      const removed_follower = await database.user.update({
        where: {
          id: followerId,
        },
        data: {
          following: {
            disconnect: [
              {
                id: req.user_id,
              },
            ],
          },
        },
      });
      return res.status(200).json({
        success: true,
        message: "Follower removed successfully",
      });
    } catch (error) {
      // // // console.log(error);
      return res.status(500).json({
        success: false,
        message:
          "Internal server error while removing the follower from your following list",
      });
    }
  }
);
//
// * (12) This Rout Is Used To Block The Specific User
//
routes.put(
  "/BlockASpecificUser/:BlockUserId",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      // // console.log(req.params);
      const { BlockUserId } = req.params;
      if (!BlockUserId || BlockUserId === "undefined")
        return res.status(400).json({
          success: false,
          message: "userId is required",
        });
      const sender_key_followers = `followersStoredInCache_${BlockUserId}`;
      const sender_key_following = `followingStoredInCache_${BlockUserId}`;
      const receiver_key_followers = `followersStoredInCache_${req.user_id}`;
      const receiver_key_following = `followingStoredInCache_${req.user_id}`;
      await DeleteSpecificDataInRedis(sender_key_followers);
      await DeleteSpecificDataInRedis(sender_key_following);
      await DeleteSpecificDataInRedis(receiver_key_followers);
      await DeleteSpecificDataInRedis(receiver_key_following);
      const block_user_initiator = await database.user.update({
        where: {
          id: req.user_id,
        },
        data: {
          blockedUsers: {
            connect: {
              id: BlockUserId,
            },
          },
        },
      });
      const block_user_receiver = await database.user.update({
        where: {
          id: BlockUserId,
        },
        data: {
          blockedBy: {
            connect: {
              id: req.user_id,
            },
          },
        },
      });

      return res.status(200).json({
        success: true,
        message: "User blocked successfully",
      });
    } catch (error) {
      // // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while blocking the user",
      });
    }
  }
);
//
// * (13) This Rout Is Used To Un Block The Specific User
//
routes.put(
  "/UnBlockASpecificUser/:UnBlockUserId",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { UnBlockUserId } = req.params;
      if (!UnBlockUserId || UnBlockUserId === "undefined")
        return res.status(400).json({
          success: false,
          message: "userId is required",
        });
      const sender_key_followers = `followersStoredInCache_${UnBlockUserId}`;
      const sender_key_following = `followingStoredInCache_${UnBlockUserId}`;
      const receiver_key_followers = `followersStoredInCache_${req.user_id}`;
      const receiver_key_following = `followingStoredInCache_${req.user_id}`;
      await DeleteSpecificDataInRedis(sender_key_followers);
      await DeleteSpecificDataInRedis(sender_key_following);
      await DeleteSpecificDataInRedis(receiver_key_followers);
      await DeleteSpecificDataInRedis(receiver_key_following);
      const unblock_user_initiator = await database.user.update({
        where: {
          id: req.user_id,
        },
        data: {
          blockedUsers: {
            disconnect: {
              id: UnBlockUserId,
            },
          },
        },
      });
      const unblock_user_receiver = await database.user.update({
        where: {
          id: UnBlockUserId,
        },
        data: {
          blockedBy: {
            disconnect: {
              id: req.user_id,
            },
          },
        },
      });
      // // console.log(unblock_user_initiator, unblock_user_receiver);
      return res.status(200).json({
        success: true,
        message: "User unblocked successfully",
      });
    } catch (error) {
      // // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while unblocking the user",
      });
    }
  }
);

export default routes;
