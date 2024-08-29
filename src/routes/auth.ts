import { configDotenv } from "dotenv";
configDotenv();
import express from "express";
import { body, validationResult } from "express-validator";
import { database } from "../database";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";
import CheckAuthToken from "../../middleware/CheckAuthToken";
import redis from "../Redis";
import RandomColorGenerator from "../Helper/RandomBgColorGenerator";
import { DeleteSpecificDataInRedis } from "../Helper/StorDataInRedis";
import {
  Profile_Picture_Uploader,
  Upload_Image_In_Compressed_Format,
} from "../../middleware/MulterImageUploader";

const slatRound = process.env.SALT_ROUNDS as string;

const Jwt_Secret = process.env.JWT_SECRET_KEY as string;
const router = express.Router();

// creating a route for the user registration

// * (1) creating a route for the user registration
router.post(
  "/register",
  multer().none(),
  [
    body("Email").isEmail(),
    body("Password").exists(),
    body("UserName").exists(),
    body("FullName").exists(),
  ],
  async (req: any, res: any) => {
    const { Email, Password, UserName, FullName } = req.body;

    try {
      const result = validationResult(req);
      if (!result.isEmpty()) {
        return res.status(400).json({ errors: result });
      }
      const check_user = await database.user.findUnique({
        where: {
          UserName: UserName,
        },
      });
      if (check_user) {
        return res.status(400).json({ message: "User already exists" });
      }
      const salt = bcrypt.genSaltSync(Number(slatRound));
      const hashPassword = bcrypt.hashSync(Password, salt);
      const user = await database.user.create({
        data: {
          Email: Email as string,
          Password: hashPassword as string,
          UserName: UserName as string,
          FullName: FullName as string,
          Profile_Picture: "",
          ProfileBgColor: RandomColorGenerator(),
          ProfileBanner_Img: "",
          ProfileBanner_Color: RandomColorGenerator(),
        },
      });
      // now we have added the user to the database now we send the jwt token in return
      const AuthToken = jwt.sign({ user_id: user.id }, Jwt_Secret, {
        expiresIn: "15d",
      });

      const Frontend_URL = process.env.FRONTEND_REDIRECT_URL as string;
      return res
        .cookie("User_Authentication_Token", AuthToken, {
          maxAge: 15 * 24 * 60 * 60 * 1000,
        })
        .redirect(Frontend_URL);
    } catch (error) {
      // // // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while registering user",
      });
    }
  }
);
// * (2) creating a route for the user login
router.post(
  "/login",
  multer().none(),
  [
    body("UserName", "UserName is required").exists(),
    body("Password", "Password is required").exists(),
  ],
  async (req: any, res: any) => {
    const { UserName, Password } = req.body;
    try {
      const result = validationResult(req);
      if (!result.isEmpty()) {
        return res.status(400).json({ errors: result });
      }
      const check_user = await database.user.findUnique({
        where: {
          UserName: UserName as string,
        },
      });
      if (!check_user) {
        return res.status(400).json({ message: "User does not exist" });
      }
      const check_password = await bcrypt.compare(
        Password,
        check_user.Password
      );
      if (!check_password) {
        return res.status(400).json({ message: "Incorrect password" });
      }
      const AuthToken = jwt.sign({ user_id: check_user.id }, Jwt_Secret, {
        expiresIn: "15d",
      });

      const Frontend_URL = process.env.FRONTEND_REDIRECT_URL as string;
      return res
        .cookie("User_Authentication_Token", AuthToken, {
          maxAge: 15 * 24 * 60 * 60 * 1000,
        })
        .redirect(Frontend_URL);
    } catch (error) {
      // // // console.log(error);
      return res.status(500).json({
        message: "Internal server error while logging in user",
        success: false,
      });
    }
  }
);
// * (3) checking that user contain valid auth token
router.get(
  "/check-user",
  multer().none(),
  CheckAuthToken,
  async (req: any, res: any) => {
    if (req.user_id) {
      const is_user_exist = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
      });

      if (is_user_exist) {
        return res
          .status(200)
          .json({ success: true, message: "User authenticated" });
      } else {
        return res
          .status(401)
          .json({ success: false, message: "User not authenticated" });
      }
    }
    return res
      .status(401)
      .json({ success: false, message: "User not authenticated" });
  }
);
router.get(
  "/userDetails",
  multer().none(),
  CheckAuthToken,
  async (req: any, res: any) => {
    try {
      const Cache_info = await redis.get(req.user_id);
      if (Cache_info) {
        return res.status(200).json({
          user: JSON.parse(Cache_info),
          success: true,
          message: "User found in cache",
        });
      } else {
        const user = await database.user.findUnique({
          where: {
            id: req.user_id,
          },
          include: {
            followers: true,
            following: true,
          },
        });
        // // // // console.log(user);
        if (!user) {
          return res
            .status(400)
            .json({ message: "User not found", success: false });
        }
        await redis.set(req.user_id, JSON.stringify(user), "EX", 360);
        return res.status(200).json({ user, success: true });
      }
    } catch (error) {
      // // // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while getting user details",
      });
    }
  }
);
router.put(
  "/updateUserDetails",
  CheckAuthToken,
  Profile_Picture_Uploader,
  async (req: any, res: any) => {
    try {
      // // // console.log(req.body);
      const user = await database.user.findUnique({
        where: { id: req.user_id },
      });
      if (!user) {
        return res
          .status(400)
          .json({ message: "User not found", success: false });
      }
      const imageArr = req.files;
      const Cache_Key = req.user_id;
      await DeleteSpecificDataInRedis(Cache_Key);
      const { UserName, FullName, Email, ProfileBanner_Color, ProfileBgColor } =
        req.body;
      const update_user_info = {
        UserName: user.UserName as string,
        FullName: user.FullName as string,
        Email: user.Email as string,
        Profile_Picture: user.Profile_Picture as string,
        ProfileBanner_Img: user.ProfileBanner_Img as string,
        ProfileBanner_Color: user.ProfileBanner_Color as string,
        ProfileBgColor: user.ProfileBgColor as string,
      };
      // // // console.log("update_user_info", update_user_info);
      if (UserName !== "") update_user_info.UserName = UserName;
      if (FullName !== "") update_user_info.FullName = FullName;
      if (Email !== "") update_user_info.Email = Email;
      if (ProfileBgColor !== "")
        update_user_info.ProfileBgColor = ProfileBgColor;
      if (ProfileBanner_Color !== "")
        update_user_info.ProfileBanner_Color = ProfileBanner_Color;

      if (imageArr.profilePicture || imageArr.ProfileBannerImage) {
        if (!imageArr.ProfileBannerImage && imageArr.profilePicture) {
          const BufferProfilePicture = Buffer.from(
            imageArr.profilePicture[0].buffer
          ).toString("base64");
          const CloudProfilePicture: any =
            await Upload_Image_In_Compressed_Format(
              BufferProfilePicture,
              96,
              96
            );
          if (!CloudProfilePicture) {
            return console.error("Image upload failed");
          }
          update_user_info.Profile_Picture =
            CloudProfilePicture?.secure_url as any;

          const updated_user = await database.user.update({
            where: {
              id: req.user_id,
            },
            data: update_user_info,
          });

          return res.status(200).json({
            success: true,
            message: "User details updated successfully",
            user: updated_user,
          });
        } else if (!imageArr.profilePicture && imageArr.ProfileBannerImage) {
          const BufferBannerImage = Buffer.from(
            imageArr.ProfileBannerImage[0].buffer
          ).toString("base64");
          const CloudBannerImage: any = await Upload_Image_In_Compressed_Format(
            BufferBannerImage,
            150,
            500
          );
          if (!CloudBannerImage) {
            return console.error("Image upload failed");
          }
          update_user_info.ProfileBanner_Img =
            CloudBannerImage?.secure_url as any;

          const updated_user = await database.user.update({
            where: {
              id: req.user_id,
            },
            data: update_user_info,
          });

          return res.status(200).json({
            success: true,
            message: "User details updated successfully",
            user: updated_user,
          });
        } else {
          const BufferBannerImage = Buffer.from(
            imageArr.ProfileBannerImage[0].buffer
          ).toString("base64");
          const CloudBannerImage: any = await Upload_Image_In_Compressed_Format(
            BufferBannerImage,
            1920,
            400
          );
          if (!CloudBannerImage) {
            return console.error("Image upload failed");
          }
          update_user_info.ProfileBanner_Img =
            CloudBannerImage?.secure_url as any;
          const BufferProfilePicture = Buffer.from(
            imageArr.profilePicture[0].buffer
          ).toString("base64");
          const CloudProfilePicture: any =
            await Upload_Image_In_Compressed_Format(
              BufferProfilePicture,
              96,
              96
            );
          if (!CloudProfilePicture) {
            return console.error("Image upload failed");
          }
          update_user_info.Profile_Picture =
            CloudProfilePicture?.secure_url as any;
          const updated_user = await database.user.update({
            where: {
              id: req.user_id,
            },
            data: update_user_info,
          });

          // // // console.log("updated user", updated_user);

          return res.status(200).json({
            success: true,
            message: "User details updated successfully",
            user: updated_user,
          });
        }
      }

      const updated_user = await database.user.update({
        where: {
          id: req.user_id,
        },
        data: update_user_info,
      });
      return res.status(200).json({
        success: true,
        message: "User details updated successfully",
        user: updated_user,
      });
    } catch (error) {
      // // // console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while updating user details",
      });
    }
  }
);

export default router;
