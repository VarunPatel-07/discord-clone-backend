"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.database = void 0;
// importing the required modules
const client_1 = require("@prisma/client");
const dotenv_1 = require("dotenv");
// configuring the prisma client
(0, dotenv_1.configDotenv)();
exports.database = global.prisma || new client_1.PrismaClient();
if (process.env.NODE_ENV !== 'production')
    global.prisma = exports.database;
