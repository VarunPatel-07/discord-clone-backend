import express from "express";
import passport from "passport";
import { Strategy as OAuthStrategy } from "passport-google-oauth20";

import { database } from "../database";
import jwt from "jsonwebtoken";
import RandomColorGenerator from "../Helper/RandomBgColorGenerator";
const router = express.Router();
const Jwt_Secret = process.env.JWT_SECRET_KEY as string;

passport.use(
  new OAuthStrategy(
    {
      clientID: process.env.SIGN_IN_WITH_GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.SIGN_IN_WITH_GOOGLE_CLIENT_SECRETE as string,
      callbackURL: process.env.SIGN_IN_WITH_GOOGLE_CALL_BACK_URL as string,
      scope: ["email", "profile"],
    },
    async (
      accessToken: string,
      refreshToken: string,
      profile: any,
      done: any
    ) => {
      try {
        const FindUser = await database.user.findUnique({
          where: {
            Email: profile._json.email,
          },
        });
        const Random_Integer = Math.floor(Math.random() * 100);

        if (!FindUser) {
          const CreateNewUser = await database.user.create({
            data: {
              FullName: profile._json.name as string,
              UserName: `${profile._json.given_name as string}_${
                Random_Integer > 9 ? Random_Integer : "0" + Random_Integer
              }`,
              Email: profile._json.email as string,
              Is_Email_Verified: profile._json.email_verified as boolean,
              Password: profile._json.sub as string,

              Profile_Picture: profile._json.picture as string,
              ProfileBgColor: RandomColorGenerator(),
              ProfileBanner_Img: "",
              ProfileBanner_Color: RandomColorGenerator(),
            },
          });

          done(null, CreateNewUser);
        } else {
          done(null, FindUser);
        }
      } catch (error) {
        console.log(error);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((user, done) => {
  done(null, user as any);
});
router.get(
  "/google",
  passport.authenticate("google", { scope: ["email", "profile"] })
);

router.get("/google/callback", passport.authenticate("google"), (req, res) => {
  if (!req.user) {
    return res.redirect("http://localhost:3000/pages/login");
  }

  const user = req.user as any;
  const AuthToken = jwt.sign({ user_id: user.id }, Jwt_Secret, {
    expiresIn: "15d",
  });

  const Frontend_URL = process.env.FRONTEND_REDIRECT_URL as string;
  return res
    .cookie("User_Authentication_Token", AuthToken, {
      maxAge: 15 * 24 * 60 * 60 * 1000,
    })
    .redirect(Frontend_URL);
});

export default router;
