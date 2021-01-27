'use strict';
const {
    AuthError
} = require('../utils/customErrors');
var encrypter = require('../utils/encryption')
require('dotenv').config()
module.exports = async function (socket, next) {
    if (socket.handshake.query && socket.handshake.query.token) {
        let recivedAppToken
        try {
            recivedAppToken =
                encrypter.decrypt(process.env.SECRET_PRIVATE_KEY, socket.handshake.query.token)
        } catch (error) {
            return next(new AuthError("Authentication error"));
        }
        if (recivedAppToken === process.env.SECRET_MOBILE_KEY) {
            return next()
        }
        return next(new AuthError("Authentication error"));
    }
    next(new AuthError('Authentication error'));
}