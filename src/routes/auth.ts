import { configDotenv } from "dotenv";
configDotenv();
import express from "express";
import { body, validationResult } from "express-validator";
import { database } from "../database";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";
import CheckAuthToken from "../../middleware/CheckAuthToken";

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
    body("DateOfBirth").exists(),
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
        },
      });
      // now we have added the user to the database now we send the jwt token in return
      const AuthToken = jwt.sign({ user_id: user.id }, Jwt_Secret, {
        expiresIn: "15d",
      });
      return res
        .cookie("User_Authentication_Token", AuthToken)
        .status(200)
        .json({
          message: "User registered successfully",
          token: AuthToken,
          success: true,
        });
    } catch (error) {
      console.log(error);
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
      return res
        .cookie("User_Authentication_Token", AuthToken)
        .status(200)
        .json({
          message: "User logged in successfully",
          token: AuthToken,
          success: true,
        });
    } catch (error) {
      console.log(error);
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
      const user = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
      });
      if (!user) {
        return res
          .status(400)
          .json({ message: "User not found", success: false });
      }
      return res.status(200).json({ user, success: true });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while getting user details",
      });
    }
  }
);

export default router;
