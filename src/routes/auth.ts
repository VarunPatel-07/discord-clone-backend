import express from "express";
import { body, validationResult } from "express-validator";
import { database } from "../database";

const router = express.Router();

// creating a route for the user registration
router.post(
  "/register",
  [
    body("Email").isEmail(),
    body("Password").exists(),
    body("UserName").exists(),
    body("FullName").exists(),
    body("DateOfBirth").exists(),
  ],
  async (req: any, res: any) => {
    // // this is only to test remove it in production --code start --
    // await database.user.deleteMany();
    // // --code end --
    const { Email, Password, UserName, FullName, DateOfBirth } = req.body;
    //todo: (1) use bycrypt to hash the password
    // todo: (2) do not send the user_info send the jwt token
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
      const user = await database.user.create({
        data: {
          Email: Email,
          Password: Password,
          UserName: UserName,
          FullName: FullName,
          DateOfBirth: DateOfBirth,
        },
      });
      return res
        .status(200)
        .json({ message: "User registered successfully", user_info: user });
    } catch (error) {
      console.log(error);
      res
        .status(500)
        .json({ message: "Internal server error while registering user" });
    }
  }
);

export default router;
