import fs from "fs";
import { google } from "googleapis";
const SCOPES = ["https://www.googleapis.com/auth/drive"];

export const authenticateGoogle = () => {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,  // Use environment variable
    scopes: SCOPES,
  });
  return auth;
};

export const uploadFilesToTheGoogleDrive = async (file: any, auth: any) => {
  console.log(file); // Log the file object to verify the structure
  try {
    const fileMetaData = {
      name: file.originalname, // Original file name
      parents: [process.env.GOOGLE_CLOUD_PARENT_FOLDER_ID as string], // Parent folder ID in Google Drive
    };

    const media = {
      mimeType: file.mimetype, // File type, e.g., application/pdf
      body: file.buffer, // Pass the buffer directly
    };

    const driveService = google.drive({ version: "v3", auth });

    const response = await driveService.files.create({
      requestBody: fileMetaData,
      media: media,
      fields: "id", // Request only the file ID as a response
    });

    console.log("response", response);
    return response;
  } catch (error) {
    console.log("Error uploading to Google Drive:", error);
  }
};

module.exports = {
  authenticateGoogle,
  uploadFilesToTheGoogleDrive,
};
