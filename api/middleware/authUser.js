'use strict';
const jwt = require('jsonwebtoken');
const {
    AuthError
} = require('../utils/customErrors');
require('dotenv').config();
var userDAO = require('../dao/userDAO');

module.exports = async function (socket, next) {

    if (socket.handshake.query && socket.handshake.query.token) {
        let isVeryfiedUser = await userDAO.verifyAuthToken(socket.handshake.query.token)
        console.log(socket.handshake.query.token)
        if (isVeryfiedUser === null) {
            console.log("verifyAuthToken=", "failed");
            return next(new AuthError("Authentication error"));
        }
        jwt.verify(socket.handshake.query.token, process.env.SECRET_JWT_KEY, function (err, _decoded) {

            if (err) {
                console.log("Query: ", "unauthorized");
                return next(new AuthError("Authentication error"));
            }
            socket.user = isVeryfiedUser;

            next();
        });
    } else {
        return next(new AuthError("Authentication error"));
    }


}